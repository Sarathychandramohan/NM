# NeethiMitra AI (Justice Friend) — Complete Project Documentation

> **Hackathon Entry:** Sarvam AI Hackathon  
> **Sponsors:** Sarvam AI + Render + Expo  
> **Target Audience:** Indian citizens requiring regional language, voice-first, and document-supported emergency legal assistance.

NeethiMitra AI is a web-first and mobile-first, voice-enabled legal assistance platform designed to empower Indian citizens who lack access to legal counsel. It provides real-time, simplified legal guidance in 11 Indian regional languages, processes uploaded legal documents (notices, receipts, agreements, FIR copies) via Sarvam Vision OCR, streams real-time voice input via WebSockets, and drafts official, print-ready formal legal complaints (PDF) for police stations or consumer forums using a 2-step AI generation workflow.

---

## 1. Project Overview & Core Emergency Legal Categories

NeethiMitra AI is structured around **7 emergency legal categories** common to citizens needing immediate guidance:

| # | Category | Target Audience / Use Cases | Key Legal Acts & Frameworks |
|---|----------|-----------------------------|----------------------------|
| 1 | **Cyber Fraud** | Scams, unauthorized bank debits, OTP fraud | IT Act 2000 (Sec 66C & 66D), National Cyber Crime Portal (1930) |
| 2 | **Police & FIR** | Filing FIR, police harassment, arrest rights, bail | Bharatiya Nagarik Suraksha Sanhita (BNSS), CrPC, IPC |
| 3 | **Land & Property** | Encroachment, boundary disputes, patta/chitta, illegal sale | Transfer of Property Act 1882, CPC Sec 80 |
| 4 | **Domestic Violence & Family** | Abuse survivors, protection orders, maintenance | Protection of Women from Domestic Violence Act 2005 |
| 5 | **Consumer Rights** | Defective goods, service fraud, warranty breach | Consumer Protection Act 2019, District Consumer Forum |
| 6 | **Senior Citizen Protection** | Maintenance denial, eviction by heirs, elder abuse | Maintenance & Welfare of Parents and Senior Citizens Act 2007 |
| 7 | **RTI & Government Services** | Public authority inaction, delayed services, information requests | Right to Information Act 2005 |

---

## 2. Core Operational Workflows & AI Pipelines

### 2.1 — Real-Time Multilingual Voice & Text Pipeline
NeethiMitra provides a seamless voice-first and text interaction pipeline supporting **11 Indian languages**:

`
USER INPUT (Text or 500ms Voice Chunks)
    │
    ├─── [TEXT QUERY] ─────────────┐
    │                              ▼
    └─── [WEBSOCKET /ws/stt] ──→ Saaras v3 STT (Language Auto-Detect, 16kHz Mono)
                                   │
                           Transcribed Query
                                   │
                                   ▼
                    Mayura Translation (Regional → English Formal)
                                   │
                         English Legal Query
                                   │
                        ┌──────────▼──────────┐
                        │  Legal AI Engine    │  ← Injected Context:
                        │   (sarvam-30b)      │    - Last 10 conversation turns
                        │                     │    - Sarvam Vision OCR markdown
                        └──────────┬──────────┘
                                   │ English Legal Advice (Domain-Tuned)
                        ┌──────────▼──────────┐
                        │  Mayura Translation │  (English → Regional Language)
                        └──────────┬──────────┘
                                   │ Regional Response Text
                        ┌──────────▼──────────┐
                        │  Bulbul v3 TTS      │  (Cleaned text via clean_for_tts regex,
                        └──────────┬──────────┘   Speaker: "ishita", Pace: 0.95)
                                   │
USER OUTPUT: Regional text + Dual-Language Toggle (⇄ English) + Audio Playback (Bulbul v3 WAV)
`

