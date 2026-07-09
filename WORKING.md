# NeethiMitra AI — Overall Application Architecture

This document serves as the master guide for the entire **NeethiMitra AI** platform, detailing how the FastAPI backend, the React Native/Expo frontend (Web & Mobile), and the database work together to provide a voice-first, multilingual legal assistant.

---

## 1. System Overview

NeethiMitra AI is designed to help citizens understand their legal rights and draft formal documents (like FIRs or RTI applications) in their native languages.

```text
                  +-----------------------------------+
                  |      React Native / Expo App      |
                  |     (Mobile iOS/Android & Web)    |
                  +-----------------+-----------------+
                                    |
                                    | REST APIs (JSON / FormData)
                                    v
                  +-----------------+-----------------+
                  |          FastAPI Backend          |
                  +--------+-----------------+--------+
                           |                 |
     AI Reasoning & RAG    |                 | Database Storage
                           v                 v
            +--------------+---+     +-------+---------+
            |    Sarvam AI     |     |   PostgreSQL /  |
            |   & LLM APIs     |     |    SQLite DB    |
            +------------------+     +-----------------+
```

---

## 2. Technology Stack

### Frontend (Mobile & Web)
* **Framework**: React Native + Expo SDK (Single codebase targeting iOS, Android, and Web browsers).
* **Routing**: Expo Router (file-system based).
* **State Management**: Zustand persisted stores.
* **Styling**: NativeWind + Tailwind CSS.

### Backend & API Layer
* **Framework**: FastAPI (Python 3.10+).
* **Database Interface**: SQLAlchemy ORM.
* **Authentication**: JWT token-based authentication (OAuth2 Password Bearer).
* **AI Pipelines**: Sarvam AI (STT, LID, Translate, TTS, Vision) and Legal LLM.

### Database
* **Database**: SQLite (for local development) / PostgreSQL (for production).
* **Tables**: `users`, `sessions`, `messages`, `documents`.

---

## 3. Core Multilingual Pipeline Flows

### A. Conversation Workflow (Voice & Text)
1. **User input**: The user submits text or records voice in one of the 11 supported regional Indian languages.
2. **Speech-to-Text (STT)**: If the input is voice, the backend transcribes it using Sarvam STT.
3. **Language Identification (LID)**: Confirms the exact language code (e.g. `hi-IN`, `ta-IN`).
4. **Translation to English**: The backend translates the native query into English (formal mode) so the Legal LLM can reason accurately.
5. **AI Inference**: The Legal LLM generates a response in English.
6. **Translation to Native**: The English response is translated back to the user's native language.
7. **Text-to-Speech (TTS)**: The backend generates a speech audio file path for accessibility.
8. **Double-Message Storage**: The database stores **both** the native and English versions of every message. The frontend uses this to allow instant `⇄` language toggling without making new API requests.

### B. Document Scan Workflow (Vision)
1. **Upload**: User uploads an image or PDF scanner file.
2. **Text Extraction**: The backend processes it using Sarvam Vision OCR.
3. **Storage**: Extracted text is saved, allowing the user to consult the assistant using that document's context.

---

## 4. Master Directory Structure

```text
NeethiMithra AI/
├── neethimitra/               # React Native / Expo Frontend App
│   ├── app/                   # Expo Router routes ((auth), (tabs), chat/)
│   ├── src/
│   │   ├── components/        # UI overlays, home widgets, and WebAppShell wrapper
│   │   ├── constants/         # translations.ts (Master Static UI lookup)
│   │   └── store/             # useAppStore.ts (Global Zustand store)
│   └── package.json           # Frontend dependencies
│
├── neethimitra-backend/       # FastAPI Python Backend
│   ├── app/
│   │   ├── core/              # Security and auth dependencies
│   │   ├── routers/           # auth, chat, sessions, documents, complaints routers
│   │   ├── services/          # Sarvam AI integrations & Legal LLM connectors
│   │   ├── models.py          # SQLAlchemy models
│   │   └── main.py            # FastAPI entry point
│   ├── requirements.txt       # Python dependencies
│   └── .env                   # API keys and connection parameters
```

---

## 5. Working Reference Guides

* For detailed frontend features, page layouts, and styling rules, refer to:
  `FRONTEND_WORKING.md`
* For detailed backend configuration, API contracts, and router logic, refer to:
  `BACKEND_WORKING.md`
