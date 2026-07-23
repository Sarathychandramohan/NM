# NeethiMitra Frontend Working Notes — Complete Technical Guide

This document provides a complete technical explanation of the React Native / Expo frontend application for **NeethiMitra AI**, covering both the **Mobile Native** (iOS/Android) and **Web Desktop** versions.

---

## 1. Core Technology Stack

* **Framework**: React Native + Expo SDK 56 (Single codebase targeting Web Browsers, iOS, and Android)
* **Routing**: Expo Router (File-system based navigation)
* **Styling**: NativeWind (TailwindCSS v4 style runtime) + standard React Native stylesheet objects
* **State Management**: Zustand persisted stores (useAppStore.ts)
* **Animations**: React Native Reanimated (shared values, springs, and layout animations)
* **Icons**: lucide-react-native
* **Desktop Shell**: WebAppShell.tsx (Collapsible left sidebar, top bar user info, persistent navigation)

---

## 2. Multilingual Support (11 Locales)

NeethiMitra supports exactly 11 Indian regional languages:
1. en-IN (English)
2. hi-IN (Hindi)
3. n-IN (Bengali)
4. 	a-IN (Tamil)
5. 	e-IN (Telugu)
6. kn-IN (Kannada)
7. ml-IN (Malayalam)
8. mr-IN (Marathi)
9. gu-IN (Gujarati)
10. pa-IN (Punjabi)
11. od-IN (Odia)

### Static UI Translations
All static UI text, titles, navigation tabs, buttons, dialog messages, error messages, and descriptions are loaded locally from 	ranslations.ts via UI_TRANSLATIONS[selectedLanguage.code]. **Zero API calls are made for static UI rendering.**

### Instant Dual-Language Toggle ([⇄ English])
Every message bubble stores both native text and original English translation returned by the backend. Users can instantly toggle message bubbles between regional text and English without incurring network calls.

---

## 3. Real-Time Web Voice STT (RecordingOverlay.tsx)

On Web Desktop browsers:
- **WebSocket Streaming**: Connects directly to /ws/stt.
- **500ms Timeslice**: MediaRecorder captures and sends audio chunks every 500ms for fast transcript rendering.
- **Audio Constraints**: Requested with channelCount: 1, sampleRate: 16000, echoCancellation: true, and 
oiseSuppression: true.
- **MIME Type Selection**: Dynamic codec selection via getSupportedMimeType() checking udio/webm;codecs=opus, udio/webm, udio/ogg;codecs=opus, and udio/mp4.
- **Feedback & Controls**: Real-time wave animation, connection status badge (Connecting..., Connected, Error), and committed **Cancel** / **Send** action buttons.

---

## 4. Key UI Shells & Layouts

### 🌐 Web Desktop Shell (WebAppShell.tsx)
* Left-anchored collapsible sidebar with arrow collapse toggle (stores state in localStorage).
* Header user details (Name, Email, Profile Avatar) and active session indicators.
* Centered glassmorphic modal cards (ackdropFilter: 'blur(20px)') for overlays.

### 📱 Mobile Native Shell (CustomTabBar.tsx & Sidebar.tsx)
* Sliding drawer sidebar using Reanimated spring animations.
* Custom bottom tab bar with centered mic FAB overlay trigger.
* Bottom-sheet dialog cards sliding from bottom of screen.

---

## 5. State Store (useAppStore.ts)

Central Zustand store managing authentication, language preferences, active legal sessions, message logs, and document scans.

### Core Async Actions:
- startSession(category): Creates a new legal folder session on backend.
- sendMessageToBackend(text, isVoice): Dispatches user text query, receives legal AI response + TTS URL.
- sendVoiceTranscript(transcript): Dispatches finalized real-time voice transcript to backend.
- uploadDocument(uri, filename, type): Transmits multi-part FormData for document digitization.
