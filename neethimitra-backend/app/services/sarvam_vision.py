import asyncio
import logging

import httpx

from app.config import has_sarvam_key, settings

logger = logging.getLogger(__name__)

SARVAM_BASE = "https://api.sarvam.ai"
POLL_INTERVAL_SECONDS = 3
MAX_POLL_ATTEMPTS = 40  # 40 × 3 s = 120 s max wait


def _headers() -> dict:
    return {"api-subscription-key": settings.SARVAM_API_KEY}


# ── Pipeline steps — all accept a shared AsyncClient ──────────────────────────
# This reuses a single connection pool for all 6 HTTP steps instead of
# creating 6 separate pools (the previous per-function AsyncClient pattern).


async def _create_job(client: httpx.AsyncClient) -> str:
    """Step 1: Create a Document Digitization job, returns job_id."""
    response = await client.post(
        f"{SARVAM_BASE}/doc-digitization/job/v1",
        headers=_headers(),
        timeout=15.0,
    )
    response.raise_for_status()
    return response.json()["job_id"]


async def _get_upload_url(client: httpx.AsyncClient, job_id: str, filename: str, file_type: str) -> str:
    """Step 2: Get a pre-signed S3 URL to upload the file."""
    response = await client.post(
        f"{SARVAM_BASE}/doc-digitization/job/v1/upload-files",
        headers=_headers(),
        json={"job_id": job_id, "files": [{"file_name": filename, "file_type": file_type}]},
        timeout=15.0,
    )
    response.raise_for_status()
    upload_urls = response.json().get("upload_urls", [])
    if not upload_urls:
        # RuntimeError — not HTTPException — because this runs in a background task
        raise RuntimeError("Sarvam Vision: No upload URL returned by the API.")
    return upload_urls[0]["url"]


async def _upload_file_to_url(client: httpx.AsyncClient, presigned_url: str, file_bytes: bytes, mime_type: str) -> None:
    """Step 3: PUT raw file bytes to the pre-signed S3 URL."""
    response = await client.put(
        presigned_url,
        content=file_bytes,
        headers={"Content-Type": mime_type},
        timeout=60.0,
    )
    response.raise_for_status()


async def _start_job(client: httpx.AsyncClient, job_id: str) -> None:
    """Step 4: Trigger processing of the uploaded file."""
    response = await client.post(
        f"{SARVAM_BASE}/doc-digitization/job/v1/start",
        headers=_headers(),
        json={"job_id": job_id, "output_format": "markdown"},
        timeout=15.0,
    )
    response.raise_for_status()


async def _poll_status(client: httpx.AsyncClient, job_id: str) -> list[str]:
    """Step 5: Poll job status until Completed. Returns list of output filenames."""
    for attempt in range(MAX_POLL_ATTEMPTS):
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
        response = await client.get(
            f"{SARVAM_BASE}/doc-digitization/job/v1/status",
            headers=_headers(),
            params={"job_id": job_id},
            timeout=15.0,
        )
        response.raise_for_status()
        data = response.json()
        state = data.get("job_state", "")

        if state == "Completed":
            return data.get("output_files", [])
        if state == "Failed":
            raise RuntimeError(f"Sarvam Vision job failed: {data}")
        # InProgress → keep polling
        logger.debug("Sarvam Vision job %s: attempt %d/%d state=%s", job_id, attempt + 1, MAX_POLL_ATTEMPTS, state)

    raise RuntimeError("Sarvam Vision job timed out after 120 seconds.")


async def _get_download_url(client: httpx.AsyncClient, job_id: str, output_filename: str) -> str:
    """Step 6: Get pre-signed download URL for the result Markdown file."""
    response = await client.post(
        f"{SARVAM_BASE}/doc-digitization/job/v1/download-files",
        headers=_headers(),
        json={"job_id": job_id, "files": [output_filename]},
        timeout=15.0,
    )
    response.raise_for_status()
    download_urls = response.json().get("download_urls", [])
    if not download_urls:
        raise RuntimeError("Sarvam Vision: No download URL returned by the API.")
    return download_urls[0]["url"]


async def _download_markdown(client: httpx.AsyncClient, download_url: str) -> str:
    """Fetch the Markdown content from the pre-signed download URL."""
    response = await client.get(download_url, timeout=30.0)
    response.raise_for_status()
    return response.text


# ── Public entry point ─────────────────────────────────────────────────────────


async def extract_text_from_document(file_bytes: bytes, filename: str, mime_type: str) -> str:
    """
    Full Sarvam Vision 6-step async pipeline.

    Design decisions:
    - Single shared httpx.AsyncClient for all 6 steps → one connection pool, not six.
    - Raises RuntimeError (not HTTPException) so callers in background tasks can
      catch it with a plain `except Exception` without Starlette confusion.
    - Falls back to a mock response if SARVAM_API_KEY is not set (local dev).
    """
    if not has_sarvam_key():
        await asyncio.sleep(1)  # simulate async behaviour
        return (
            f"**[MOCK] Extracted Data from `{filename}`**\n\n"
            "- Document appears to be a formal legal / financial record.\n"
            "- Key entities identified: Party name, Date, Amount/Clause.\n"
            "- Use this data to draft the complaint.\n\n"
            "*Note: Set SARVAM_API_KEY in .env for real extraction.*"
        )

    # Map MIME type to file_type accepted by Sarvam Vision API
    if mime_type in ("image/jpeg", "image/jpg"):
        file_type = "jpg"
    elif mime_type == "image/png":
        file_type = "png"
    elif "zip" in mime_type:
        file_type = "zip"
    else:
        file_type = "pdf"  # default for application/pdf and unknowns

    async with httpx.AsyncClient() as client:
        try:
            job_id = await _create_job(client)
            presigned_upload_url = await _get_upload_url(client, job_id, filename, file_type)
            await _upload_file_to_url(client, presigned_upload_url, file_bytes, mime_type)
            await _start_job(client, job_id)
            output_files = await _poll_status(client, job_id)

            if not output_files:
                return "[Sarvam Vision: Job completed but no output files were returned.]"

            download_url = await _get_download_url(client, job_id, output_files[0])
            return await _download_markdown(client, download_url)

        except RuntimeError:
            raise  # already correct type — re-raise as-is
        except Exception as exc:
            raise RuntimeError(f"Sarvam Vision unexpected error: {exc}") from exc
