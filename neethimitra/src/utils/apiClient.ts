import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Hardcoded allowlist — only permit local dev and production backend to prevent SSRF (CWE-918)
const ALLOWED_BASES: string[] = [
  'http://127.0.0.1:8000',
  'http://10.0.2.2:8000',
  'http://localhost:8000',
  'https://neethimitra-backend.onrender.com',
  ...(process.env.EXPO_PUBLIC_API_URL ? [process.env.EXPO_PUBLIC_API_URL] : [])
];

export const API_BASE_URL: string = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'web'
  ? 'https://neethimitra-backend.onrender.com'
  : 'http://10.0.2.2:8000');

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

// Handlers to link with useAppStore state (avoids static circular imports)
let onAuthRefreshCallback: ((accessToken: string, refreshToken: string) => void) | null = null;
let onAuthClearCallback: (() => void) | null = null;

export function registerAuthHandlers(
  onRefresh: (accessToken: string, refreshToken: string) => void,
  onClear: () => void
) {
  onAuthRefreshCallback = onRefresh;
  onAuthClearCallback = onClear;
}

// Share a single refresh request across multiple concurrent 401s
let activeRefreshPromise: Promise<string | null> | null = null;

async function performSilentRefresh(): Promise<string | null> {
  try {
    const refreshToken = await webSecureStore.getItemAsync('refresh_token');
    if (!refreshToken) {
      console.warn('apiClient: No refresh token stored.');
      return null;
    }

    const refreshUrl = `${API_BASE_URL}/api/auth/refresh`;
    const response = await fetch(refreshUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (response.ok) {
      const data = await response.json();
      const newAccess = data.access_token;
      const newRefresh = data.refresh_token || refreshToken;

      // Update storage
      await webSecureStore.setItemAsync('auth_token', newAccess);
      await webSecureStore.setItemAsync('refresh_token', newRefresh);

      // Notify store if registered
      if (onAuthRefreshCallback) {
        onAuthRefreshCallback(newAccess, newRefresh);
      }
      return newAccess;
    } else {
      console.warn('apiClient: Refresh request failed with status:', response.status);
      return null;
    }
  } catch (err) {
    console.error('apiClient: Silent token refresh encountered error:', err);
    return null;
  }
}

async function handleTokenRefreshAndRetry(
  path: string,
  options?: RequestInit
): Promise<Response> {
  // If a refresh is already in flight, wait for it; otherwise start one
  if (!activeRefreshPromise) {
    activeRefreshPromise = performSilentRefresh();
  }

  const newAccessToken = await activeRefreshPromise;
  activeRefreshPromise = null; // Clear lock when finished

  if (newAccessToken) {
    // Clone headers and update the Authorization token
    const newOptions = { ...(options || {}) };
    const headers = new Headers(newOptions.headers || {});
    headers.set('Authorization', `Bearer ${newAccessToken}`);
    newOptions.headers = headers;

    const fullUrl = `${API_BASE_URL}${path}`;
    return fetch(fullUrl, newOptions);
  } else {
    // Clear credentials and force sign-out
    await webSecureStore.deleteItemAsync('auth_token');
    await webSecureStore.deleteItemAsync('refresh_token');
    await webSecureStore.deleteItemAsync('user_name');
    await webSecureStore.deleteItemAsync('user_phone');
    await webSecureStore.deleteItemAsync('user_email');
    await webSecureStore.deleteItemAsync('profile_image');
    await webSecureStore.deleteItemAsync('is_anonymous_guest');

    if (onAuthClearCallback) {
      onAuthClearCallback();
    }
    
    // Return a mock 401 response so original callers can gracefully handle auth failure
    return new Response(JSON.stringify({ detail: 'Session expired' }), {
      status: 401,
      statusText: 'Unauthorized',
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

export async function apiClient(path: string, options?: RequestInit): Promise<Response> {
  if (!path.startsWith('/api/')) {
    throw new Error('Invalid API path: ' + path);
  }
  const fullUrl = `${API_BASE_URL}${path}`;
  const isAllowed = ALLOWED_BASES.some(base => fullUrl.startsWith(base));
  if (!isAllowed) {
    throw new Error('Blocked unauthorized API URL: ' + fullUrl);
  }

  const response = await fetch(fullUrl, options);

  // Intercept 401s (excluding the refresh endpoint itself to prevent loops)
  if (response.status === 401 && path !== '/api/auth/refresh' && path !== '/api/auth/login') {
    return handleTokenRefreshAndRetry(path, options);
  }

  return response;
}
