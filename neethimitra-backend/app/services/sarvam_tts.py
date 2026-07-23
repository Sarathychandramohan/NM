import base64
import json
import logging
import os
import re
import struct
import uuid
import httpx
import time
from app.config import settings
from app.services.legal_ai import normalise_to_11_lang
from app.utils.rate_limiter import tts_limiter

logger = logging.getLogger(__name__)

SARVAM_TTS_URL = "https://api.sarvam.ai/text-to-speech"

# Bulbul v3 supports the same 11-language set as Sarvam-30B and Mayura.
# Any language outside this set is normalised to en-IN before the API call.


def clean_for_tts(text: str) -> str:
    """
    Strip markdown and formatting before passing text to Bulbul v3 TTS.
    Handles English + all 11 Indian language scripts and legal text symbols.

    Bulbul v3 reads markdown symbols aloud ("hash hash", "asterisk", "dash")
    which produces garbled audio output.
    """
    if not text:
        return ""

    # Remove ATX headings: ### Title -> Title
    text = re.sub(r"^#{1,6}\s*", "", text, flags=re.MULTILINE)

    # Remove bold (**text**) and italic (*text*, __text__, _text_)
    text = re.sub(r"\*{1,3}(.*?)\*{1,3}", r"\1", text, flags=re.DOTALL)
    text = re.sub(r"_{1,2}(.*?)_{1,2}", r"\1", text, flags=re.DOTALL)

    # Remove code blocks and inline code
    text = re.sub(r"```[\s\S]*?```", "", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)

    # Remove blockquotes and horizontal rules
    text = re.sub(r"^\s*>\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*[-*_]{3,}\s*$", "", text, flags=re.MULTILINE)

    # Remove bullet list markers (-, *, •, ◦, ▪)
    text = re.sub(r"^\s*[-*•◦▪]\s+", "", text, flags=re.MULTILINE)

    # Remove numbered list markers (1. 2. -> 1) 2))
    text = re.sub(r"^\s*(\d+)[.)]\s+", r"\1) ", text, flags=re.MULTILINE)

    # Remove markdown links [text](url) -> text and bare URLs
    text = re.sub(r"\[([^\]]+)\]\([^\)]+\)", r"\1", text)
    text = re.sub(r"https?://\S+", "", text)
    text = re.sub(r"<[^>]+>", "", text)

    # Indian language & legal symbols
    text = re.sub(r"[§¶]", "", text)
    text = re.sub(r"॥", "। ", text)

    # Convert multiple newlines to a pause-friendly period + space
    text = re.sub(r"\n{2,}", ". ", text)
    text = re.sub(r"\n", " ", text)
    text = re.sub(r" {2,}", " ", text)

    # Remove footnote markers like [1], [2]
    text = re.sub(r"\[\d+\]", "", text)

    return text.strip()



def split_text_into_chunks(text: str, max_chars: int = 450) -> list[str]:
    """
    Split text into smaller chunks of at most max_chars, splitting on spaces.

    Bulbul v3 has a 500-character per-request limit. We use 450 as the safe
    ceiling to leave headroom for multi-byte Unicode characters.
    """
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
                # Force split long single words (e.g. long URLs or unspaced script)
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
    """
    Concatenate multiple standard WAV files into a single valid WAV file by
    combining their PCM data and patching the RIFF header size fields.
    """
    if not wav_chunks:
        return b""
    if len(wav_chunks) == 1:
        return wav_chunks[0]

    # Extract standard 44-byte header from the first chunk
    header = bytearray(wav_chunks[0][:44])

    # Strip the 44-byte header from each chunk to get raw PCM data
    pcm_data_list = [chunk[44:] for chunk in wav_chunks]
    total_pcm_data = b"".join(pcm_data_list)
    total_size = len(total_pcm_data)

    # Patch RIFF header size fields (little-endian 32-bit integers)
    # Offset 4–7:  Total file size minus 8 = 36 + PCM size
    struct.pack_into("<I", header, 4, 36 + total_size)
    # Offset 40–43: PCM data section size
    struct.pack_into("<I", header, 40, total_size)

    return bytes(header) + total_pcm_data


# Bulbul v3 valid speakers (confirmed from production API error 2026-07-21):
# "meera" was removed from Sarvam's speaker list — using "ishita" as new default.
# Female: anushka, manisha, vidya, arya, ritu, priya, neha, pooja, simran, kavya,
#          ishita, shreya, roopa, suhani, kavitha, rupali, tanya, shruti, mani
# Male:   abhilash, karun, hitesh, aditya, rahul, rohan, amit, dev, ratan, varun,
#          manan, sumit, kabir, aayan, shubh, ashutosh, advait, anand, tarun, sunny,
#          gokul, vijay, mohit, rehan, soham
DEFAULT_SPEAKER = "ishita"


