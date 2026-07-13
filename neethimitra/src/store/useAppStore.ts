import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { Platform } from 'react-native';
import { LANGUAGES, Language, DEFAULT_LANGUAGE } from '@constants/languages';
import * as SecureStore from 'expo-secure-store';

import { apiClient, API_BASE_URL, registerAuthHandlers } from '@utils/apiClient';

// Helper to prevent Log Injection (CWE-117): Sanitize variable values printed in logs
function safeLogVal(val: unknown): string {
  const str = JSON.stringify(val) ?? '';
  return str.replace(/[\r\n\t]/g, ' ').slice(0, 200);
}

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
  // Explicit backend-key → frontend-id mappings
  const backendToFrontend: Record<string, string> = {
    cybercrime: 'cyber',
    womensdv: 'family',
    womendv: 'family',
    consumer: 'general',
    labor: 'general',
    senior: 'general',
    complaint: 'general',
    police: 'police',
    health: 'health',
    land: 'land',
    rti: 'rti',
  };
  if (backendToFrontend[lower]) return backendToFrontend[lower];
  const match = CATEGORIES.find((c) => {
    const cLower = c.id.toLowerCase();
    const labelLower = c.label.toLowerCase().replace(/[^a-z]/g, '');
    return lower.startsWith(cLower) || lower === labelLower;
  });
  return match?.id ?? 'general';
}

// Maps frontend category IDs → backend category keys
export const FRONTEND_TO_BACKEND_CATEGORY: Record<string, string> = {
  land:    'land',
  police:  'police',
  cyber:   'cybercrime',
  health:  'health',
  family:  'women_dv',
  rti:     'rti',
  general: 'consumer',
};

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
  title: string;           // auto-generated from first message, or default category name
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
  sessionId?: string;
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
  fetchSessions: () => Promise<void>;
  sendMessageToBackend: (text: string, isVoice?: boolean) => Promise<void>;
  sendVoiceRecording: (audioUri: string) => Promise<void>;  // BUG-F007 support
  clearActiveSession: () => void;
  loadSession: (sessionId: string) => Promise<void>;
  deleteSession: (sessionId: string) => Promise<void>;
  updateSessionCategory: (sessionId: string, categoryId: string) => Promise<void>;
  generateMessageAudio: (messageId: string) => Promise<string | undefined>;

  // PDF Generation
  generateComplaint: () => Promise<string | null>;

  // Documents
  documents: UploadedDoc[];
  uploadDocument: (uri: string, filename: string, type: string) => Promise<void>;
  fetchUserDocuments: () => Promise<void>;

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
  userEmail: string | null;        // email from backend
  profileImage: string | null;     // Google profile photo URL
  isAnonymousGuest: boolean;       // true when no real login happened
  hasCompletedOnboarding: boolean;
  guestQueriesRemaining: number;

  checkAuthStatus: () => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  upgradeGuestAccount: (email: string, name: string, password: string, migrateHistory: boolean) => Promise<void>;
  loginWithGoogle: (idToken: string, preferredLanguage?: string) => Promise<void>;
  logout: () => Promise<void>;
  enableGuest: () => Promise<void>;
  decrementQueries: () => Promise<void>;

  // Overlays
  activeOverlay: 'recording' | 'language' | 'upload' | 'success' | 'error' | 'confirm' | 'login_prompt' | 'confirm_logout' | null;
  setOverlay: (overlay: 'recording' | 'language' | 'upload' | 'success' | 'error' | 'confirm' | 'login_prompt' | 'confirm_logout' | null) => void;
}

// ─── Helper: build auth headers ──────────────────────────────────────────
function authHeaders(token: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h['Authorization'] = `Bearer ${token}`;
  return h;
}

function uploadMimeType(filename: string, providedType?: string): string {
  const type = providedType?.toLowerCase();
  if (type === 'application/pdf' || type === 'image/png' || type === 'image/jpeg' || type === 'image/jpg') {
    return type === 'image/jpg' ? 'image/jpeg' : type;
  }
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'png') return 'image/png';
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  return providedType || 'application/octet-stream';
}

