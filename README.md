# NeethiMitra AI (Justice Friend) — Complete Project Documentation
> **Hackathon Entry:** Sarvam AI Hackathon 
> **Sponsors:** Sarvam AI + Render + Expo
> **Target Audience:** Indian citizens needing regional language, voice-first, and document-supported legal aid.

NeethiMitra AI is a mobile-first, voice-first legal assistance platform designed for Indian citizens who cannot afford lawyers. It provides instantaneous legal guidance in local Indian languages, processes uploaded evidence (receipts, notices, agreements) via document intelligence, and drafts official, print-ready complaint PDFs for local police stations or consumer forums.

---

## 1. PROJECT OVERVIEW & TARGET AUDIENCE

The application is structured around **6 core emergency legal categories** common to citizens needing immediate help:

| # | Category | Target Users | Key Legal Context / Act |
|---|----------|-------------|-------------------------|
| 1 | **Cyber Fraud** | Scam / OTP fraud victims | IT Act 2000, Section 66C & 66D |
| 2 | **Domestic Violence** | Abuse survivors | Protection of Women from Domestic Violence Act, 2005 |
| 3 | **Land Dispute** | Property conflict victims | Transfer of Property Act 1882, CPC Section 80 |
| 4 | **Labor & Wage** | Cheated workers | Payment of Wages Act 1936, Industrial Disputes Act 1947 |
| 5 | **Consumer Rights** | Product/service fraud victims | Consumer Protection Act 2019 |
| 6 | **Senior Citizen Protection** | Elderly abuse victims | Maintenance & Welfare of Parents and Senior Citizens Act 2007 |

---

## 2. THE CORE WORKFLOWS & INTERACTION PIPELINES

### 2.1 — Audio Dual-Path Interaction Pipeline
To support low-literacy or regional-language-only users, NeethiMitra implements a voice-first dual path:
```
USER INPUT
    │
    ├─── [TEXT] ──→ Mayura Translation (Regional → English)
    │                        │
    └─── [VOICE] ──→ Saaras v3 STT (Translate Mode: Regional Voice → English Text)
                             │
                    ┌────────▼────────┐
                    │  Legal AI Engine │  ← Context Injected from Sarvam Vision
                    │  (English LLM)   │    (Extracted document text)
                    └────────┬────────┘
                             │ English Legal Advice / Response
                    ┌────────▼────────┐
                    │  Mayura         │ (Translate English → Regional Language)
                    └────────┬────────┘
                             │ Regional Response Text
                    ┌────────▼────────┐
                    │  Bulbul v3      │ (Generate .wav Audio File)
                    └────────┬────────┘
                             │
USER OUTPUT: Regional text displayed on screen + Audio playback of response
```
*Enhancement:* When voice input is used, the backend translates the transcribed English query back to the user's preferred regional language using Mayura to display accurate transcriptions in their local chat history logs.

### 2.2 — Document Digitization Sub-pipeline
When a user uploads a document (bank statements, written notes, fraud screenshots), the backend processes it asynchronously using Sarvam Vision to extract structured Markdown and feeds it directly to the Legal AI Engine:
```
USER UPLOADS PDF/IMAGE
    │
    ▼
FastAPI saves file locally to static/uploads/
    │
    ▼
Sarvam Vision Job Pipeline (6-step async process)
    │
    ▼
Extracted Markdown saved in DB under Document.extracted_text
    │
    ▼
Injected into Legal AI context on subsequent user messages
```

---

## 3. SARVAM AI MODEL SPECIFICATIONS (BACKEND INTEGRATION)

### 3.1 — Saaras v3 (Speech-to-Text)
Converts regional language voice recordings directly to English.
* **Endpoint:** `POST https://api.sarvam.ai/speech-to-text`
* **Headers:** `api-subscription-key: <KEY>`
* **Payload Type:** `multipart/form-data`
* **Key Fields:**
  - `file`: The raw audio binary (WAV/MP3)
  - `model`: `"saaras:v3"`
  - `language_code`: BCP-47 regional code (e.g. `hi-IN`, `ta-IN`, `te-IN`, `kn-IN`)
  - `mode`: `"translate"` (Directly outputs translated English text, omitting a translation step)
* **Response Format:**
  ```json
  { "transcript": "The user's spoken words in English" }
  ```

### 3.2 — Mayura (Translation)
Translates text between English and Indian regional languages.
* **Endpoint:** `POST https://api.sarvam.ai/translate`
* **Headers:** `api-subscription-key: <KEY>`, `Content-Type: application/json`
* **Payload Format:**
  ```json
  {
    "input": "Text to translate",
    "source_language_code": "hi-IN",
    "target_language_code": "en-IN"
  }
  ```
