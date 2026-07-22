import asyncio
import time
import logging
from collections import deque
from typing import Dict, Optional

logger = logging.getLogger("neethimitra.rate_limiter")


# ── Rate limit constants from Sarvam docs ─────────────────────────────────────
# Source: https://docs.sarvam.ai/api/getting-started/ratelimits

class PlanLimits:
    """Starter plan limits — update if upgrading to Pro/Business."""
    LLM_RPM          = 40    # sarvam-30b
    STT_REST_RPM     = 60    # saaras:v3 REST
    STT_BATCH_RPM    = 20    # saaras:v3 batch
    TTS_RPM          = 30    # bulbul:v3 Starter (NOT 60 — confirmed lower)
    TRANSLATION_RPM  = 60    # mayura:v1
    BUFFER           = 2     # safety margin — never use 100% of limit


# ── Per-user limits (your own policy, not Sarvam's) ──────────────────────────

class UserLimits:
    """
    Per-user request limits to prevent a single user from consuming
    your entire Sarvam quota. Applied BEFORE the global Sarvam limiter.
    """
    GUEST_LLM_RPM   = 5     # guests  — 5 LLM calls/min max
    GUEST_STT_RPM   = 10    # guests  — 10 STT calls/min max
    GUEST_TTS_RPM   = 5     # guests  — 5 TTS calls/min max
    AUTH_LLM_RPM    = 15    # authed  — 15 LLM calls/min
    AUTH_STT_RPM    = 30    # authed  — 30 STT calls/min
    AUTH_TTS_RPM    = 15    # authed  — 15 TTS calls/min


# ── Core sliding-window limiter ───────────────────────────────────────────────

class SarvamRateLimiter:
    """
    Async sliding-window rate limiter.
    Thread-safe via asyncio.Lock.
    Tracks stats (total calls, waits, wait time) for the monitoring endpoint.
    """

    def __init__(self, max_requests: int, window_seconds: int = 60, name: str = ""):
        self.max_requests = max_requests
        self.window = window_seconds
        self.name = name or f"limiter({max_requests}/min)"
        self._requests: deque = deque()
        self._lock = asyncio.Lock()
        # Stats
        self._total_calls: int = 0
        self._total_waits: int = 0
        self._total_wait_time: float = 0.0

    async def acquire(self, timeout: float = 30.0) -> bool:
        """
        Acquire a rate limit slot.
        Blocks until a slot is available or timeout is exceeded.
        Returns True on success, False on timeout.
        """
        deadline = time.monotonic() + timeout

        async with self._lock:
            while True:
                now = time.monotonic()

                if now > deadline:
                    logger.warning(
                        "[%s] Rate limit acquire timed out after %.1fs",
                        self.name, timeout,
                    )
                    return False

                # Evict expired timestamps
                while self._requests and self._requests[0] < now - self.window:
                    self._requests.popleft()

                if len(self._requests) < self.max_requests:
                    self._requests.append(now)
                    self._total_calls += 1
                    return True

                # At capacity — calculate sleep
                oldest = self._requests[0]
                wait_time = self.window - (now - oldest) + 0.05  # 50ms buffer
                logger.debug(
                    "[%s] At capacity (%d/%d). Waiting %.2fs",
                    self.name, len(self._requests), self.max_requests, wait_time,
                )
                self._total_waits += 1
                self._total_wait_time += wait_time

                # Release lock while sleeping so other coroutines can proceed
                self._lock.release()
                try:
                    await asyncio.sleep(wait_time)
                finally:
                    await self._lock.acquire()

    def current_usage(self) -> dict:
        """Return current usage stats for the monitoring endpoint."""
        now = time.monotonic()
        active = sum(1 for t in self._requests if t >= now - self.window)
        return {
            "limiter": self.name,
            "active_requests": active,
            "max_requests": self.max_requests,
            "utilization_pct": round(active / self.max_requests * 100, 1),
            "total_calls": self._total_calls,
            "total_waits": self._total_waits,
            "avg_wait_ms": round(
                (self._total_wait_time / self._total_waits * 1000)
                if self._total_waits > 0 else 0, 1
            ),
        }


