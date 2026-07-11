import base64
import logging
import os
import struct
import uuid

import httpx

from app.config import has_sarvam_key, settings

logger = logging.getLogger(__name__)

SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"

# NOTE: AUDIO_DIR is NOT assigned at module level — the value of settings.AUDIO_CACHE_DIR
# is resolved at startup via ensure_storage_dirs(). Reading it inside the function
# ensures we always get the final, post-startup value.


def _make_silent_wav(duration_ms: int = 500, sample_rate: int = 22050) -> bytes:
    """Generate a valid minimal silent WAV file (PCM 16-bit mono)."""
    num_samples = int(sample_rate * duration_ms / 1000)
    pcm_data = b'\x00\x00' * num_samples  # 16-bit silence
    data_size = len(pcm_data)
    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF', 36 + data_size, b'WAVE',
        b'fmt ', 16,
        1,                     # PCM
        1,                     # mono
        sample_rate,
        sample_rate * 2,       # byte rate
        2,                     # block align
        16,                    # bits per sample
        b'data', data_size
    )
    return header + pcm_data


async def synthesize_speech(text: str, target_language_code: str, speaker: str = "ananya") -> str:
    """
    Converts text to speech using Sarvam AI Bulbul v3.
    Saves the resulting .wav file to static/audio/ and returns its URL path.
    Falls back to a valid silent WAV if API key is not set.

    LIMITATION: Bulbul v3 has a 500-character input limit. Longer texts are
    truncated to 500 characters. A warning is logged so this is never silent.
    """
    # Reference settings inside the function — not at module import time
    audio_dir = settings.AUDIO_CACHE_DIR
    os.makedirs(audio_dir, exist_ok=True)
    filename = f"tts_{uuid.uuid4().hex[:10]}.wav"
    filepath = os.path.join(audio_dir, filename)

    if not has_sarvam_key():
        # Write a real silent WAV so audio players don't crash on mock responses
        with open(filepath, "wb") as f:
            f.write(_make_silent_wav())
        return f"/static/audio/{filename}"

    if len(text) > 500:
        logger.warning(
            "TTS input text (%d chars) exceeds Bulbul v3 limit of 500 chars — "
            "truncating. Consider shortening the AI response prompt.",
            len(text),
        )

    headers = {
        "api-subscription-key": settings.SARVAM_API_KEY,
        "Content-Type": "application/json",
    }
    payload = {
        "text": text[:500],
        "target_language_code": target_language_code,
        "speaker": speaker,
        "model": "bulbul:v3",
        "enable_preprocessing": True,
    }

    async with httpx.AsyncClient() as client:
        response = await client.post(
            SARVAM_TTS_URL, headers=headers, json=payload, timeout=30.0
        )
        if response.status_code != 200:
            logger.error("Sarvam TTS error %s: %s", response.status_code, response.text)
            raise RuntimeError(
                f"Sarvam TTS Error ({response.status_code}): {response.text}"
            )

        result = response.json()
        audios = result.get("audios", [])
        if not audios:
            raise RuntimeError("Sarvam TTS returned no audio data")

        audio_data = base64.b64decode(audios[0])
        with open(filepath, "wb") as f:
            f.write(audio_data)

    return f"/static/audio/{filename}"