### 2.2 — Document Digitization Pipeline (Sarvam Vision)
When users upload documents (notices, receipts, contracts, bank statements), the backend executes an asynchronous 6-step job pipeline using Sarvam Vision:
1. **Job Initialization**: Spawns job ID on Sarvam Vision API (/doc-digitization/job/v1).
2. **Pre-signed URL Fetch**: Retrieves secure S3 upload URL.
3. **Binary Storage**: Directly uploads file bytes (pplication/pdf, image/png, image/jpeg).
4. **Processing Start**: Initiates digitization with output_format="markdown".
5. **Async Polling**: Polls job state until "Completed".
6. **Context Ingestion**: Saves extracted Markdown into PostgreSQL under documents.extracted_text and injects context into subsequent LLM chat turns.

### 2.3 — 2-Step AI Complaint PDF Drafting Workflow
1. **Extraction**: sarvam-30b analyzes session history and extracted document context to generate structured JSON containing facts, dates, accused party details, and legal sections.
2. **Drafting**: sarvam-30b formats formal legal complaint prose based on the structured JSON.
3. **PDF Generation**: ReportLab compiles the formal prose into a print-ready PDF with letterheads, subject lines, signature blocks, and verification hashes.

---

## 3. Sarvam AI Model Configurations & Specifications

| Function | Pinned Model | Endpoint | Parameters & Configuration |
|---|---|---|---|
| **Legal AI Reasoning** | sarvam-30b | /v1/chat/completions | Domain-aware easoning_effort (None for factual Q&A, "low" for property/police/cyber), 	emperature: 0.3, dynamic token budgets (450–800 max tokens). |
| **Speech-to-Text** | saaras:v3 | /speech-to-text & /ws/stt | language_code="unknown" (auto-detect), mode="transcribe", WebSockets 500ms streaming timeslice, 16kHz mono audio input. |
| **Translation** | mayura:v1 | /translate | mode="formal" for input, mode="modern-colloquial" for output. Pre-strips markdown symbols (##, **) to prevent garbled script. |
| **Text-to-Speech** | ulbul:v3 | /text-to-speech | Default speaker: "ishita", pace: 0.95, enable_preprocessing: true. Custom clean_for_tts() pre-strips markdown, section marks (§, ¶), and double danda (॥ → ।). |
| **Document OCR** | Sarvam Vision | /doc-digitization/job/v1 | Asynchronous 6-step pipeline producing clean Markdown formatting. |

---

## 4. Resilience & Dual-Layer Rate Limiting Architecture

To prevent Sarvam API rate limit breaches (429 Too Many Requests) and protect against user quota abuse, NeethiMitra backend features a custom sliding-window rate limiter (pp/utils/rate_limiter.py):

### 4.1 — Global Sarvam Account Limits (Starter Plan Buffer)
- **LLM (sarvam-30b)**: 38 requests/min (Sarvam limit: 40/min)
- **STT REST (saaras:v3)**: 58 requests/min (Sarvam limit: 60/min)
- **STT Batch**: 18 requests/min (Sarvam limit: 20/min)
- **TTS (ulbul:v3)**: 28 requests/min (Sarvam Starter limit: 30/min)
- **Translation (mayura:v1)**: 58 requests/min (Sarvam limit: 60/min)

### 4.2 — Per-User Policy Limits
- **Guest Users**: Max 5 LLM / 10 STT / 5 TTS requests per minute.
- **Authenticated Users**: Max 15 LLM / 30 STT / 15 TTS requests per minute.
- **Eviction**: Automatic background cleanup task evicts idle user limiters after 5 minutes of inactivity.

### 4.3 — Telemetry & Monitoring Dashboard
- **Endpoint**: GET /api/internal/rate-limits (Protected via X-Monitor-Key header).
- **Metrics**: Real-time capacity utilization %, active request counts, total calls, and average wait times in milliseconds.

---

## 5. Technical Stack & Architecture

### Backend Stack (
eethimitra-backend/)
* **Framework**: FastAPI (Python 3.11+)
* **Server**: Uvicorn
* **Database**: PostgreSQL (Production) / SQLite (Development) with SQLAlchemy 2.0 ORM
* **Migrations**: Alembic
* **Resilience**: 	enacity exponential backoff retries on external network calls
* **PDF Engine**: ReportLab PDF library
* **Authentication**: Google OAuth 2.0 + JWT Access Tokens (8h) & Refresh Tokens (30 days) + Guest Mode (3 free queries limit)

