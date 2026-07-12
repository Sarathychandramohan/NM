import { Platform } from 'react-native';

// Hardcoded allowlist — only permit local dev and production backend to prevent SSRF (CWE-918)
const ALLOWED_BASES: string[] = [
  'http://127.0.0.1:8000',
  'http://10.0.2.2:8000',
  'http://localhost:8000',
  'https://neethimitra-backend.onrender.com',
  ...(process.env.EXPO_PUBLIC_API_URL ? [process.env.EXPO_PUBLIC_API_URL] : [])
];

export const API_BASE_URL: string = process.env.EXPO_PUBLIC_API_URL || (Platform.OS === 'web'
  ? 'http://127.0.0.1:8000'
  : 'http://10.0.2.2:8000');

export function apiClient(path: string, options?: RequestInit): Promise<Response> {
  if (!path.startsWith('/api/')) {
    throw new Error('Invalid API path: ' + path);
  }
  const fullUrl = `${API_BASE_URL}${path}`;
  const isAllowed = ALLOWED_BASES.some(base => fullUrl.startsWith(base));
  if (!isAllowed) {
    throw new Error('Blocked unauthorized API URL: ' + fullUrl);
  }
  return fetch(fullUrl, options);
}