def get_speaker_for_user(user=None, language_code: str = "en-IN") -> str:
    """
    Resolve the Bulbul v3 speaker to use for a given user + language combination.

    Resolution order:
      1. User's saved preference for this language (voice_preferences JSON column)
      2. Language default from LANGUAGE_DEFAULTS in voice_config.py
      3. Hard-coded DEFAULT_SPEAKER ("ishita")

    Args:
        user: SQLAlchemy User ORM object (may be None for unauthenticated calls)
        language_code: BCP-47 code of the session/response language
    """
    if user is not None:
        raw_prefs = getattr(user, "voice_preferences", None)
        if raw_prefs:
            try:
                prefs: dict = json.loads(raw_prefs)
                saved = prefs.get(language_code)
                if saved:
                    logger.debug(
                        "get_speaker_for_user: user_id=%s lang=%s → saved preference '%s'",
                        user.id, language_code, saved,
                    )
                    return saved
            except (ValueError, TypeError):
                logger.warning("get_speaker_for_user: invalid JSON in voice_preferences for user_id=%s", user.id)

    # Language-level default (best speaker for this language per voice_config.py)
    from app.services.voice_config import get_default_voice
    lang_default = get_default_voice(language_code, gender="female")
    if lang_default:
        logger.debug(
            "get_speaker_for_user: lang=%s → language default '%s'",
            language_code, lang_default,
        )
        return lang_default

    return DEFAULT_SPEAKER


async def synthesize_speech(text: str, target_language_code: str, speaker: str = DEFAULT_SPEAKER) -> str:
    """
    Converts text to speech using Sarvam AI Bulbul v3 (/text-to-speech endpoint).

    Model: bulbul:v3 (current; confirmed working 2026-07-13)
    Supported languages: the 11-language set (same as Sarvam-30B and Mayura).
    Any unsupported language_code is normalised to en-IN with a warning log.

    Speaker: defaults to "meera" (valid female voice for all 11 languages).
      See DEFAULT_SPEAKER and the comment block above for the full speaker list.

    Chunking:
      - Total text is capped at 5,000 characters (raised from 2,500 to avoid
        mid-sentence truncation on long legal AI responses).
      - Each chunk is ≤ 450 characters (safe margin below Bulbul's 500-char limit).
      - All chunk WAV files are concatenated into a single WAV before saving.
    """
    if (
        not settings.SARVAM_API_KEY
        or "your_sarvam_api_key" in settings.SARVAM_API_KEY.lower()
        or "paste_your" in settings.SARVAM_API_KEY.lower()
        or settings.SARVAM_API_KEY == ""
    ):
        raise ValueError("SARVAM_API_KEY is not configured on the server.")

    # Normalise to Bulbul v3's 11-language set before calling the API
    safe_lang = normalise_to_11_lang(target_language_code)
    if safe_lang != target_language_code:
        logger.warning(
            "synthesize_speech: target_language_code '%s' unsupported by Bulbul v3 — "
            "normalised to '%s'",
            target_language_code, safe_lang,
        )

    audio_dir = settings.AUDIO_CACHE_DIR
    os.makedirs(audio_dir, exist_ok=True)
    filename = f"tts_{uuid.uuid4().hex[:10]}.wav"
    filepath = os.path.join(audio_dir, filename)

    # Strip markdown before TTS — Bulbul v3 reads symbols aloud (Sarvam Q4 fix)
    safe_text = clean_for_tts(text[:5000])

    # Chunk into ≤ 450-character segments (per-request limit is 500)
    chunks = split_text_into_chunks(safe_text, max_chars=450)
    wav_binaries = []

    headers = {
        "api-subscription-key": settings.SARVAM_API_KEY,
        "Content-Type": "application/json",
    }

    start_time = time.time()
    async with httpx.AsyncClient() as client:
        for i, chunk in enumerate(chunks):
            payload = {
                "text": chunk,
                "target_language_code": safe_lang,   # validated 11-lang code
                "speaker": speaker,
                "model": "bulbul:v3",                # current model; do NOT use bulbul:v1
                "enable_preprocessing": True,
                "pace": 0.95,                        # Sarvam-recommended: 5% slower than default
                                                     # improves clarity for legal terms (RTI, FIR, Article 21)
            }

            await tts_limiter.acquire()
            response = await client.post(
                SARVAM_TTS_URL, headers=headers, json=payload, timeout=30.0
            )

            if response.status_code != 200:
                logger.error(
                    "Sarvam TTS error on chunk %d/%d — status=%s body=%s",
                    i + 1, len(chunks), response.status_code, response.text,
                )
                raise RuntimeError(
                    f"Sarvam TTS Error ({response.status_code}): {response.text}"
                )

            result = response.json()
            audios = result.get("audios", [])
            if not audios:
                raise RuntimeError(f"Sarvam TTS returned no audio data for chunk {i + 1}")

            # Decode base64 WAV data returned by Bulbul v3
            wav_binaries.append(base64.b64decode(audios[0]))

    logger.info(
        "synthesize_speech (bulbul:v3, lang=%s) took %.2fs — %d chunk(s)",
        safe_lang, time.time() - start_time, len(chunks),
    )

    # Merge all WAV chunks into a single valid WAV file
    final_wav_data = concatenate_wav_files(wav_binaries)

    with open(filepath, "wb") as f:
        f.write(final_wav_data)

    return f"/static/audio/{filename}"