# ── Per-user limiter registry ─────────────────────────────────────────────────

class PerUserLimiter:
    """
    Maintains a separate SarvamRateLimiter per user_id.
    Automatically evicts limiters for users idle > 5 minutes to prevent
    unbounded memory growth.
    """

    def __init__(self, guest_rpm: int, auth_rpm: int, name: str = ""):
        self.guest_rpm = guest_rpm
        self.auth_rpm = auth_rpm
        self.name = name
        self._limiters: Dict[str, SarvamRateLimiter] = {}
        self._last_seen: Dict[str, float] = {}
        self._lock = asyncio.Lock()
        self._eviction_task: Optional[asyncio.Task] = None

    async def start(self) -> None:
        """Start background eviction task. Call from FastAPI lifespan startup."""
        self._eviction_task = asyncio.create_task(self._evict_idle())
        logger.info("[%s] PerUserLimiter started", self.name)

    async def stop(self) -> None:
        """Stop background eviction task. Call from FastAPI lifespan shutdown."""
        if self._eviction_task:
            self._eviction_task.cancel()
            try:
                await self._eviction_task
            except asyncio.CancelledError:
                pass
        logger.info("[%s] PerUserLimiter stopped", self.name)

    async def acquire(
        self,
        user_id: str,
        is_guest: bool = True,
        timeout: float = 10.0,
    ) -> bool:
        async with self._lock:
            if user_id not in self._limiters:
                rpm = self.guest_rpm if is_guest else self.auth_rpm
                self._limiters[user_id] = SarvamRateLimiter(
                    max_requests=rpm,
                    name=f"{self.name}:{user_id[:12]}",
                )
            self._last_seen[user_id] = time.monotonic()
            limiter = self._limiters[user_id]

        return await limiter.acquire(timeout=timeout)

    async def _evict_idle(self) -> None:
        """Remove limiters for users idle > 5 minutes."""
        while True:
            await asyncio.sleep(60)
            now = time.monotonic()
            async with self._lock:
                idle = [
                    uid for uid, last in self._last_seen.items()
                    if now - last > 300  # 5 minutes
                ]
                for uid in idle:
                    del self._limiters[uid]
                    del self._last_seen[uid]
                if idle:
                    logger.debug("[%s] Evicted %d idle user limiters", self.name, len(idle))

    def active_user_count(self) -> int:
        return len(self._limiters)


# ── Global Sarvam API limiters (account-wide) ─────────────────────────────────

llm_limiter = SarvamRateLimiter(
    max_requests=PlanLimits.LLM_RPM - PlanLimits.BUFFER,
    name="sarvam:llm",
)
stt_limiter = SarvamRateLimiter(
    max_requests=PlanLimits.STT_REST_RPM - PlanLimits.BUFFER,
    name="sarvam:stt_rest",
)
stt_batch_limiter = SarvamRateLimiter(
    max_requests=PlanLimits.STT_BATCH_RPM - PlanLimits.BUFFER,
    name="sarvam:stt_batch",
)
tts_limiter = SarvamRateLimiter(
    max_requests=PlanLimits.TTS_RPM - PlanLimits.BUFFER,
    name="sarvam:tts",
)
translation_limiter = SarvamRateLimiter(
    max_requests=PlanLimits.TRANSLATION_RPM - PlanLimits.BUFFER,
    name="sarvam:translation",
)

# ── Per-user limiters (your own policy) ───────────────────────────────────────

per_user_llm = PerUserLimiter(
    guest_rpm=UserLimits.GUEST_LLM_RPM,
    auth_rpm=UserLimits.AUTH_LLM_RPM,
    name="user:llm",
)
per_user_stt = PerUserLimiter(
    guest_rpm=UserLimits.GUEST_STT_RPM,
    auth_rpm=UserLimits.AUTH_STT_RPM,
    name="user:stt",
)
per_user_tts = PerUserLimiter(
    guest_rpm=UserLimits.GUEST_TTS_RPM,
    auth_rpm=UserLimits.AUTH_TTS_RPM,
    name="user:tts",
)
