"""
WebSocket Speech-to-Text relay — /ws/stt
=========================================
Receives binary audio chunks from the browser's MediaRecorder (WebM/Opus),
transcodes them to 16 kHz mono WAV (required by Saaras v3), then posts each
chunk to Sarvam STT REST and streams transcripts back to the client.

Why transcoding?
  Saaras v3 ONLY accepts audio/wav or raw PCM (pcm_s16le / pcm_l16 / pcm_raw).
  Browser MediaRecorder always emits audio/webm;codecs=opus — sending this
  directly caused Sarvam to return empty transcripts or 400 errors.
  Source: Sarvam AI engineering team confirmation (2024-07).
"""
import io
import logging

import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings
from app.utils.rate_limiter import per_user_stt, stt_limiter

logger = logging.getLogger(__name__)
router = APIRouter()
SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"


# ── Audio transcoding ──────────────────────────────────────────────────────────

def _transcode_to_wav(audio_bytes: bytes) -> bytes:
    """
    Convert browser-emitted WebM/Opus/OGG/MP4 bytes → 16 kHz mono WAV bytes.

    Uses PyAV (av) which ships as a self-contained wheel on PyPI — no system
    FFmpeg binary is required. Pydub delegates to av automatically when ffmpeg
    is not found on PATH.

    Returns the original bytes unchanged if the chunk is too small to decode
    (e.g., the very first MediaRecorder timeslice which may carry only headers).
    """
    try:
        import av  # noqa: F401  (imported here to give a clear ImportError message)
        from pydub import AudioSegment

        # Detect format hint from the first 4 bytes magic (best-effort)
        fmt = "webm"
        if audio_bytes[:4] == b"OggS":
            fmt = "ogg"
        elif audio_bytes[:4] == b"\xff\xfb" or audio_bytes[:3] == b"ID3":
            fmt = "mp3"
        elif audio_bytes[4:8] == b"ftyp":
            fmt = "mp4"

        seg = AudioSegment.from_file(io.BytesIO(audio_bytes), format=fmt)
        # Normalise to Sarvam requirements: 16 kHz, mono, 16-bit PCM
        seg = seg.set_frame_rate(16_000).set_channels(1).set_sample_width(2)
        buf = io.BytesIO()
        seg.export(buf, format="wav")
        return buf.getvalue()

    except Exception as exc:
        # If transcoding fails (e.g., first partial WebM header chunk), log and
        # pass the raw bytes through — Sarvam may still accept them or return "".
        logger.warning("STT WebSocket: transcode failed (%s) — forwarding raw bytes", exc)
        return audio_bytes


# ── WebSocket endpoint ─────────────────────────────────────────────────────────

@router.websocket("/ws/stt")
async def stt_websocket(
    websocket: WebSocket,
    session_id: str = "",
    user_id: str = "anonymous",
    is_guest: str = "true",
):
    """
    Live WebSocket STT pipeline.

    Protocol:
      - Client sends binary frames (WebM/Opus chunks from MediaRecorder, 500ms timeslice)
      - Server transcodes each chunk to WAV and posts to Sarvam Saaras v3
      - Server sends JSON frames: {"transcript": "...", "is_final": false}
      - Connection closed by client → server sends {"transcript": "...", "is_final": true}
    """
    guest = is_guest.lower() != "false"

    # ── Rate limit pre-check (before accept so we can close with 1008) ──────
    user_ok = await per_user_stt.acquire(user_id=user_id, is_guest=guest, timeout=3.0)
    if not user_ok:
        await websocket.close(code=1008, reason="User STT rate limit exceeded")
        return

    global_ok = await stt_limiter.acquire(timeout=5.0)
    if not global_ok:
        await websocket.close(code=1008, reason="STT service at capacity")
        return

    await websocket.accept()
    logger.info(
        "STT WebSocket: client connected — user=%s session=%s",
        user_id,
        session_id,
    )

    accumulated_transcript = ""
    try:
        while True:
            audio_bytes = await websocket.receive_bytes()
            if not audio_bytes:
                # Empty frame signals end-of-speech from client
                await websocket.send_json(
                    {"transcript": accumulated_transcript.strip(), "is_final": True}
                )
                break

            try:
                # ① Transcode WebM/Opus → 16 kHz WAV (Saaras v3 requirement)
                wav_bytes = await _async_transcode(audio_bytes)

                # ② Send WAV bytes to Sarvam STT REST
                chunk = await _transcribe_wav_chunk(wav_bytes)

                if chunk:
                    accumulated_transcript = (
                        (accumulated_transcript + " " + chunk).strip()
                        if accumulated_transcript
                        else chunk
                    )

                await websocket.send_json(
                    {"transcript": accumulated_transcript.strip(), "is_final": False}
                )

            except Exception as exc:
                logger.error("STT WebSocket transcription error: %s", exc)
                await websocket.send_json(
                    {
                        "transcript": accumulated_transcript.strip(),
                        "error": str(exc),
                        "is_final": False,
                    }
                )

    except WebSocketDisconnect:
        logger.info("STT WebSocket: client disconnected — user=%s", user_id)
    except Exception as exc:
        logger.error("STT WebSocket unexpected error: %s", exc)
        try:
            await websocket.send_json({"error": str(exc), "is_final": True})
        except Exception:
            pass


# ── Helpers ────────────────────────────────────────────────────────────────────

import asyncio


async def _async_transcode(audio_bytes: bytes) -> bytes:
    """Run CPU-bound transcoding in a thread pool to avoid blocking the event loop."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, _transcode_to_wav, audio_bytes)


async def _transcribe_wav_chunk(wav_bytes: bytes) -> str:
    """
    POST a 16 kHz WAV chunk to Sarvam Saaras v3 and return the transcript.

    Sends as audio/wav — the only format confirmed to be accepted by Saaras v3's
    REST endpoint (WAV and raw PCM only; WebM/Opus rejected).
    """
    if not settings.SARVAM_API_KEY:
        raise ValueError("SARVAM_API_KEY is not configured")

    # Consume one global STT REST token
    await stt_limiter.acquire()

    headers = {"api-subscription-key": settings.SARVAM_API_KEY}
    files = {"file": ("chunk.wav", io.BytesIO(wav_bytes), "audio/wav")}
    data = {
        "model": "saaras:v3",
        "language_code": "unknown",  # auto-detect across 23 Indian languages
        "mode": "transcribe",
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            SARVAM_STT_URL,
            headers=headers,
            files=files,
            data=data,
            timeout=20.0,
        )

    if response.status_code != 200:
        logger.error(
            "Sarvam STT chunk error %s: %s",
            response.status_code,
            response.text[:200],
        )
        return ""

    return response.json().get("transcript", "")
