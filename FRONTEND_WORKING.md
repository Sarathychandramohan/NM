# NeethiMitra Frontend Working Notes

This document provides a complete technical explanation of the React Native / Expo frontend application for **NeethiMitra AI**, covering both the **Mobile Native** (iOS/Android) and **Web Desktop** versions.

---

## 1. Core Technology Stack

* **Framework**: React Native + Expo SDK
* **Routing**: Expo Router (File-system based navigation)
* **Styling**: NativeWind (TailwindCSS v4 style runtime) + standard stylesheet objects (for native performance)
* **State Management**: Zustand (persisted stores)
* **Animations**: React Native Reanimated (shared values, springs, and layouts)
* **Icons**: `lucide-react-native`
* **Vessel/Shell**: Custom dual-mode web layout shell (`WebAppShell.tsx`) vs native stack layout (`app/_layout.tsx`).

---

## 2. Directory Structure

The frontend code resides in `d:\NeethiMithra AI\neethimitra`:

```text
neethimitra/
├── app/                        # Expo Router Pages & Navigation Structure
│   ├── (auth)/                 # Onboarding, Splash & Authentication screens
│   │   ├── _layout.tsx         # Auth layout wrapper
│   │   ├── onboarding.tsx      # Carousel introduction
│   │   ├── phone-auth.tsx      # Localized mobile number entry screen
│   │   ├── otp-verify.tsx      # 6-digit OTP verification screen
│   │   └── splash.tsx          # Initial spin loader & auth status checker
│   ├── (tabs)/                 # Main Application Tab Views (TabNavigator)
│   │   ├── _layout.tsx         # Bottom tab layout configuration
│   │   ├── index.tsx           # Home dashboard (Welcome, Inputs, Categories)
│   │   ├── chat-history.tsx    # Consultation log list
│   │   ├── my-files.tsx        # Uploaded documents library & scanner
│   │   └── profile.tsx         # Settings (Theme, Language, Text Size)
│   ├── chat/
│   │   └── [category].tsx      # Multi-mode conversational interface
│   ├── web-landing.tsx         # Optional public-facing landing page
│   └── _layout.tsx             # Root layout with providers & global overlays
│
├── src/
│   ├── components/
│   │   ├── home/               # CategoryCard, WelcomeBanner, InputZone, etc.
│   │   ├── overlays/           # RecordingOverlay, LanguagePicker, ConfirmModal
│   │   ├── ui/                 # Sidebar drawer, CustomTabBar, TopAppBar, Logo
│   │   └── web/                # WebAppShell desktop wrapper
│   │
│   ├── constants/
│   │   ├── colors.ts           # Standardized color system (Light/Dark tokens)
│   │   ├── languages.ts        # Metadata list of the 11 supported locales
│   │   └── translations.ts     # Master UI translations file (Static lookup)
│   │
│   ├── store/
│   │   └── useAppStore.ts      # Zustand global state manager
│   │
│   ├── theme/
│   │   └── ThemeContext.tsx    # Theme context provider
│   │
│   └── utils/
│       └── haptics.ts          # Safe haptics triggers wrapper (no-op on web)
```

---

## 3. Multilingual Translation Engine

The frontend complies strictly with the **Version 1 Multilingual Specification**:

### Supported Locales (11 Languages)
We support exactly these 11 languages throughout the application:
1. `en-IN` (English)
2. `hi-IN` (Hindi)
3. `bn-IN` (Bengali)
4. `ta-IN` (Tamil)
5. `te-IN` (Telugu)
6. `kn-IN` (Kannada)
7. `ml-IN` (Malayalam)
8. `mr-IN` (Marathi)
9. `gu-IN` (Gujarati)
10. `pa-IN` (Punjabi)
11. `od-IN` (Odia - renamed from `or-IN`)

### Zero API Calls for Static UI
All static UI text, navigation tabs, buttons, dialog messages, error messages, and descriptions are loaded locally from `translations.ts` via the user's selected language:
```typescript
const { selectedLanguage } = useAppStore();
const t = UI_TRANSLATIONS[selectedLanguage.code] || UI_TRANSLATIONS['en-IN'];
```

