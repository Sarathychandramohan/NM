import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import { LANGUAGES, Language, DEFAULT_LANGUAGE } from '@constants/languages';
import * as SecureStore from 'expo-secure-store';

// ─── API_BASE_URL ─────────────────────────────────────────────────────────
// Web browser (Chrome) : uses localhost automatically
// Android Emulator     : 10.0.2.2 maps to the host machine's localhost
// iOS Simulator        : localhost also works
// Physical device      : Change to your PC's LAN IP, e.g. 'http://192.168.1.5:8000'
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'web'
  ? 'http://127.0.0.1:8000'
  : 'http://10.0.2.2:8000');

export type Category = {
  id: string;
  label: string;
  emoji: string;
  description: string;
  colorKey: 'land' | 'police' | 'cyber' | 'health' | 'family' | 'rti' | 'general';
};

export const CATEGORIES: Category[] = [
  { id: 'land',   label: 'Land & Property',  emoji: '🏠', description: 'Disputes, documents & registry',         colorKey: 'land' },
  { id: 'police', label: 'Police & FIR',      emoji: '👮', description: 'File complaints, know your rights',      colorKey: 'police' },
  { id: 'cyber',  label: 'Cyber Fraud',       emoji: '💳', description: 'Online fraud & digital safety',          colorKey: 'cyber' },
  { id: 'health', label: 'Health Rights',     emoji: '🏥', description: 'Medical negligence & insurance',         colorKey: 'health' },
  { id: 'family', label: 'Family & Women',    emoji: '👨‍👩‍👧', description: 'Domestic issues & protection laws',     colorKey: 'family' },
  { id: 'rti',    label: 'RTI & Government',  emoji: '📋', description: 'Right to information & govt. schemes',   colorKey: 'rti' },
  { id: 'general', label: 'General Legal Query', emoji: '💬', description: "Ask any legal question if you're unsure which category it belongs to.", colorKey: 'general' },
];

// Maps backend category strings back to CATEGORIES ids robustly
export function categoryIdFromLabel(backendCategory: string): string {
  const lower = backendCategory.toLowerCase().replace(/[^a-z]/g, '');
  const match = CATEGORIES.find((c) => {
    const cLower = c.id.toLowerCase();
    const labelLower = c.label.toLowerCase().replace(/[^a-z]/g, '');
    return lower.startsWith(cLower) || lower === labelLower;
  });
  return match?.id ?? CATEGORIES[0].id;
}

export function getTextScale(textSize: 'small' | 'medium' | 'large'): number {
  if (textSize === 'small') return 0.85;
  if (textSize === 'large') return 1.18;
  return 1.0;
}

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  englishTranslation?: string;
  audioUri?: string;
  isVoice?: boolean;
  timestamp: Date;
};

export type Session = {
  id: string;
  categoryId: string;
  categoryLabel: string;
  messages: Message[];
  startedAt: Date;
};

export type UploadedDoc = {
  id: string;
  name: string;
  type: string;
  emoji: string;
  date: string;
  status: 'analysed' | 'pending' | 'failed';
  fileUrl?: string;
};