### Frontend Stack (
eethimitra/)
* **Framework**: React Native + Expo SDK 56 (Universal codebase targeting Web Browsers, iOS, and Android)
* **Routing**: Expo Router (file-system navigation)
* **Desktop Shell**: WebAppShell.tsx featuring collapsible left sidebar, header status indicators, and responsive glassmorphic modal cards
* **State Management**: Zustand persisted store (useAppStore.ts)
* **Microphone Input**: Web MediaRecorder (500ms timeslice) / Expo Audio (Native)

---

## 6. Directory Structure

`	ext
NeethiMithra AI/
├── neethimitra/               ← Frontend App (React Native / Expo)
│   ├── app/
│   │   ├── (tabs)/            ← Dashboard, History, My Files, Profile
│   │   ├── (auth)/            ← Onboarding, Phone OTP auth, Splash
│   │   ├── chat/
│   │   │   └── [category].tsx ← Legal category chat screen
│   │   └── _layout.tsx        ← Root router layout
│   ├── src/
│   │   ├── components/        ← Overlays (RecordingOverlay, LanguagePicker), WebAppShell
│   │   ├── store/             ← useAppStore.ts (Zustand state)
│   │   └── constants/         ← translations.ts (Static 11-language UI strings)
│   └── package.json
│
├── neethimitra-backend/       ← Backend Server (FastAPI)
│   ├── app/
│   │   ├── middleware/        ← rate_limit_deps.py (FastAPI dependencies)
│   │   ├── utils/             ← rate_limiter.py (Sliding-window limiter)
│   │   ├── routers/           ← auth, chat, documents, complaints, stt_ws, monitoring
│   │   ├── services/          ← legal_ai, sarvam_stt, sarvam_tts, sarvam_translate, sarvam_vision, pdf_generator
│   │   ├── models.py          ← SQLAlchemy database models
│   │   ├── config.py          ← Settings & MODEL_CONFIG constants
│   │   └── main.py            ← FastAPI entry point & lifespan manager
│   ├── requirements.txt
│   └── render.yaml            ← Render deployment blueprint
`

---

## 7. Key API Endpoints Reference

| Method | Endpoint | Authorization | Description |
|---|---|---|---|
| **POST** | /api/auth/register | None | Register email/phone + password account |
| **POST** | /api/auth/login | None | Authenticate credentials → JWT Tokens |
| **POST** | /api/auth/google | None | Google OAuth ID Token login |
| **POST** | /api/auth/guest | None | Spawns temporary anonymous guest session |
| **POST** | /api/sessions | JWT / Guest | Create new legal folder session |
| **GET** | /api/sessions | JWT / Guest | Fetch user's active legal sessions |
| **POST** | /api/sessions/{id}/messages | Rate Limited | Send text query, run translation + legal AI reasoning |
| **POST** | /api/sessions/{id}/messages/voice | Rate Limited | Upload REST voice recording, transcribe & run legal AI |
| **WS** | /ws/stt | Rate Limited | Real-time WebSocket microphone streaming (500ms chunks) |
| **POST** | /api/sessions/{id}/messages/{msg_id}/speak | Rate Limited | Synthesize Bulbul v3 TTS audio for any message |
| **POST** | /api/sessions/{id}/documents | JWT / Guest | Upload document for async Sarvam Vision OCR |
| **POST** | /api/sessions/{id}/complaint | JWT / Guest | Draft structured 2-step legal complaint PDF |
| **GET** | /api/internal/rate-limits | X-Monitor-Key | Read real-time rate limit telemetry dashboard |

---

## 8. Deployment & Execution Instructions

### Local Development Setup
`powershell
# 1. Backend Setup
cd neethimitra-backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 2. Frontend Setup
cd ../neethimitra
npm install
npx expo start --web
`

### Production Deployment (Render)
The root ender.yaml automatically builds and deploys the backend with environment secrets (SARVAM_API_KEY, SECRET_KEY, DATABASE_URL).
