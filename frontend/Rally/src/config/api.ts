// API Configuration
// In production, set EXPO_PUBLIC_API_URL to point at your backend
// (e.g. https://api.yourdomain.com/api/v1)
export const API_BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (__DEV__ ? 'http://localhost:3001/api/v1' : '/api/v1');

// API timeout in milliseconds
export const API_TIMEOUT = 10000;

// Common API headers
export const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

// Device ID storage key
export const DEVICE_ID_KEY = '@badminton_device_id';

// Auth token storage keys — standardized on the keys used by `authSlice.ts`
// (`accessToken` / `refreshToken`). `AUTH_TOKEN_KEY` is kept as an alias for
// backward compatibility.
export const ACCESS_TOKEN_KEY = 'accessToken';
export const REFRESH_TOKEN_KEY = 'refreshToken';
export const AUTH_TOKEN_KEY = ACCESS_TOKEN_KEY;

// API endpoints
export const API_ENDPOINTS = {
  // MVP Sessions
  MVP_SESSIONS: '/mvp-sessions',
  
  // Session History
  SESSION_HISTORY: '/session-history',
  PLAYER_STATS: '/session-history/players',
  
  // Search
  SEARCH: '/search',
  SEARCH_SUGGESTIONS: '/search/suggestions',
  
  // Auth
  AUTH_LOGIN: '/auth/login',
  AUTH_REGISTER: '/auth/register',
  AUTH_REFRESH: '/auth/refresh',
  
  // Users
  USERS: '/users',
} as const;