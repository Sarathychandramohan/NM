import httpx
import asyncio
from fastapi import HTTPException
from app.config import settings, has_sarvam_key

SARVAM_BASE = "https://api.sarvam.ai"
POLL_INTERVAL_SECONDS = 3
MAX_POLL_ATTEMPTS = 40  # 40 × 3s = 120s timeout

def _headers():
    return {"api-subscription-key": settings.SARVAM_API_KEY}

async def _create_job() -> str:
    """Step 1: Create a new Document Digitization job, returns job_id."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{SARVAM_BASE}/doc-digitization/job/v1",
            headers=_headers(),
            timeout=15.0
        )
        response.raise_for_status()
        return response.json()["job_id"]

async def _get_upload_url(job_id: str, filename: str, file_type: str) -> str:
    """Step 2: Get a pre-signed S3 URL to upload the file."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{SARVAM_BASE}/doc-digitization/job/v1/upload-files",
            headers=_headers(),
            json={"job_id": job_id, "files": [{"file_name": filename, "file_type": file_type}]},
            timeout=15.0
        )
        response.raise_for_status()
        upload_urls = response.json().get("upload_urls", [])
        if not upload_urls:
            raise HTTPException(status_code=500, detail="Sarvam Vision: No upload URL returned.")
        return upload_urls[0]["url"]

async def _upload_file_to_url(presigned_url: str, file_bytes: bytes, mime_type: str):
    """Step 3: PUT raw file bytes to the pre-signed S3 URL."""
    async with httpx.AsyncClient() as client:
        response = await client.put(
            presigned_url,
            content=file_bytes,
            headers={"Content-Type": mime_type},
            timeout=60.0
        )
        response.raise_for_status()

async def _start_job(job_id: str):
    """Step 4: Trigger processing of the uploaded files."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{SARVAM_BASE}/doc-digitization/job/v1/start",
            headers=_headers(),
            json={"job_id": job_id, "output_format": "markdown"},
            timeout=15.0
        )
        response.raise_for_status()

async def _poll_status(job_id: str) -> list[str]:
    """Step 5: Poll job status until Completed. Returns list of output filenames."""
    async with httpx.AsyncClient() as client:
        for attempt in range(MAX_POLL_ATTEMPTS):
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            response = await client.get(
                f"{SARVAM_BASE}/doc-digitization/job/v1/status",
                headers=_headers(),
                params={"job_id": job_id},
                timeout=15.0
            )
            response.raise_for_status()
            data = response.json()
            state = data.get("job_state", "")

            if state == "Completed":
                return data.get("output_files", [])
            elif state == "Failed":
                raise HTTPException(status_code=500, detail=f"Sarvam Vision job failed: {data}")
            # InProgress → keep polling

    raise HTTPException(status_code=504, detail="Sarvam Vision job timed out after 120 seconds.")

async def _get_download_url(job_id: str, output_filename: str) -> str:
    """Step 6: Get pre-signed download URL for the result markdown file."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{SARVAM_BASE}/doc-digitization/job/v1/download-files",
            headers=_headers(),
            json={"job_id": job_id, "files": [output_filename]},
            timeout=15.0
        )
        response.raise_for_status()
        download_urls = response.json().get("download_urls", [])
        if not download_urls:
            raise HTTPException(status_code=500, detail="Sarvam Vision: No download URL returned.")
        return download_urls[0]["url"]

async def _download_markdown(download_url: str) -> str:
    """Fetch the Markdown content from the pre-signed download URL."""
    async with httpx.AsyncClient() as client:
        response = await client.get(download_url, timeout=30.0)
        response.raise_for_status()
        return response.text

async def extract_text_from_document(file_bytes: bytes, filename: str, mime_type: str) -> str:
    """
    Full Sarvam Vision 5-step async job pipeline.
    Uploads a document (PDF/Image) and returns extracted Markdown text.
    
    Falls back to a mock response if SARVAM_API_KEY is not set (for local dev/testing).
    """
    if not has_sarvam_key():
        await asyncio.sleep(1)
        return (
            f"**[MOCK] Extracted Data from `{filename}`**\n\n"
            "- Document appears to be a formal legal / financial record.\n"
            "- Key entities identified: Party name, Date, Amount/Clause.\n"
            "- Use this data to draft the complaint.\n\n"
            "*Note: Set SARVAM_API_KEY in .env for real extraction.*"
        )

    # Determine file_type for Sarvam API
    if mime_type in ("image/jpeg", "image/jpg"):
        file_type = "jpg"
    elif mime_type == "image/png":
        file_type = "png"
    elif "zip" in mime_type:
        file_type = "zip"
    else:
        file_type = "pdf"  # default

    try:
        job_id = await _create_job()
        presigned_upload_url = await _get_upload_url(job_id, filename, file_type)
        await _upload_file_to_url(presigned_upload_url, file_bytes, mime_type)
        await _start_job(job_id)
        output_files = await _poll_status(job_id)

        if not output_files:
            return "[Sarvam Vision: Job completed but no output files found.]"

        download_url = await _get_download_url(job_id, output_files[0])
        markdown_text = await _download_markdown(download_url)
        return markdown_text

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sarvam Vision unexpected error: {str(e)}")
