import httpx
import base64
import struct
import os
import uuid
from fastapi import HTTPException
from app.config import settings, has_sarvam_key

SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"
AUDIO_DIR = settings.AUDIO_CACHE_DIR

def _make_silent_wav(duration_ms: int = 500, sample_rate: int = 22050) -> bytes:
    """Generate a valid minimal silent WAV file (PCM 16-bit mono)."""
    num_samples = int(sample_rate * duration_ms / 1000)
    pcm_data = b'\x00\x00' * num_samples  # 16-bit silence
    data_size = len(pcm_data)
    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF', 36 + data_size, b'WAVE',
        b'fmt ', 16,
        1,           # PCM
        1,           # mono
        sample_rate,
        sample_rate * 2,  # byte rate
        2,           # block align
        16,          # bits per sample
        b'data', data_size
    )
    return header + pcm_data

async def synthesize_speech(text: str, target_language_code: str, speaker: str = "ananya") -> str:
    """
    Converts text to speech using Sarvam AI Bulbul v3.
    Saves the resulting .wav file to static/audio/ and returns its URL path.
    Falls back to a valid silent WAV if API key is not set.
    """
    os.makedirs(AUDIO_DIR, exist_ok=True)
    filename = f"tts_{uuid.uuid4().hex[:10]}.wav"
    filepath = os.path.join(AUDIO_DIR, filename)

    if not has_sarvam_key():
        # Write a real silent WAV so audio players don't crash
        with open(filepath, "wb") as f:
            f.write(_make_silent_wav())
        return f"/static/audio/{filename}"

    headers = {
        "api-subscription-key": settings.SARVAM_API_KEY,
        "Content-Type": "application/json"
    }
    payload = {
        "text": text[:2500],
        "target_language_code": target_language_code,
        "speaker": speaker,
        "model": "bulbul:v3",
        "enable_preprocessing": True
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            SARVAM_TTS_URL, headers=headers, json=payload, timeout=30.0
        )
        if response.status_code != 200:
            raise HTTPException(
                status_code=502,
                detail=f"Sarvam TTS Error ({response.status_code}): {response.text}"
            )

        result = response.json()
        audios = result.get("audios", [])
        if not audios:
            raise HTTPException(status_code=502, detail="Sarvam TTS returned no audio data")

        audio_data = base64.b64decode(audios[0])
        with open(filepath, "wb") as f:
            f.write(audio_data)

    return f"/static/audio/{filename}"