* **Response Format:**
  ```json
  { "translated_text": "Translated output text" }
  ```

### 3.3 — Bulbul v3 (Text-to-Speech)
Synthesizes regional text into realistic audio.
* **Endpoint:** `POST https://api.sarvam.ai/text-to-speech`
* **Headers:** `api-subscription-key: <KEY>`, `Content-Type: application/json`
* **Payload Format:**
  ```json
  {
    "text": "Text to convert (Max 500 characters)",
    "target_language_code": "ta-IN",
    "speaker": "shubh"  # or "ananya"
  }
  ```
* **Response Format:**
  ```json
  {
    "audios": ["<base64_encoded_wav_string>"]
  }
  ```
* **Processing:** The base64 audio string is decoded and written as a binary file to `static/audio/tts_<uuid>.wav`, and the server returns the static asset URL.

### 3.4 — Sarvam Vision (Document Digitization API)
An asynchronous, job-based workflow designed to handle complex files (such as multi-page PDFs or image collections).

1. **Step 1: Create Job**
   - `POST https://api.sarvam.ai/doc-digitization/job/v1`
   - Response: `{ "job_id": "job_uuid_here" }`
2. **Step 2: Get Pre-signed Upload URL**
   - `POST https://api.sarvam.ai/doc-digitization/job/v1/upload-files`
   - Body: `{ "job_id": "job_uuid", "files": [{"file_name": "user_doc.pdf", "file_type": "pdf"}] }`
   - Response: `{ "upload_urls": [{"file_name": "user_doc.pdf", "url": "<s3_upload_url>"}] }`
3. **Step 3: Upload File**
   - `PUT <s3_upload_url>`
   - Body: raw file bytes, Header: `Content-Type: application/pdf` (or `image/png`/`image/jpeg`)
4. **Step 4: Start Processing**
   - `POST https://api.sarvam.ai/doc-digitization/job/v1/start`
   - Body: `{ "job_id": "job_uuid", "output_format": "markdown" }`
5. **Step 5: Poll Job Status**
   - `GET https://api.sarvam.ai/doc-digitization/job/v1/status?job_id=job_uuid`
   - Polled every 3 seconds (max 120s timeout). Wait until `job_state == "Completed"`.
   - Response: `{ "job_state": "Completed", "output_files": ["user_doc_output.md"] }`
6. **Step 6: Download Extracted Text**
   - `POST https://api.sarvam.ai/doc-digitization/job/v1/download-files`
   - Body: `{ "job_id": "job_uuid", "files": ["user_doc_output.md"] }`
   - Response: `{ "download_urls": [{"file_name": "user_doc_output.md", "url": "<s3_download_url>"}] }`
   - Fetch `<s3_download_url>` to retrieve the raw Markdown string.

---

## 4. TECHNICAL STACK & DEPENDENCIES

### 4.1 — Backend Stack
* **Framework:** FastAPI (Python 3.11+)
* **Server:** Uvicorn
* **Database:** SQLite (local development) / PostgreSQL (production deployment)
* **ORM:** SQLAlchemy v2
* **Migrations:** Alembic
* **PDF Drafting:** ReportLab (Draws formal complaint layouts with header margins, subject line, body context, and unique signature verification hashes)
* **Auth Support:** JWT (`python-jose`) + BCrypt (`passlib`) for secure onboarding (bypass active in development)
* **HTTP Client:** `httpx` (async requests)

### 4.2 — Frontend Stack
* **Framework:** React Native + Expo SDK 56 (upgraded to work with latest Expo Go client)
* **State Management:** Zustand (central store tracking current session, chat list, audio player states)
* **Navigation:** Expo Router (tab-based navigation)
* **Audio Playback:** `expo-av` (mobile playback support)
* **File Uploads:** React Native `FormData` (transmits raw audio binaries/images to endpoints)

---

## 5. DATABASE SCHEMA & RELATIONSHIPS

The database consists of **7 tables** managed via SQLAlchemy:

