import asyncio
import logging

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

SARVAM_BASE = "https://api.sarvam.ai"
# Adaptive polling: starts at 2 s, doubles each attempt, caps at 10 s.
# Reduces unnecessary calls for small docs while still handling large PDFs.
_POLL_INITIAL_INTERVAL = 2
_POLL_MAX_INTERVAL = 10
_POLL_MAX_TOTAL_SECONDS = 120  # abort after 2 minutes


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
        json={"job_id": job_id, "files": [filename]},
        timeout=15.0,
    )
    response.raise_for_status()
    upload_urls = response.json().get("upload_urls")
    if not upload_urls:
        raise RuntimeError("Sarvam Vision: No upload URL returned by the API.")

    # Defensively support both dictionary maps and list structures
    if isinstance(upload_urls, dict):
        entry = upload_urls.get(filename) or next(iter(upload_urls.values()), None)
    elif isinstance(upload_urls, list) and len(upload_urls) > 0:
        entry = upload_urls[0]
    else:
        entry = None

    if isinstance(entry, dict):
        url = entry.get("file_url") or entry.get("url")
    else:
        url = entry

    if not url:
        raise RuntimeError(f"Sarvam Vision: Could not extract upload URL for file '{filename}' from response. Response data: {response.json()}")
    return url


async def _upload_file_to_url(client: httpx.AsyncClient, presigned_url: str, file_bytes: bytes, mime_type: str) -> None:
    """Step 3: PUT raw file bytes to the pre-signed S3 URL."""
    headers = {
        "Content-Type": mime_type,
        "x-ms-blob-type": "BlockBlob"
    }
    response = await client.put(
        presigned_url,
        content=file_bytes,
        headers=headers,
        timeout=60.0,
    )
    response.raise_for_status()


async def _start_job(client: httpx.AsyncClient, job_id: str) -> None:
    """Step 4: Trigger processing of the uploaded file."""
    response = await client.post(
        f"{SARVAM_BASE}/doc-digitization/job/v1/{job_id}/start",
        headers=_headers(),
        # IMPORTANT: output_format MUST be nested inside job_parameters.
        # Sending {"output_format": "md"} at root level returns 400 from Sarvam API.
        json={"job_parameters": {"output_format": "md"}},
        timeout=15.0,
    )
    response.raise_for_status()


async def _poll_status(client: httpx.AsyncClient, job_id: str) -> list[str]:
    """
    Step 5: Poll job status with adaptive exponential backoff.

    Strategy (recommended by Sarvam AI engineering):
    - Start fast (2 s) for images/small PDFs that process quickly.
    - Back off exponentially (2→4→8→10→10 s…) for large PDFs.
    - Abort after _POLL_MAX_TOTAL_SECONDS to prevent indefinite blocking.
    """
    elapsed = 0
    interval = _POLL_INITIAL_INTERVAL
    attempt = 0

    while elapsed < _POLL_MAX_TOTAL_SECONDS:
        await asyncio.sleep(interval)
        elapsed += interval
        attempt += 1

        response = await client.get(
            f"{SARVAM_BASE}/doc-digitization/job/v1/{job_id}/status",
            headers=_headers(),
            timeout=15.0,
        )
        response.raise_for_status()
        data = response.json()
        state = data.get("job_state", "")

        if state == "Completed":
            logger.info(
                "Sarvam Vision job %s: completed in ~%ds (%d polls)",
                job_id,
                elapsed,
                attempt,
            )
            return data.get("output_files", [])
        if state == "Failed":
            raise RuntimeError(f"Sarvam Vision job failed: {data}")

        # Still in progress — back off, cap at max interval
        logger.debug(
            "Sarvam Vision job %s: poll %d elapsed=%ds state=%s next_wait=%ds",
            job_id,
            attempt,
            elapsed,
            state,
            min(interval * 2, _POLL_MAX_INTERVAL),
        )
        interval = min(interval * 2, _POLL_MAX_INTERVAL)

    raise RuntimeError(
        f"Sarvam Vision job {job_id} timed out after {_POLL_MAX_TOTAL_SECONDS}s ({attempt} polls)."
    )


async def _get_download_url(client: httpx.AsyncClient, job_id: str, output_filename: str) -> str:
    """Step 6: Get pre-signed download URL for the result Markdown file."""
    response = await client.post(
        f"{SARVAM_BASE}/doc-digitization/job/v1/{job_id}/download-files",
        headers=_headers(),
        json={"job_id": job_id, "files": [output_filename]},
        timeout=15.0,
    )
    response.raise_for_status()
    download_urls = response.json().get("download_urls")
    if not download_urls:
        raise RuntimeError(f"Sarvam Vision: No download URL returned by the API. Response: {response.json()}")

    # Defensively support both dictionary maps and list structures
    if isinstance(download_urls, dict):
        entry = download_urls.get(output_filename) or next(iter(download_urls.values()), None)
    elif isinstance(download_urls, list) and len(download_urls) > 0:
        entry = download_urls[0]
    else:
        entry = None

    if isinstance(entry, dict):
        url = entry.get("file_url") or entry.get("url")
    else:
        url = entry

    if not url:
        raise RuntimeError(f"Sarvam Vision: Could not extract download URL for file '{output_filename}' from response. Response data: {response.json()}")
    return url


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
    if not settings.SARVAM_API_KEY or "your_sarvam_api_key" in settings.SARVAM_API_KEY.lower() or "paste_your" in settings.SARVAM_API_KEY.lower() or settings.SARVAM_API_KEY == "":
        raise ValueError("SARVAM_API_KEY is not configured on the server.")

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
            logger.info("extract_text_from_document: job_id=%s filename=%s mime=%s", job_id, filename, mime_type)
            presigned_upload_url = await _get_upload_url(client, job_id, filename, file_type)
            await _upload_file_to_url(client, presigned_upload_url, file_bytes, mime_type)
            await _start_job(client, job_id)
            output_files = await _poll_status(client, job_id)

            if not output_files:
                return "[Sarvam Vision: Job completed but no output files were returned.]"

            download_url = await _get_download_url(client, job_id, output_files[0])
            text = await _download_markdown(client, download_url)
            logger.info("extract_text_from_document: success — extracted %d chars", len(text))
            return text

        except httpx.HTTPStatusError as exc:
            # Log the full response body so we know exactly what Sarvam returned
            body = exc.response.text[:500] if exc.response else "no body"
            logger.error(
                "extract_text_from_document: HTTP %s from Sarvam — URL=%s body=%s",
                exc.response.status_code if exc.response else "?",
                str(exc.request.url)[:120],
                body,
            )
            raise RuntimeError(
                f"Sarvam Vision API error {exc.response.status_code if exc.response else '?'}: {body}"
            ) from exc
        except RuntimeError:
            raise  # already correct type — re-raise as-is
        except Exception as exc:
            raise RuntimeError(f"Sarvam Vision unexpected error: {exc}") from exc
