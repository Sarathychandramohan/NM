# NeethiMitra Backend Working Notes

## Purpose

This file is the working reference for the `neethimitra-backend` service inside `D:\NeethiMithra AI`.
It summarizes what the backend is supposed to do, what has already been built, what is production-ready enough for frontend integration later, and what still needs to be completed.

The source of truth for the intended product flow is the uploaded Word master prompt:
`C:\Users\SARATHY\Downloads\NeethiMitra AI master.docx`

## Core Backend Function

NeethiMitra backend is a FastAPI service for a voice-first multilingual legal-aid app.

Main job of the backend:

1. Accept citizen input as text or voice
2. Detect and preserve the user language
3. Translate legal queries into English for AI reasoning
4. Route the query into the correct legal category
5. Generate legal guidance
6. Translate the answer back into the user language
7. Generate TTS audio for the answer
8. Support document uploads for legal context
9. Generate downloadable complaint PDFs
10. Expose clean APIs for the frontend app

## Intended Master Pipeline

### Voice flow

1. Voice comes from frontend
2. STT transcribes in native language
3. Language ID confirms the exact language code
4. Translation converts native language to English in formal mode
5. Legal AI classifies and answers the query
6. Translation converts English back to native language in modern-colloquial mode
7. TTS generates audio response
8. Backend returns text response, audio URL, and optionally complaint PDF URL

### Text flow

1. User types in native language
2. Language ID runs on the text
3. Translation converts to English
4. Legal AI answers
5. Translation converts answer back to native language
6. TTS audio is also generated for accessibility

### Document flow

1. User uploads PDF or image
2. Backend stores the file
3. Background task runs Sarvam Vision extraction
4. Extracted text is saved in DB
5. Future legal responses can use that document context

## Current Backend Structure

Backend folder:
`D:\NeethiMithra AI\neethimitra-backend`

Important files:

- `app/main.py`
- `app/config.py`
- `app/database.py`
- `app/models.py`
- `app/schemas.py`
- `app/core/security.py`
- `app/core/dependencies.py`
- `app/routers/auth.py`
- `app/routers/sessions.py`
- `app/routers/chat.py`
- `app/routers/documents.py`
- `app/routers/complaints.py`
- `app/routers/files.py`
- `app/services/sarvam_stt.py`
- `app/services/sarvam_lid.py`
- `app/services/sarvam_translate.py`
- `app/services/sarvam_tts.py`
- `app/services/sarvam_vision.py`
- `app/services/legal_ai.py`
- `app/services/pdf_generator.py`
- `app/agent/classifier.py`
- `app/agent/prompts.py`

## What Has Been Implemented

### 1. Config and storage

Implemented in `app/config.py`

- Environment-based settings
- Upload size limit
- Dedicated storage directories for:
  - audio
  - complaint PDFs
  - uploads
- Path resolution for local and production storage
- Storage directory creation helper

### 2. Database and models

Implemented in `app/models.py`

Current core tables:

- `users`
- `refresh_tokens`
- `sessions`
- `messages`
- `documents`
- `complaints`
- `helplines`

Added fields for backend readiness:

- `messages.category`
- `documents.sarvam_job_id`

Migration added:

- `alembic/versions/6c8e3df8b7f1_add_message_category_and_document_job.py`

### 3. Auth layer

Implemented in `app/routers/auth.py`

Available auth flows:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/request-otp`
- `POST /api/auth/verify-otp`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/guest`

Current auth status:

- Phone normalization added
- Access token issuing works
- Refresh token rotation works
- Guest flow works
- OTP flow is scaffolded and frontend-ready
- Real SMS provider is not yet wired

### 4. Session APIs

Implemented in `app/routers/sessions.py`

Available:

- create session
- list sessions
- get session
- soft delete session

Session detail now supports returning richer backend context for later frontend use.

### 5. Chat pipeline

Implemented in `app/routers/chat.py`

Current flow:

- Accept text or voice input
- STT for voice
- language detection
- translate to English using formal mode
- category resolution
- inject extracted document context
- legal response generation
- translate back to session language using modern-colloquial mode
- generate TTS audio
- save user and assistant messages

### 6. Document pipeline

Implemented in `app/routers/documents.py`

Current flow:

