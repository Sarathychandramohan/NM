import base64
import logging
import os
import struct
import uuid
import httpx
from app.config import settings

logger = logging.getLogger(__name__)

SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"


def split_text_into_chunks(text: str, max_chars: int = 450) -> list[str]:
    """Split text into smaller chunks of at most max_chars, trying to split on spaces."""
    if len(text) <= max_chars:
        return [text]

    chunks = []
    current_chunk = ""
    words = text.split(" ")

    for word in words:
        if len(current_chunk) + len(word) + 1 > max_chars:
            if current_chunk:
                chunks.append(current_chunk.strip())
                current_chunk = word
            else:
                # Force split long single words
                chunks.append(word[:max_chars])
                current_chunk = word[max_chars:]
        else:
            if current_chunk:
                current_chunk += " " + word
            else:
                current_chunk = word

    if current_chunk:
        chunks.append(current_chunk.strip())

    return chunks


def concatenate_wav_files(wav_chunks: list[bytes]) -> bytes:
    """Concatenate multiple standard WAV files into a single valid WAV file by combining PCM and updating headers."""
    if not wav_chunks:
        return b""
    if len(wav_chunks) == 1:
        return wav_chunks[0]

    # Extract standard 44-byte header from the first chunk
    header = bytearray(wav_chunks[0][:44])

    # Extract raw PCM data by stripping the 44-byte header from each chunk
    pcm_data_list = [chunk[44:] for chunk in wav_chunks]
    total_pcm_data = b"".join(pcm_data_list)
    total_size = len(total_pcm_data)

    # Update size fields in the RIFF WAV header using little-endian 32-bit integers
    # Offset 4 to 7: Size of the rest of the file = 36 + total_pcm_size
    struct.pack_into("<I", header, 4, 36 + total_size)
    # Offset 40 to 43: Size of data section = total_pcm_size
    struct.pack_into("<I", header, 40, total_size)

    return bytes(header) + total_pcm_data


async def synthesize_speech(text: str, target_language_code: str, speaker: str = "ananya") -> str:
    """
    Converts text to speech using Sarvam AI Bulbul v3.
    Saves the resulting .wav file to static/audio/ and returns its URL path.

    Respects the 2,500-character limit overall, and chunks text into sections 
    of < 450 characters to stay within Bulbul v3's 500-character per-request limit.
    """
    if not settings.SARVAM_API_KEY or "your_sarvam_api_key" in settings.SARVAM_API_KEY.lower() or "paste_your" in settings.SARVAM_API_KEY.lower() or settings.SARVAM_API_KEY == "":
        raise ValueError("SARVAM_API_KEY is not configured on the server.")

    audio_dir = settings.AUDIO_CACHE_DIR
    os.makedirs(audio_dir, exist_ok=True)
    filename = f"tts_{uuid.uuid4().hex[:10]}.wav"
    filepath = os.path.join(audio_dir, filename)

    # Respect the 2,500-character limit overall
    safe_text = text[:2500]

    # Chunk the text into smaller segments of < 450 characters
    chunks = split_text_into_chunks(safe_text, max_chars=450)
    wav_binaries = []

    headers = {
        "api-subscription-key": settings.SARVAM_API_KEY,
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient() as client:
        for chunk in chunks:
            payload = {
                "text": chunk,
                "target_language_code": target_language_code,
                "speaker": speaker,
                "model": "bulbul:v3",
                "enable_preprocessing": True,
            }

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

            # Decode the base64 audio and append to binaries list
            wav_binaries.append(base64.b64decode(audios[0]))

    # Merge all WAV binaries together
    final_wav_data = concatenate_wav_files(wav_binaries)

    with open(filepath, "wb") as f:
        f.write(final_wav_data)

    return f"/static/audio/{filename}"
