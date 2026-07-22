import io
import logging

import httpx
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings
from app.utils.rate_limiter import stt_limiter

logger = logging.getLogger(__name__)
router = APIRouter()
SARVAM_STT_URL = "https://api.sarvam.ai/speech-to-text"


@router.websocket("/ws/stt")
async def stt_websocket(websocket: WebSocket):
    await websocket.accept()
    logger.info("STT WebSocket: client connected")
    accumulated_transcript = ""
    try:
        while True:
            audio_bytes = await websocket.receive_bytes()
            if not audio_bytes:
                await websocket.send_json({"transcript": accumulated_transcript.strip(), "is_final": True})
                break
            try:
                chunk = await _transcribe_chunk(audio_bytes)
                if chunk:
                    accumulated_transcript = (accumulated_transcript + " " + chunk).strip() if accumulated_transcript else chunk
                await websocket.send_json({"transcript": accumulated_transcript.strip(), "is_final": False})
            except Exception as exc:
                logger.error("STT WebSocket transcription error: %s", exc)
                await websocket.send_json({"transcript": accumulated_transcript.strip(), "error": str(exc), "is_final": False})
    except WebSocketDisconnect:
        logger.info("STT WebSocket: client disconnected")
    except Exception as exc:
        logger.error("STT WebSocket unexpected error: %s", exc)
        try:
            await websocket.send_json({"error": str(exc), "is_final": True})
        except Exception:
            pass


async def _transcribe_chunk(audio_bytes: bytes) -> str:
    if not settings.SARVAM_API_KEY:
        raise ValueError("SARVAM_API_KEY is not configured")
    # Respect Sarvam STT REST rate limit (60 req/min; using 58 with buffer)
    await stt_limiter.acquire()
    headers = {"api-subscription-key": settings.SARVAM_API_KEY}
    files = {"file": ("chunk.webm", io.BytesIO(audio_bytes), "audio/webm")}
    data = {"model": "saaras:v3", "language_code": "unknown", "mode": "transcribe"}
    async with httpx.AsyncClient() as client:
        response = await client.post(SARVAM_STT_URL, headers=headers, files=files, data=data, timeout=20.0)
    if response.status_code != 200:
        logger.error("Sarvam STT chunk error %s: %s", response.status_code, response.text[:200])
        return ""
    return response.json().get("transcript", "")