- validate file type
- validate file size
- save upload
- create DB row with `pending`
- trigger background processing
- update to `processing`, then `completed` or `failed`
- persist extracted text
- create assistant info message

New endpoint:

- `GET /api/sessions/{id}/documents`

### 7. Complaint generation

Implemented in `app/routers/complaints.py`

Available:

- generate complaint PDF
- fetch latest complaint for session

PDF builder improved in `app/services/pdf_generator.py`

### 8. Static file serving

Implemented in `app/routers/files.py`

Available:

- `GET /static/audio/{file}`
- `GET /static/complaints/{file}`
- `GET /static/uploads/{file}`

This is important because production storage may live on Render Disk instead of only local `static/`.

### 9. Health check

Implemented in `app/main.py`

- `GET /health`

### 10. Deployment

Updated in `render.yaml`

Includes:

- backend rootDir
- build with Alembic migration
- PostgreSQL database definition
- persistent Render Disk mount
- storage env vars for `/data`

## Current Production-Ready Areas

These parts are now in much better shape for later frontend connection:

- auth contract shape
- refresh/logout token lifecycle
- session CRUD
- document status endpoint
- complaint generation endpoint
- stable file URLs
- environment-driven storage
- deploy config with persistent disk
- DB migration for new metadata

## Still Not Fully Complete

The backend is stronger now, but these items are still pending before calling it fully production-complete.

### 1. Real SMS OTP provider

Current status:

- OTP logic exists
- OTP is mocked in backend memory

Still needed:

- MSG91 or Twilio integration
- persistence or cache for OTPs
- rate limiting
- resend rules

### 2. Real Sarvam Language ID

Current status:

- `sarvam_lid.py` exists as a stub/fallback

Still needed:

- actual API integration

### 3. Real Sarvam-30B legal reasoning

Current status:

- `legal_ai.py` returns structured fallback guidance
- agent classification and prompt scaffolding exists

Still needed:

- real Sarvam-30B chat completion integration
- proper prompt assembly
- category-specific system prompts passed into the model

### 4. WebSocket live voice pipeline

Current status:

- REST chat endpoint works

Still needed:

- `/ws/voice`
- PCM chunk streaming
- real-time transcript / translation / response events

### 5. Better guest restrictions

Master prompt requirement:

- guest mode should limit AI queries

Current status:

- guest token expiry exists
- guest query limit setting exists

Still needed:

- actual enforcement of query count limit

### 6. Helpline data APIs

Current status:

- `helplines` model exists

Still needed:

- endpoint to list helplines by category
- optional seed data migration

### 7. Tests

Current status:

- syntax verification done with `compileall`

Still needed:

- unit tests
- endpoint tests
- auth flow tests
- document flow tests
- complaint generation tests

## Backend APIs Expected For Frontend Later

These are the main endpoints your frontend can plan around:

- `POST /api/auth/request-otp`
- `POST /api/auth/verify-otp`
- `POST /api/auth/refresh`
- `POST /api/auth/logout`
- `POST /api/auth/guest`
- `POST /api/sessions`
- `GET /api/sessions`
- `GET /api/sessions/{id}`
- `DELETE /api/sessions/{id}`
- `POST /api/sessions/{id}/messages`
- `POST /api/sessions/{id}/documents`
- `GET /api/sessions/{id}/documents`
- `POST /api/sessions/{id}/complaint`
- `GET /api/sessions/{id}/complaint`
- `GET /health`
- `GET /static/audio/{file}`
- `GET /static/complaints/{file}`
- `GET /static/uploads/{file}`

## Recommended Next Backend Steps

Priority order:

1. Wire real Sarvam-30B legal response service
2. Wire real Sarvam LID
3. Implement real SMS OTP sending
4. Add guest query-limit enforcement
5. Add WebSocket voice endpoint
6. Add helpline API and seed data
7. Add automated tests
8. Run full end-to-end local verification

## Verification Already Done

Completed:

- Python compile check for `app/`
- Python compile check for `alembic/`

Commands used:

```powershell
python -m compileall neethimitra-backend/app
python -m compileall neethimitra-backend/alembic
```

## Working Summary

The backend is now in a good intermediate state:

- better structured
- more frontend-ready
- safer for deployment
- closer to the master prompt architecture

It is not yet fully final-production complete, but it is now a much stronger foundation for frontend integration after the UI is finished.