// ─── Web SecureStore Polyfill ──────────────────────────────────────────────
const webSecureStore = {
  getItemAsync: async (key: string) => {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    return SecureStore.getItemAsync(key);
  },
  setItemAsync: async (key: string, value: string) => {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },
  deleteItemAsync: async (key: string) => {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};

// ─── BUG-F009 FIX: Custom SecureStore adapter for zustand persist ────────
// Only persists small preferences (isDarkMode, selectedLanguage) — both fit
// comfortably within SecureStore's 2 KB limit per item.
const secureStoreAdapter = {
  getItem:    (name: string) => webSecureStore.getItemAsync(name),
  setItem:    (name: string, value: string) => webSecureStore.setItemAsync(name, value),
  removeItem: (name: string) => webSecureStore.deleteItemAsync(name),
};

interface AppState {
  // Theme
  isDarkMode: boolean;
  toggleDarkMode: () => void;

  // Language
  selectedLanguage: Language;
  setLanguage: (lang: Language) => void;

  // Text Size Settings
  textSize: 'small' | 'medium' | 'large';
  setTextSize: (size: 'small' | 'medium' | 'large') => void;

  // Sessions / Chat
  sessions: Session[];
  activeSession: Session | null;
  startSession: (category: Category) => Promise<void>;
  sendMessageToBackend: (text: string, isVoice?: boolean) => Promise<void>;
  sendVoiceRecording: (audioUri: string) => Promise<void>;  // BUG-F007 support
  clearActiveSession: () => void;
  loadSession: (sessionId: string) => Promise<void>;

  // PDF Generation
  generateComplaint: () => Promise<string | null>;

  // Documents
  documents: UploadedDoc[];
  uploadDocument: (uri: string, filename: string, type: string) => Promise<void>;

  // Mic
  isListening: boolean;
  setListening: (val: boolean) => void;

  // Processing
  isProcessing: boolean;
  setProcessing: (val: boolean) => void;

  // Sidebar
  isSidebarOpen: boolean;
  setSidebarOpen: (val: boolean) => void;

  // Auth States
  authToken: string | null;
  refreshToken: string | null;     // BUG-F005 addition
  userName: string | null;         // name from backend
  userPhone: string | null;        // phone from backend
  profileImage: string | null;     // Google profile photo URL
  isAnonymousGuest: boolean;       // true when no real login happened
  hasCompletedOnboarding: boolean;
  guestQueriesRemaining: number;

  checkAuthStatus: () => Promise<void>;
  requestOtp: (phone: string) => Promise<void>;
  login: (phone: string, otp: string) => Promise<void>;
  upgradeGuestAccount: (phone: string, otp: string, migrateHistory: boolean) => Promise<void>;
  loginWithGoogle: (email: string, name: string, profileImage: string) => Promise<void>;
  logout: () => Promise<void>;
  enableGuest: () => Promise<void>;
  decrementQueries: () => Promise<void>;

  // Overlays
  activeOverlay: 'recording' | 'language' | 'upload' | 'success' | 'error' | 'confirm' | 'login_prompt' | null;
  setOverlay: (overlay: 'recording' | 'language' | 'upload' | 'success' | 'error' | 'confirm' | 'login_prompt' | null) => void;
}

// ─── Helper: build auth headers ──────────────────────────────────────────
function authHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      // ── Theme ────────────────────────────────────────────────────────
      isDarkMode: false,
      toggleDarkMode: () => set((s) => ({ isDarkMode: !s.isDarkMode })),

      // ── Sidebar ──────────────────────────────────────────────────────
      isSidebarOpen: false,
      setSidebarOpen: (val) => set({ isSidebarOpen: val }),

      // ── Language ─────────────────────────────────────────────────────
      selectedLanguage: DEFAULT_LANGUAGE,
      setLanguage: (lang) => set({ selectedLanguage: lang }),

      // ── Text Size ────────────────────────────────────────────────────
      textSize: 'medium',
      setTextSize: (size) => set({ textSize: size }),

      // ── Sessions ─────────────────────────────────────────────────────
      sessions: [],
      activeSession: null,

      startSession: async (category) => {
        const { authToken, selectedLanguage } = get();
        const sessionId = Date.now().toString();
        const newSession: Session = {
          id: sessionId,
          categoryId: category.id,
          categoryLabel: category.label,
          messages: [],
          startedAt: new Date(),
        };

        set((s) => ({
          activeSession: newSession,
          sessions: [newSession, ...s.sessions],
        }));

        try {
          const response = await fetch(`${API_BASE_URL}/api/sessions`, {
            method: 'POST',
            headers: authHeaders(authToken),
            body: JSON.stringify({
              title: category.label,
              category: category.id,
              // BUG-F017 partial fix: send real selected language
              language_code: selectedLanguage.code,
            }),
          });
          if (response.ok) {
            const data = await response.json();
            set((s) => {
              const backendSession = { ...newSession, id: data.id };
              return {
                activeSession: backendSession,
                sessions: s.sessions.map((sess) =>
                  sess.id === newSession.id ? backendSession : sess
                ),
              };
            });
          } else {
            console.warn('startSession: backend returned', response.status);
          }
        } catch (err) {
          console.warn('startSession: offline mode, using local id:', err);
        }
      },

      loadSession: async (sessionId) => {
        try {
          const { authToken } = get();
          const response = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}`, {
            headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
          });
          if (response.ok) {
            const data = await response.json();
            const mappedMessages: Message[] = data.messages.map((m: any) => ({
              id: m.id.toString(),
              role: m.role,
              text: m.text_content,
              englishTranslation: m.english_translation,
              audioUri: m.audio_url ? `${API_BASE_URL}${m.audio_url}` : undefined,
              isVoice: m.input_type === 'voice',
              timestamp: new Date(m.created_at),
            }));

            const loaded: Session = {
              id: data.id,
              // BUG-F020 FIX: Use robust category mapping instead of regex stripping
              categoryId: categoryIdFromLabel(data.category),
              categoryLabel: data.category,
              messages: mappedMessages,
              startedAt: new Date(data.created_at),
            };
            set({ activeSession: loaded });
          }
        } catch (err) {
          console.warn('loadSession: failed:', err);
        }
      },

      sendMessageToBackend: async (text, isVoice = false) => {
        const { activeSession, authToken } = get();
        if (!activeSession) return;

        const userMsg: Message = {
          id: Date.now().toString(),
          role: 'user',
          text: text.trim(),
          isVoice,
          timestamp: new Date(),
        };

        set((s) => {
          if (!s.activeSession) return s;
          const updated = { ...s.activeSession, messages: [...s.activeSession.messages, userMsg] };
          return {
            activeSession: updated,
            sessions: s.sessions.map((sess) => sess.id === updated.id ? updated : sess),
          };
        });

        set({ isProcessing: true });

        try {
          const response = await fetch(
            `${API_BASE_URL}/api/sessions/${activeSession.id}/messages`,
            {
              method: 'POST',
              headers: authHeaders(authToken),
              body: JSON.stringify({ text_content: text.trim(), input_type: 'text' }),
            }
          );

          if (response.ok) {
            const data = await response.json();
            const realUserMsg: Message = {
              id: data.user_message.id.toString(),
              role: 'user',
              text: data.user_message.text_content,
              englishTranslation: data.user_message.english_translation,
              isVoice: data.user_message.input_type === 'voice',
              timestamp: new Date(data.user_message.created_at),
            };
            const aiMsg: Message = {
              id: data.assistant_message.id.toString(),
              role: 'assistant',
              text: data.assistant_message.text_content,
              englishTranslation: data.assistant_message.english_translation,
              audioUri: data.assistant_message.audio_url ? `${API_BASE_URL}${data.assistant_message.audio_url}` : undefined,
              timestamp: new Date(data.assistant_message.created_at),
            };
            set((s) => {
              if (!s.activeSession) return s;
              const filtered = s.activeSession.messages.filter((m) => m.id !== userMsg.id);
              const updated = { ...s.activeSession, messages: [...filtered, realUserMsg, aiMsg] };
              return {
                activeSession: updated,
                sessions: s.sessions.map((sess) => sess.id === updated.id ? updated : sess),
              };
            });
          } else {
            throw new Error(`Backend error: ${response.status}`);
          }
        } catch (err) {
          console.warn('sendMessageToBackend: using offline mock.', err);
          // BUG-F034 FIX: removed early set({ isProcessing: false }) here;
          // finally always runs, so it handles the cleanup once.
          setTimeout(() => {
            const aiMsg: Message = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              text: `[Offline Mode] I couldn't reach the server. Please check your connection and try again.`,
              timestamp: new Date(),
            };
            set((s) => {
              if (!s.activeSession) return s;
              const updated = { ...s.activeSession, messages: [...s.activeSession.messages, aiMsg] };
              return {
                activeSession: updated,
                sessions: s.sessions.map((sess) => sess.id === updated.id ? updated : sess),
              };
            });
          }, 500);
        } finally {
          set({ isProcessing: false });
        }
      },

      // ── BUG-F007 FIX: Real voice recording upload ─────────────────────
      sendVoiceRecording: async (audioUri: string) => {
        const { activeSession, authToken } = get();
        if (!activeSession) return;

        // Add a user voice message placeholder immediately
        const userMsg: Message = {
          id: Date.now().toString(),
          role: 'user',
          text: '🎤 Voice message',
          isVoice: true,
          timestamp: new Date(),
        };
        set((s) => {
          if (!s.activeSession) return s;
          const updated = { ...s.activeSession, messages: [...s.activeSession.messages, userMsg] };
          return {
            activeSession: updated,
            sessions: s.sessions.map((sess) => sess.id === updated.id ? updated : sess),
          };
        });

        set({ isProcessing: true });

        try {
          // React Native FormData: pass { uri, type, name } object — works on both platforms
          const formData = new FormData();
          formData.append('audio_file', {
            uri: audioUri,
            type: 'audio/wav',
            name: 'voice_recording.wav',
          } as any);

          const headers: Record<string, string> = {};
          if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
          // Do NOT set Content-Type — fetch sets it automatically for FormData (with boundary)

          const response = await fetch(
            `${API_BASE_URL}/api/sessions/${activeSession.id}/messages/voice`,
            { method: 'POST', headers, body: formData }
          );

          if (response.ok) {
            const data = await response.json();
            const realUserMsg: Message = {
              id: data.user_message.id.toString(),
              role: 'user',
              text: data.user_message.text_content,
              englishTranslation: data.user_message.english_translation,
              isVoice: data.user_message.input_type === 'voice',
              timestamp: new Date(data.user_message.created_at),
            };
            const aiMsg: Message = {
              id: data.assistant_message.id.toString(),
              role: 'assistant',
              text: data.assistant_message.text_content,
              englishTranslation: data.assistant_message.english_translation,
              audioUri: data.assistant_message.audio_url ? `${API_BASE_URL}${data.assistant_message.audio_url}` : undefined,
              timestamp: new Date(data.assistant_message.created_at),
            };
            set((s) => {
              if (!s.activeSession) return s;
              const filtered = s.activeSession.messages.filter((m) => m.id !== userMsg.id);
              const updated = { ...s.activeSession, messages: [...filtered, realUserMsg, aiMsg] };
              return {
                activeSession: updated,
                sessions: s.sessions.map((sess) => sess.id === updated.id ? updated : sess),
              };
            });
          } else {
            throw new Error(`Voice endpoint error: ${response.status}`);
          }
        } catch (err) {
          console.warn('sendVoiceRecording: failed:', err);
          const aiMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            text: `[Offline Mode] Couldn't process your voice message. Please type your question instead.`,
            timestamp: new Date(),
          };
          set((s) => {
            if (!s.activeSession) return s;
            const updated = { ...s.activeSession, messages: [...s.activeSession.messages, aiMsg] };
            return {
              activeSession: updated,
              sessions: s.sessions.map((sess) => sess.id === updated.id ? updated : sess),
            };
          });
        } finally {
          set({ isProcessing: false });
        }
      },

      generateComplaint: async () => {
        const { activeSession, authToken } = get();
        if (!activeSession) return null;

        try {
          const headers: Record<string, string> = {};
          if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

          const response = await fetch(`${API_BASE_URL}/api/sessions/${activeSession.id}/complaint`, {
            method: 'POST',
            headers,
          });
          if (response.ok) {
            const data = await response.json();
            await get().loadSession(activeSession.id);
            return `${API_BASE_URL}${data.pdf_path}`;
          }
        } catch (err) {
          console.warn('generateComplaint: failed:', err);
        }
        return null;
      },

      documents: [],

      uploadDocument: async (uri, filename, type) => {
        const { activeSession, authToken } = get();
        const sessionId = activeSession ? activeSession.id : 'general_session';

        const newDoc: UploadedDoc = {
          id: Date.now().toString(),
          name: filename,
          type,
          emoji: '📄',
          date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
          status: 'pending',
        };

        set((s) => ({ documents: [newDoc, ...s.documents] }));

        try {
          // BUG-F011 FIX: Use React Native FormData object format { uri, type, name }
          // instead of fetch(uri).blob() which fails on Android native file:// URIs
          const formData = new FormData();
          formData.append('file', { uri, type: type || 'application/octet-stream', name: filename } as any);

          const uploadHeaders: Record<string, string> = {};
          if (authToken) uploadHeaders['Authorization'] = `Bearer ${authToken}`;

          const apiResponse = await fetch(`${API_BASE_URL}/api/sessions/${sessionId}/documents`, {
            method: 'POST',
            headers: uploadHeaders,
            body: formData,
          });

          if (apiResponse.ok) {
            const docData = await apiResponse.json();
            set((s) => ({
              documents: s.documents.map((d) =>
                d.id === newDoc.id
                  ? { ...d, status: 'pending', fileUrl: docData.file_path ? `${API_BASE_URL}${docData.file_path}` : undefined }
                  : d
              ),
            }));
            if (activeSession) await get().loadSession(activeSession.id);
          } else {
            const err = await apiResponse.text();
            throw new Error(`Upload failed: ${err}`);
          }
        } catch (err) {
          console.warn('uploadDocument: upload failed:', err);
          // BUG-F022 FIX: Mark as 'failed' instead of misleading 'analysed'
          set((s) => ({
            documents: s.documents.map((d) =>
              d.id === newDoc.id ? { ...d, status: 'failed' } : d
            ),
          }));
        }
      },

      clearActiveSession: () => set({ activeSession: null }),

      // ── Mic ──────────────────────────────────────────────────────────
      isListening: false,
      setListening: (val) => set({ isListening: val }),

      // ── Processing ───────────────────────────────────────────────────
      isProcessing: false,
      setProcessing: (val) => set({ isProcessing: val }),

      // ── Auth ─────────────────────────────────────────────────────────
      authToken: null,
      refreshToken: null,
      userName: null,
      userPhone: null,
      profileImage: null,
      isAnonymousGuest: false,
      hasCompletedOnboarding: false,
      guestQueriesRemaining: 3,

      checkAuthStatus: async () => {
        try {
          const token       = await webSecureStore.getItemAsync('auth_token');
          const rToken      = await webSecureStore.getItemAsync('refresh_token');
          const onboarding  = await webSecureStore.getItemAsync('has_completed_onboarding');
          const name        = await webSecureStore.getItemAsync('user_name');
          const phone       = await webSecureStore.getItemAsync('user_phone');
          const profileImg  = await webSecureStore.getItemAsync('profile_image');
          const isGuest     = await webSecureStore.getItemAsync('is_anonymous_guest');
          set({
            authToken: token,
            refreshToken: rToken,
            hasCompletedOnboarding: onboarding === 'true',
            userName: name,
            userPhone: phone,
            profileImage: profileImg,
            isAnonymousGuest: isGuest === 'true',
          });
        } catch (e) {
          console.warn('checkAuthStatus: failed to read from SecureStore:', e);
        }
      },

      // ── BUG-F003 FIX: New requestOtp action ──────────────────────────
      requestOtp: async (phone: string) => {
        const response = await fetch(`${API_BASE_URL}/api/auth/request-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail ?? 'Failed to send OTP. Please try again.');
        }
        const data = await response.json();
        // In dev mode the backend returns an otp_hint — log it for convenience
        if (data.otp_hint) console.log(`[DEV] OTP for ${phone}: ${data.otp_hint}`);
      },

      // ── BUG-F004/F005 FIX: login now calls real verify-otp endpoint ──
      login: async (phone: string, otp: string) => {
        const response = await fetch(`${API_BASE_URL}/api/auth/verify-otp`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone, otp }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail ?? 'Invalid OTP. Please try again.');
        }
        const data = await response.json();
        // data: { access_token, refresh_token, token_type, user: { id, phone, name, ... } }

        await webSecureStore.setItemAsync('auth_token', data.access_token);
        await webSecureStore.setItemAsync('refresh_token', data.refresh_token ?? '');
        await webSecureStore.setItemAsync('has_completed_onboarding', 'true');
        await webSecureStore.setItemAsync('user_name', data.user?.name ?? '');
        await webSecureStore.setItemAsync('user_phone', data.user?.phone ?? phone);

        set({
          authToken: data.access_token,
          refreshToken: data.refresh_token ?? null,
          userName: data.user?.name ?? null,
          userPhone: data.user?.phone ?? phone,
          profileImage: null,
          isAnonymousGuest: false,
          hasCompletedOnboarding: true,
          guestQueriesRemaining: 3,
        });
      },

      // ── Guest upgrade: call /api/auth/guest/upgrade with optional session migration ──
      upgradeGuestAccount: async (phone: string, otp: string, migrateHistory: boolean) => {
        const { authToken } = get();
        const response = await fetch(`${API_BASE_URL}/api/auth/guest/upgrade`, {
          method: 'POST',
          headers: authHeaders(authToken),
          body: JSON.stringify({ phone, otp, migrate_history: migrateHistory }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail ?? 'Upgrade failed. Please try again.');
        }
        const data = await response.json();

        await webSecureStore.setItemAsync('auth_token', data.access_token);
        await webSecureStore.setItemAsync('refresh_token', data.refresh_token ?? '');
        await webSecureStore.setItemAsync('has_completed_onboarding', 'true');
        await webSecureStore.setItemAsync('user_name', data.user?.name ?? '');
        await webSecureStore.setItemAsync('user_phone', data.user?.phone ?? phone);
        await webSecureStore.setItemAsync('is_anonymous_guest', 'false');

        set({
          authToken: data.access_token,
          refreshToken: data.refresh_token ?? null,
          userName: data.user?.name ?? null,
          userPhone: data.user?.phone ?? phone,
          profileImage: null,
          isAnonymousGuest: false,
          hasCompletedOnboarding: true,
          guestQueriesRemaining: 3,
          // Clear local sessions — they will be reloaded from backend (now owned by real user)
          sessions: [],
          activeSession: null,
        });
      },

      // ── Google Login (simulated) ──────────────────────────────────────
      loginWithGoogle: async (email: string, name: string, profileImage: string) => {
        // In production: exchange Google ID token with backend /api/auth/google.
        // For hackathon: store locally with a mock token so the app works end-to-end.
        const mockToken = `google_${Date.now()}`;
        await webSecureStore.setItemAsync('auth_token', mockToken);
        await webSecureStore.setItemAsync('refresh_token', mockToken + '_refresh');
        await webSecureStore.setItemAsync('has_completed_onboarding', 'true');
        await webSecureStore.setItemAsync('user_name', name);
        await webSecureStore.setItemAsync('user_phone', '');
        await webSecureStore.setItemAsync('profile_image', profileImage);
        await webSecureStore.setItemAsync('is_anonymous_guest', 'false');
        set({
          authToken: mockToken,
          refreshToken: mockToken + '_refresh',
          userName: name,
          userPhone: null,
          profileImage,
          isAnonymousGuest: false,
          hasCompletedOnboarding: true,
          guestQueriesRemaining: 3,
        });
      },

      logout: async () => {
        const { authToken, refreshToken } = get();
        if (authToken && refreshToken) {
          fetch(`${API_BASE_URL}/api/auth/logout`, {
            method: 'POST',
            headers: authHeaders(authToken),
            body: JSON.stringify({ refresh_token: refreshToken }),
          }).catch(() => {});
        }
        try {
          await webSecureStore.deleteItemAsync('auth_token');
          await webSecureStore.deleteItemAsync('refresh_token');
          await webSecureStore.deleteItemAsync('user_name');
          await webSecureStore.deleteItemAsync('user_phone');
          await webSecureStore.deleteItemAsync('profile_image');
          await webSecureStore.deleteItemAsync('is_anonymous_guest');
        } catch {}
        set({
          authToken: null,
          refreshToken: null,
          userName: null,
          userPhone: null,
          profileImage: null,
          isAnonymousGuest: false,
          guestQueriesRemaining: 3,
          sessions: [],
          documents: [],
          activeSession: null,
        });
      },

      enableGuest: async () => {
        try {
          const response = await fetch(`${API_BASE_URL}/api/auth/guest`, { method: 'POST' });
          if (response.ok) {
            const data = await response.json();
            await webSecureStore.setItemAsync('auth_token', data.access_token);
            await webSecureStore.setItemAsync('refresh_token', data.refresh_token ?? '');
            await webSecureStore.setItemAsync('has_completed_onboarding', 'true');
            await webSecureStore.setItemAsync('is_anonymous_guest', 'true');
            set({
              authToken: data.access_token,
              refreshToken: data.refresh_token ?? null,
              userName: 'Guest Citizen',
              userPhone: null,
              profileImage: null,
              isAnonymousGuest: true,
              hasCompletedOnboarding: true,
              guestQueriesRemaining: 3,
            });
            return;
          }
        } catch {
          // Network unreachable — fall through to offline guest mode
        }
        await webSecureStore.setItemAsync('has_completed_onboarding', 'true').catch(() => {});
        await webSecureStore.setItemAsync('is_anonymous_guest', 'true').catch(() => {});
        set({
          authToken: null,
          refreshToken: null,
          userName: 'Guest Citizen',
          userPhone: null,
          profileImage: null,
          isAnonymousGuest: true,
          hasCompletedOnboarding: true,
          guestQueriesRemaining: 3,
        });
      },

      decrementQueries: async () => {
        const current = get().guestQueriesRemaining;
        const next = Math.max(0, current - 1);
        set({ guestQueriesRemaining: next });
        if (next === 0) {
          // Show login prompt overlay after last query
          setTimeout(() => set({ activeOverlay: 'login_prompt' }), 800);
        }
      },

      // ── Overlays ─────────────────────────────────────────────────────
      activeOverlay: null,
      setOverlay: (overlay) => set({ activeOverlay: overlay }),
    }),
    {
      // ── BUG-F009 FIX: Persist only small user preferences ────────────
      // Sessions & documents are intentionally excluded — they should be
      // fetched from the backend on app start, not stored locally.
      name: 'neethimitra-preferences',
      storage: createJSONStorage(() => secureStoreAdapter),
      partialize: (state) => ({
        isDarkMode: state.isDarkMode,
        selectedLanguage: state.selectedLanguage,
        textSize: state.textSize,
        // Note: auth tokens are stored in SecureStore directly; not in Zustand persist
      }),
    }
  )
);
