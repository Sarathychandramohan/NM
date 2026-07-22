"""
Async sliding-window rate limiter for Sarvam AI API calls.

Source: Sarvam AI documentation answer to Q5 (Rate Limits page):
  - LLM (sarvam-30b):     40 req/min confirmed
  - STT REST (saaras:v3): 60 req/min confirmed
  - STT Batch:            20 req/min confirmed
  - TTS, Mayura: NOT separately published

Usage:
    from app.utils.rate_limiter import llm_limiter, stt_limiter
    await llm_limiter.acquire()
"""

import asyncio
import time
from collections import deque


class SarvamRateLimiter:
    def __init__(self, max_requests: int, window_seconds: int = 60, name: str = ""):
        self.max_requests = max_requests
        self.window = window_seconds
        self.name = name or f"limiter({max_requests}/min)"
        self._requests = deque()
        self._lock = asyncio.Lock()

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            while self._requests and self._requests[0] < now - self.window:
                self._requests.popleft()
            if len(self._requests) >= self.max_requests:
                sleep_time = self.window - (now - self._requests[0])
                if sleep_time > 0:
                    await asyncio.sleep(sleep_time)
            self._requests.append(time.monotonic())

    @property
    def current_usage(self) -> int:
        now = time.monotonic()
        return sum(1 for ts in self._requests if ts >= now - self.window)


# Pre-initialized global limiters (share across routes)
llm_limiter = SarvamRateLimiter(max_requests=38, name="sarvam-30b LLM")
stt_limiter = SarvamRateLimiter(max_requests=58, name="saaras:v3 STT REST")
stt_batch_limiter = SarvamRateLimiter(max_requests=18, name="saaras:v3 STT Batch")