```mermaid
erDiagram
    users ||--o{ refresh_tokens : owns
    users ||--o{ sessions : starts
    users ||--o{ documents : uploads
    sessions ||--o{ messages : logs
    sessions ||--o{ documents : attaches
    sessions ||--o{ complaints : generates
    
    users {
        int id PK
        string phone UNIQUE
        string name
        string hashed_password
        string preferred_language
        bool is_active
        bool is_anonymous
        datetime created_at
    }
    
    sessions {
        string id PK "UUID"
        int user_id FK
        string title
        string category "Emergency category"
        string language_code
        bool is_active
        datetime created_at
    }
    
    messages {
        int id PK
        string session_id FK
        string role "user / assistant"
        text text_content "Regional text"
        string original_language
        string audio_url "Bulbul WAV path"
        string input_type "text / voice"
        datetime created_at
    }
    
    documents {
        int id PK
        string session_id FK
        int user_id FK
        string filename
        string file_path
        string mime_type
        int file_size_kb
        string analysis_status "pending / completed / failed"
        text extracted_text "Markdown from Sarvam Vision"
        datetime created_at
    }
    
    complaints {
        int id PK
        string session_id FK
        string pdf_path
        text draft_text
        string category
        string language_code
        datetime created_at
    }
    
    refresh_tokens {
        int id PK
        int user_id FK
        string token UNIQUE
        datetime expires_at
        bool is_revoked
        datetime created_at
    }
    
    helplines {
        int id PK
        string category INDEX
        string name
        string number
        string available_hours
        string state
    }
```

---

## 6. PROJECT DIRECTORY STRUCTURE

```
NeethiMithra AI/
├── neethimitra/               ← Frontend (Expo React Native App)
│   ├── app/
│   │   ├── (tabs)/
│   │   │   ├── index.tsx      ← Home (6 legal category cards)
│   │   │   ├── chat.tsx       ← Chat screen (mic hold, text input, audio play)
│   │   │   ├── history.tsx    ← Session list
│   │   │   └── profile.tsx    ← User preferred language toggle
│   │   ├── auth/              ← Auth Screens (Login, Register, Guest)
│   │   └── _layout.tsx        ← Navigation wrapper & context provider
│   ├── components/            ← ChatBubble, AudioPlayer, VoiceRecorder, etc.
│   ├── store/
│   │   └── useAppStore.ts     ← Zustand store managing sessions and chats
│   └── package.json
│
├── neethimitra-backend/       ← Backend (FastAPI API Server)
│   ├── app/
│   │   ├── core/
│   │   │   ├── security.py    ← Passwords, tokens
│   │   │   └── dependencies.py ← get_current_user dependency (with Dev Bypass)
│   │   ├── routers/
│   │   │   ├── auth.py        ← register, login, guest auth endpoints
│   │   │   ├── sessions.py    ← CRUD for legal session folders
│   │   │   ├── chat.py        ← Dual-path voice/text processing router
│   │   │   ├── documents.py   ← Upload & digitize document route
│   │   │   └── complaints.py  ← Create/Fetch complaint PDFs
│   │   ├── services/
│   │   │   ├── sarvam_stt.py  ← Saaras v3 STT helper
│   │   │   ├── sarvam_translate.py ← Mayura translator helper
│   │   │   ├── sarvam_tts.py  ← Bulbul v3 voice helper
│   │   │   ├── sarvam_vision.py ← 6-step async document reader
│   │   │   ├── legal_ai.py    ← Category-specific legal prompt engine
│   │   │   └── pdf_generator.py ← ReportLab legal complaint builder
│   │   ├── database.py        ← SQLAlchemy DB config
│   │   ├── models.py          ← SQLAlchemy SQL models
│   │   ├── schemas.py         ← Pydantic schemas (V2 format)
│   │   └── config.py          ← Environment variables config
│   ├── alembic/               ← DB migration scripts
│   ├── static/                ← Hosted output media
│   │   ├── audio/             ← Synthesized responses
│   │   ├── uploads/           ← Document scans
│   │   └── complaints/        ← Generated PDF reports
│   ├── requirements.txt       ← Backend library list
│   ├── alembic.ini            ← Alembic configurations
│   └── .env                   ← Dev configurations (git-ignored)
│
├── render.yaml                ← Render blueprint deployment
└── .gitignore                 ← Global project gitignore
```

---

## 7. API ENDPOINT REFERENCE