### Dynamic Conversation Translation (⇄ Toggle)
Every message object is stored in the database with two string fields:
- `text`: Native language version transcribed by STT or typed by user.
- `englishTranslation`: Reasoning/response translated into English by the backend.

The user can toggle the display language of individual user or assistant message bubbles dynamically on the screen using the cached translations. **No API calls are made when toggling.**

---

## 4. UI Shells: Responsive Parity (Web vs. Mobile)

NeethiMitra uses platform detection (`Platform.OS === 'web'`) to render distinct, premium layouts optimized for browsers and native mobile screens.

### 🌐 Web Desktop Shell (`WebAppShell.tsx`)
* Renders a left-anchored **Collapsible Sidebar** and a **Top Header Bar**.
* **Arrow Toggle Collapse**: Collapses sidebar from 280px (full text + icons) to 64px (icons-only). The collapse state is stored in `localStorage` so it persists across page navigations.
* **Centered Modal Dialogs**: Overlays like language selection and voice recording show as centered cards rather than bottom sheets.
* **Glassmorphism Styling**: Uses browser-native backdrop blur filters (`backdropFilter: 'blur(20px)'`) and translucent cards for premium aesthetics.

### 📱 Mobile Native Shell (`Sidebar.tsx` & `CustomTabBar.tsx`)
* **Sidebar Drawer**: Renders as a sliding drawer on the left side of the screen using Reanimated spring animations (`translateX`).
* **Custom Bottom Tab Bar**: Standard bottom navigation with standard React Native layouts to avoid NativeWind container sizing warnings.
* **Animated Mic FAB**: A centered microphone button in the tab bar pulsing using Reanimated looping springs (`pulseScale` / `pulseOpacity`).
* **Bottom Sheet Sheets**: Overlays render as sliding sheets animating from the bottom of the screen.

---

## 5. Zustand State Store (`useAppStore.ts`)

The store acts as the single source of truth for navigation state, user authentication, and active session conversations.

### Key State Fields
- `authToken` / `userPhone` / `userName`: User profile parameters.
- `selectedLanguage`: Current `Language` object.
- `textSize`: Preferred scale (`'small'` | `'medium'` | `'large'`).
- `sessions`: List of historical sessions.
- `activeSession`: Currently open conversation session (category, messages).
- `documents`: List of scanned files.
- `activeOverlay`: `'recording'` | `'language'` | `'upload'` | `'confirm'` | `null`.

### Critical Async Actions
* `startSession(category)`: Creates a new session on the backend, updates local session storage, and sets `activeSession`.
* `sendMessageToBackend(text, isVoice)`: Sends input, pushes optimistic user message bubble, retrieves text answer + audio file path, and appends the assistant bubble.
* `uploadDocument(uri, filename, type)`: Uploads a document using standard standard multipart formdata (compatible with Android file URIs).

---

## 6. Crucial Overlay Components

### 🎙️ Voice Recording (`RecordingOverlay.tsx`)
* **Web Version**: Center-aligned modal displaying a microphone button, animated waveform, real-time transcript text, and explicit **Cancel** and **Send** buttons.
* **Mobile Version**: Bottom-sheet dialog sliding up with matching Cancel/Send buttons, visual waveform, and a fallback swipe-up-to-cancel gesture.
* **Clean State Isolation**: Always runs `chunksRef.current = []` at recording start to prevent old audio blobs from concatenating into new recording streams.

### 🌐 Language Selector (`LanguagePicker.tsx`)
* **Web Version**: Vertical scrollable list of BCP-47 codes, native names, and English labels, with committed **OK** and **Cancel** buttons at the bottom.
* **Mobile Version**: 3-column Grid Cards featuring country flag emojis and native titles, automatically saving and closing on tap.

---

## 7. Performance & Stability Rules

1. **Wait for StartSession**: Expo Router navigation (`router.push`) must always happen *after* awaiting `startSession(...)` to ensure components mount with an active session ID already in state.
2. **Standard Styles over ClassNames**: Never use NativeWind class names (`className`) on third-party or native components (like `LinearGradient` or `Animated.View`) as this causes compilation crashes or console errors during rendering. Use inline style objects.
3. **Locale-Aware Formatting**: Always pass `selectedLanguage.code` to date/time formatters (`toLocaleDateString`) to ensure time stamps match the chosen locale.