function authRequiredMessage(isGuest: boolean): string {
  return isGuest
    ? 'Guest query limit reached. Please sign in to continue.'
    : 'Your session has expired. Please sign in again to continue.';
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
          title: category.label,   // default; overwritten after first message
          messages: [],
          startedAt: new Date(),
        };

        set((s) => ({
          activeSession: newSession,
          sessions: [newSession, ...s.sessions],
        }));

        try {
          const response = await apiClient('/api/sessions', {
            method: 'POST',
            headers: authHeaders(authToken),
            body: JSON.stringify({
              title: category.label,
              // Send backend key, not frontend ID
              category: FRONTEND_TO_BACKEND_CATEGORY[category.id] ?? category.id,
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
            console.warn('startSession: backend returned', safeLogVal(response.status));
          }
        } catch (err) {
          console.warn('startSession: offline mode, using local id:', safeLogVal(err));
        }
      },

      // ── Fetch all sessions from backend and sync to store ──────────────
      fetchSessions: async () => {
        const { authToken } = get();
        // Only fetch if we have a real (non-guest) token
        if (!authToken) return;
        get().fetchUserDocuments().catch(() => {});
        try {
          const response = await apiClient('/api/sessions', {
            headers: authHeaders(authToken),
          });
          if (response.ok) {
            const data: any[] = await response.json();
            const mapped: Session[] = data.map((s) => ({
              id: s.id,
              categoryId: categoryIdFromLabel(s.category),
              categoryLabel: s.category,
              title: s.title || s.category,   // backend title (auto-generated from first msg)
              // Sessions list endpoint may not include full messages; keep existing messages if already loaded
              messages: s.messages
                ? s.messages.map((m: any) => ({
                    id: m.id.toString(),
                    role: m.role,
                    text: m.text_content,
                    englishTranslation: m.english_translation,
                    audioUri: m.audio_url ? `${API_BASE_URL}${m.audio_url}` : undefined,
                    isVoice: m.input_type === 'voice',
                    timestamp: new Date(m.created_at),
                  }))
                : [],
              startedAt: new Date(s.created_at),
            }));
            set((prev) => {
              // Merge: keep any local sessions not yet synced, prefer backend order
              const backendIds = new Set(mapped.map((s) => s.id));
              const localOnly = prev.sessions.filter((s) => !backendIds.has(s.id));
              return { sessions: [...localOnly, ...mapped] };
            });
          }
        } catch (err) {
          console.warn('fetchSessions: failed (offline?):', safeLogVal(err));
        }
      },

      loadSession: async (sessionId) => {
        try {
          const { authToken } = get();
          const response = await apiClient(`/api/sessions/${sessionId}`, {
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
              title: data.title || data.category,
              messages: mappedMessages,
              startedAt: new Date(data.created_at),
            };
            set({ activeSession: loaded });
          }
        } catch (err) {
          console.warn('loadSession: failed:', safeLogVal(err));
        }
      },

      deleteSession: async (sessionId) => {
        const { authToken } = get();
        // Optimistically remove session from local state for snappy UI
        set((s) => {
          const updatedSessions = s.sessions.filter((sess) => sess.id !== sessionId);
          const nextActive = s.activeSession?.id === sessionId ? null : s.activeSession;
          return {
            sessions: updatedSessions,
            activeSession: nextActive,
          };
        });
        if (!authToken) return;
        try {
          await apiClient(`/api/sessions/${sessionId}`, {
            method: 'DELETE',
            headers: authHeaders(authToken),
          });
        } catch (err) {
          console.warn('deleteSession: backend request failed:', safeLogVal(err));
        }
      },

      updateSessionCategory: async (sessionId, categoryId) => {
        const { authToken } = get();
        const backendCategory = FRONTEND_TO_BACKEND_CATEGORY[categoryId] ?? categoryId;
        // Optimistic UI update
        set((s) => {
          const cat = CATEGORIES.find((c) => c.id === categoryId);
          const label = cat?.label ?? categoryId;
          const updateSess = (sess: Session) =>
            sess.id === sessionId ? { ...sess, categoryId, categoryLabel: label } : sess;
          return {
            sessions: s.sessions.map(updateSess),
            activeSession: s.activeSession?.id === sessionId
              ? updateSess(s.activeSession)
              : s.activeSession,
          };
        });
        if (!authToken) return;
        try {
          await apiClient(`/api/sessions/${sessionId}/category`, {
            method: 'PATCH',
            headers: authHeaders(authToken),
            body: JSON.stringify({ category: backendCategory }),
          });
        } catch (err) {
          console.warn('updateSessionCategory: failed:', safeLogVal(err));
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
          const response = await apiClient(
            `/api/sessions/${activeSession.id}/messages`,
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
              // Sync auto-detected category from backend response
              const detectedBackendCategory = data.assistant_message.category as string | undefined;
              const newCategoryId = detectedBackendCategory
                ? categoryIdFromLabel(detectedBackendCategory)
                : s.activeSession.categoryId;
              const newCategoryLabel = detectedBackendCategory
                ? (CATEGORIES.find((c) => c.id === newCategoryId)?.label ?? s.activeSession.categoryLabel)
                : s.activeSession.categoryLabel;
              const updated = {
                ...s.activeSession,
                messages: [...filtered, realUserMsg, aiMsg],
                categoryId: newCategoryId,
                categoryLabel: newCategoryLabel,
              };
              return {
                activeSession: updated,
                sessions: s.sessions.map((sess) => sess.id === updated.id ? updated : sess),
              };
            });
            // Refresh session list silently so the sidebar shows updated title
            // (backend auto-generates title from first message)
            get().fetchSessions().catch(() => {});
          } else if (response.status === 401 || response.status === 403) {
            const isGuest = get().isAnonymousGuest;
            set({
              activeOverlay: 'login_prompt',
              guestQueriesRemaining: isGuest ? 0 : get().guestQueriesRemaining,
            });
            const aiMsg: Message = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              text: authRequiredMessage(isGuest),
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
          } else {
            throw new Error(`Backend error: ${response.status}`);
          }
        } catch (err) {
          // Surface the real error to the user — do NOT hide it behind an offline mock.
          // The backend returned a real HTTP error (502/500/401) and we need to show it.
          console.error('sendMessageToBackend: request failed:', safeLogVal(err));
          const errMsg = err instanceof Error ? err.message : String(err);
          const aiMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            text: `⚠️ Server error: ${errMsg}. Please try again in a moment.`,
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
          if (Platform.OS === 'web') {
            const audioBlob = await fetch(audioUri).then((res) => res.blob());
            formData.append('audio_file', audioBlob, 'voice_recording.webm');
          } else {
            formData.append('audio_file', {
              uri: audioUri,
              type: 'audio/wav',
              name: 'voice_recording.wav',
            } as any);
          }

          const headers: Record<string, string> = {};
          if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
          // Do NOT set Content-Type — fetch sets it automatically for FormData (with boundary)

          const response = await apiClient(
            `/api/sessions/${activeSession.id}/messages/voice`,
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
          } else if (response.status === 401 || response.status === 403) {
            const isGuest = get().isAnonymousGuest;
            set({
              activeOverlay: 'login_prompt',
              guestQueriesRemaining: isGuest ? 0 : get().guestQueriesRemaining,
            });
            const aiMsg: Message = {
              id: (Date.now() + 1).toString(),
              role: 'assistant',
              text: authRequiredMessage(isGuest),
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
          } else {
            throw new Error(`Voice endpoint error: ${response.status}`);
          }
        } catch (err) {
          // Surface the real voice error — do NOT hide it behind an offline mock.
          console.error('sendVoiceRecording: request failed:', safeLogVal(err));
          const errMsg = err instanceof Error ? err.message : String(err);
          const aiMsg: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            text: `⚠️ Voice processing failed: ${errMsg}. Please try again or type your question instead.`,
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

          const response = await apiClient(`/api/sessions/${activeSession.id}/complaint`, {
            method: 'POST',
            headers,
          });
          if (response.ok) {
            const data = await response.json();
            await get().loadSession(activeSession.id);
            return `${API_BASE_URL}${data.pdf_path}`;
          }
        } catch (err) {
          console.warn('generateComplaint: failed:', safeLogVal(err));
        }
        return null;
      },

      generateMessageAudio: async (messageId) => {
        const { activeSession, authToken } = get();
        if (!activeSession) return undefined;

        try {
          const headers: Record<string, string> = {
            'Content-Type': 'application/json',
          };
          if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

          const response = await apiClient(`/api/sessions/${activeSession.id}/messages/${messageId}/speak`, {
            method: 'POST',
            headers,
          });

          if (response.ok) {
            const data = await response.json();
            const fullAudioUrl = data.audio_url ? `${API_BASE_URL}${data.audio_url}` : undefined;

            if (fullAudioUrl) {
              set((s) => {
                if (!s.activeSession) return s;
                
                // Update activeSession messages list
                const updatedMessages = s.activeSession.messages.map((m) =>
                  m.id === messageId ? { ...m, audioUri: fullAudioUrl } : m
                );
                const updatedActive = { ...s.activeSession, messages: updatedMessages };

                // Update global sessions list
                const updatedSessions = s.sessions.map((sess) =>
                  sess.id === updatedActive.id ? updatedActive : sess
                );

                return {
                  activeSession: updatedActive,
                  sessions: updatedSessions,
                };
              });
            }

            return fullAudioUrl;
          }
        } catch (err) {
          console.warn('generateMessageAudio: failed:', safeLogVal(err));
        }
        return undefined;
      },

      documents: [],

      uploadDocument: async (uri, filename, type) => {
        const { activeSession, authToken } = get();
        let sessionId = activeSession ? activeSession.id : null;
        
        // ── Inferred category detection from filename keywords ──
        const fnLower = filename.toLowerCase();
        let targetCategory = CATEGORIES.find(c => c.id === 'general')!;
        if (fnLower.includes('fir') || fnLower.includes('complaint') || fnLower.includes('police') || fnLower.includes('arrest')) {
          targetCategory = CATEGORIES.find(c => c.id === 'police') || targetCategory;
        } else if (fnLower.includes('medical') || fnLower.includes('bill') || fnLower.includes('hospital') || fnLower.includes('health') || fnLower.includes('doctor') || fnLower.includes('prescription')) {
          targetCategory = CATEGORIES.find(c => c.id === 'health') || targetCategory;
        } else if (fnLower.includes('rti') || fnLower.includes('info') || fnLower.includes('reply') || fnLower.includes('government') || fnLower.includes('govt')) {
          targetCategory = CATEGORIES.find(c => c.id === 'rti') || targetCategory;
        } else if (fnLower.includes('land') || fnLower.includes('property') || fnLower.includes('patta') || fnLower.includes('chitta') || fnLower.includes('deed') || fnLower.includes('registration') || fnLower.includes('adangal')) {
          targetCategory = CATEGORIES.find(c => c.id === 'land') || targetCategory;
        }

        if (!sessionId) {
          try {
            await get().startSession(targetCategory);
            const newActive = get().activeSession;
            sessionId = newActive ? newActive.id : 'general_session';
          } catch (err) {
            console.error('uploadDocument: failed to auto-start session:', safeLogVal(err));
            set({ activeOverlay: 'error' });
            return;
          }
        }
        const mimeType = uploadMimeType(filename, type);

        const newDoc: UploadedDoc = {
          id: Date.now().toString(),
          name: filename,
          type: mimeType,
          emoji: '📄',
          date: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
          status: 'pending',
          sessionId,
        };

        set((s) => ({ documents: [newDoc, ...s.documents] }));

        try {
          const formData = new FormData();
          formData.append('file', { uri, type: mimeType, name: filename } as any);

          const uploadHeaders: Record<string, string> = {};
          if (authToken) uploadHeaders['Authorization'] = `Bearer ${authToken}`;

          const apiResponse = await apiClient(`/api/sessions/${sessionId}/documents`, {
            method: 'POST',
            headers: uploadHeaders,
            body: formData,
          });

          if (apiResponse.ok) {
            const docData = await apiResponse.json();
            set((s) => ({
              documents: s.documents.map((d) =>
                d.id === newDoc.id
                  ? { 
                      ...d, 
                      status: 'pending', 
                      fileUrl: docData.file_path ? `${API_BASE_URL}${docData.file_path}` : undefined,
                      sessionId: docData.session_id,
                    }
                  : d
              ),
            }));
            const activeId = get().activeSession?.id;
            if (activeId) await get().loadSession(activeId);
            // Silently fetch user documents to synchronize signed URLs
            get().fetchUserDocuments().catch(() => {});
          } else {
            const err = await apiResponse.text();
            throw new Error(`Upload failed: ${err}`);
          }
        } catch (err) {
          console.warn('uploadDocument: upload failed:', safeLogVal(err));
          set((s) => ({
            documents: s.documents.map((d) =>
              d.id === newDoc.id ? { ...d, status: 'failed' } : d
            ),
            activeOverlay: 'error',
          }));
        }
      },


      fetchUserDocuments: async () => {
        try {
          const { authToken } = get();
          const headers: Record<string, string> = {};
          if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

          const response = await apiClient('/api/sessions/user/all-docs', {
            headers,
          });

          if (response.ok) {
            const data = await response.json();
            const mapped: UploadedDoc[] = data.map((d: any) => ({
              id: d.id.toString(),
              name: d.filename,
              type: d.mime_type || 'Document',
              emoji: '📄',
              date: new Date(d.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }),
              status: d.analysis_status === 'completed' ? 'analysed' : (d.analysis_status === 'failed' ? 'failed' : 'pending'),
              fileUrl: d.file_path ? `${API_BASE_URL}${d.file_path}` : undefined,
              sessionId: d.session_id,
            }));
            set({ documents: mapped });
          }
        } catch (err) {
          console.warn('fetchUserDocuments: failed:', safeLogVal(err));
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
      userEmail: null,
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
          const email       = await webSecureStore.getItemAsync('user_email');
          const profileImg  = await webSecureStore.getItemAsync('profile_image');
          const isGuest     = await webSecureStore.getItemAsync('is_anonymous_guest');
          set({
            authToken: token,
            refreshToken: rToken,
            hasCompletedOnboarding: onboarding === 'true',
            userName: name,
            userPhone: phone,
            userEmail: email,
            profileImage: profileImg,
            isAnonymousGuest: isGuest === 'true',
          });
          // Sync sessions from backend if authenticated
          if (token && isGuest !== 'true') {
            get().fetchSessions().catch(() => {});
          }
        } catch (e) {
          console.warn('checkAuthStatus: failed to read from SecureStore:', safeLogVal(e));
        }
      },

      register: async (name, email, password) => {
        const response = await apiClient('/api/auth/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name,
            email,
            password,
            preferred_language: get().selectedLanguage.code,
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail ?? 'Registration failed. Please try again.');
        }
        const data = await response.json();
        await webSecureStore.setItemAsync('auth_token', data.access_token);
        await webSecureStore.setItemAsync('refresh_token', data.refresh_token ?? '');
        await webSecureStore.setItemAsync('has_completed_onboarding', 'true');
        await webSecureStore.setItemAsync('user_name', data.user?.name ?? name);
        await webSecureStore.setItemAsync('user_email', data.user?.email ?? email);
        await webSecureStore.setItemAsync('user_phone', data.user?.phone ?? '');
        await webSecureStore.setItemAsync('is_anonymous_guest', 'false');
        set({
          authToken: data.access_token,
          refreshToken: data.refresh_token ?? null,
          userName: data.user?.name ?? name,
          userEmail: data.user?.email ?? email,
          userPhone: data.user?.phone ?? null,
          profileImage: null,
          isAnonymousGuest: false,
          hasCompletedOnboarding: true,
          guestQueriesRemaining: 3,
          sessions: [],
        });
        get().fetchSessions().catch(() => {});
      },

      login: async (email, password) => {
        const details: Record<string, string> = {
          username: email,
          password: password,
        };
        const formBody = Object.keys(details)
          .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(details[key]))
          .join('&');

        const response = await apiClient('/api/auth/login', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
          },
          body: formBody,
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail ?? 'Incorrect email or password.');
        }
        const data = await response.json();

        await webSecureStore.setItemAsync('auth_token', data.access_token);
        await webSecureStore.setItemAsync('refresh_token', data.refresh_token ?? '');
        await webSecureStore.setItemAsync('has_completed_onboarding', 'true');
        await webSecureStore.setItemAsync('user_name', data.user?.name ?? '');
        await webSecureStore.setItemAsync('user_email', data.user?.email ?? email);
        await webSecureStore.setItemAsync('user_phone', data.user?.phone ?? '');
        await webSecureStore.setItemAsync('is_anonymous_guest', 'false');

        set({
          authToken: data.access_token,
          refreshToken: data.refresh_token ?? null,
          userName: data.user?.name ?? null,
          userEmail: data.user?.email ?? email,
          userPhone: data.user?.phone ?? null,
          profileImage: null,
          isAnonymousGuest: false,
          hasCompletedOnboarding: true,
          guestQueriesRemaining: 3,
          sessions: [], // clear before re-fetch
        });
        get().fetchSessions().catch(() => {});
      },

      upgradeGuestAccount: async (email, name, password, migrateHistory) => {
        const { authToken } = get();
        const response = await apiClient('/api/auth/guest/upgrade', {
          method: 'POST',
          headers: authHeaders(authToken),
          body: JSON.stringify({ email, name, password, migrate_history: migrateHistory }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail ?? 'Upgrade failed. Please try again.');
        }
        const data = await response.json();

        await webSecureStore.setItemAsync('auth_token', data.access_token);
        await webSecureStore.setItemAsync('refresh_token', data.refresh_token ?? '');
        await webSecureStore.setItemAsync('has_completed_onboarding', 'true');
        await webSecureStore.setItemAsync('user_name', data.user?.name ?? name);
        await webSecureStore.setItemAsync('user_email', data.user?.email ?? email);
        await webSecureStore.setItemAsync('user_phone', data.user?.phone ?? '');
        await webSecureStore.setItemAsync('is_anonymous_guest', 'false');

        set({
          authToken: data.access_token,
          refreshToken: data.refresh_token ?? null,
          userName: data.user?.name ?? name,
          userEmail: data.user?.email ?? email,
          userPhone: data.user?.phone ?? null,
          profileImage: null,
          isAnonymousGuest: false,
          hasCompletedOnboarding: true,
          guestQueriesRemaining: 3,
          sessions: [],
          activeSession: null,
        });
        get().fetchSessions().catch(() => {});
      },

      // ── Google Login — calls real backend /api/auth/google ───────────
      loginWithGoogle: async (idToken: string, preferredLanguage?: string) => {
        const response = await apiClient('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id_token: idToken,
            preferred_language: preferredLanguage || get().selectedLanguage.code,
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error(body.detail ?? 'Google Sign-In failed.');
        }
        const data = await response.json();
        await webSecureStore.setItemAsync('auth_token', data.access_token);
        await webSecureStore.setItemAsync('refresh_token', data.refresh_token ?? '');
        await webSecureStore.setItemAsync('has_completed_onboarding', 'true');
        await webSecureStore.setItemAsync('user_name', data.user?.name ?? '');
        await webSecureStore.setItemAsync('user_email', data.user?.email ?? '');
        await webSecureStore.setItemAsync('user_phone', data.user?.phone ?? '');
        await webSecureStore.setItemAsync('profile_image', data.user?.profile_image ?? '');
        await webSecureStore.setItemAsync('is_anonymous_guest', 'false');
        set({
          authToken: data.access_token,
          refreshToken: data.refresh_token ?? null,
          userName: data.user?.name ?? null,
          userEmail: data.user?.email ?? null,
          userPhone: data.user?.phone ?? null,
          profileImage: data.user?.profile_image ?? null,
          isAnonymousGuest: false,
          hasCompletedOnboarding: true,
          guestQueriesRemaining: 3,
          sessions: [],
        });
        get().fetchSessions().catch(() => {});
      },

      logout: async () => {
        const { authToken, refreshToken } = get();
        if (authToken && refreshToken) {
          apiClient('/api/auth/logout', {
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
          await webSecureStore.deleteItemAsync('user_email');
          await webSecureStore.deleteItemAsync('profile_image');
          await webSecureStore.deleteItemAsync('is_anonymous_guest');
        } catch {}
        set({
          authToken: null,
          refreshToken: null,
          userName: null,
          userPhone: null,
          userEmail: null,
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
          const response = await apiClient('/api/auth/guest', { method: 'POST' });
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

registerAuthHandlers(
  (accessToken, refreshToken) => {
    useAppStore.setState({ authToken: accessToken, refreshToken });
  },
  () => {
    useAppStore.setState({
      authToken: null,
      refreshToken: null,
      userName: null,
      userPhone: null,
      userEmail: null,
      profileImage: null,
      isAnonymousGuest: false,
      sessions: [],
      documents: [],
      activeSession: null,
    });
  }
);