All endpoints require JWT authorization unless specified as *None*.

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| **POST** | `/api/auth/register` | *None* | Register a phone number + password |
| **POST** | `/api/auth/login` | *None* | Authenticate credentials → JWT Tokens |
| **POST** | `/api/auth/guest` | *None* | Immediate anonymous session access |
| **POST** | `/api/sessions` | JWT | Create a new legal folder session |
| **GET** | `/api/sessions` | JWT | List active sessions, sorted newest first |
| **GET** | `/api/sessions/{id}` | JWT | Fetch session, including full message logs |
| **DELETE**| `/api/sessions/{id}` | JWT | Soft-delete a session (`is_active = False`) |
| **POST** | `/api/sessions/{id}/messages` | JWT | Add voice/text message, processes AI response |
| **POST** | `/api/sessions/{id}/documents` | JWT | Upload document, triggers async Sarvam Vision |
| **POST** | `/api/sessions/{id}/complaint` | JWT | Draft case facts, compile to formal PDF |
| **GET** | `/api/sessions/{id}/complaint` | JWT | Retrieve existing draft complaint details |
| **GET** | `/static/audio/{file}` | *None* | Play synthesized speech WAV files |
| **GET** | `/static/complaints/{file}` | *None* | View/Download legal complaint PDFs |

---

## 8. KEY DEVELOPMENT & TESTING FEATURES

### 8.1 — Dev Authentication Bypass
To facilitate easy testing of core legal workflows without configuring JWT flows in client prototypes:
* **Trigger:** Set `ENVIRONMENT=development` in `.env`.
* **Behavior:** The `get_current_user` dependency automatically retrieves or creates a persistent developer profile (`User.id == 1`) and registers all transactions to it.
* **Production Enforcing:** Setting `ENVIRONMENT=production` instantly activates JWT token verification checks for all routes.

### 8.2 — Sarvam API Mock Pipeline Fallbacks
If `SARVAM_API_KEY` is not supplied (remains at the placeholder `"PASTE_YOUR_SARVAM_API_KEY_HERE"`), all integration scripts degrade gracefully to mock mode to keep development unblocked:
* **STT Fallback:** Returns a mock legal query transcription string.
* **Translation Fallback:** Returns passthrough query strings or mock translated text.
* **TTS Fallback:** Generates and writes a **valid silent PCM 16-bit WAV file** using Python's `struct.pack` so audio player plugins don't crash when testing.
* **Vision Fallback:** Returns dummy parsed structured markdown tables from uploaded files.

---

## 9. CONFIGURING ENVIRONMENT VARIABLES (`.env`)

Create `.env` at `neethimitra-backend/.env` before running the backend:
```env
# Sarvam AI API Key (Set to placeholder for mock fallback testing)
SARVAM_API_KEY=PASTE_YOUR_SARVAM_API_KEY_HERE

# JWT Security
SECRET_KEY=neethimitra_dev_secret_key_replace_in_production_32chars
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=60
REFRESH_TOKEN_EXPIRE_DAYS=30

# Database
DATABASE_URL=sqlite:///./neethimitra.db

# Server Config
ENVIRONMENT=development
ALLOWED_ORIGINS=http://localhost:8081,http://localhost:8082,http://localhost:3000
MAX_UPLOAD_SIZE_MB=10
```

---

## 10. LOCAL RUN & VERIFICATION COMMANDS

Ensure your terminal working directory is `neethimitra-backend/` before executing commands:

### 10.1 — Prepare Environment
```powershell
# Create venv
python -m venv venv

# Activate venv
.\venv\Scripts\Activate.ps1

# Install requirements
pip install -r requirements.txt
```

### 10.2 — DB Migrations Setup
```powershell
# Verify migration status
alembic current

# Run/Apply database migrations
alembic upgrade head
```

### 10.3 — Run Smoke Test
Verify if all router packages and services compile without issues:
```powershell
python -c "from app.main import app; print('OK')"
```

### 10.4 — Run Uvicorn Development Server
```powershell
uvicorn app.main:app --reload --port 8000
```
* Interactive Swagger Docs: Go to `http://localhost:8000/docs`
* API Root: `http://localhost:8000/`

---

## 11. DEPLOYMENT FLOWS (Render Blueprint)

To host the FastAPI backend on Render, use the root-level [render.yaml](file:///d:/NeethiMithra AI/render.yaml) file:

```yaml
services:
  - type: web
    name: neethimitra-backend
    runtime: python
    buildCommand: pip install -r requirements.txt && alembic upgrade head
    startCommand: uvicorn app.main:app --host 0.0.0.0 --port 10000
    envVars:
      - key: SARVAM_API_KEY
        sync: false
      - key: SECRET_KEY
        sync: false
      - key: DATABASE_URL
        sync: false
      - key: ENVIRONMENT
        value: production
```
Ensure you bind the actual PostgreSQL string to `DATABASE_URL` and your secret API key to `SARVAM_API_KEY` in the Render dashboard environment variables setting.
