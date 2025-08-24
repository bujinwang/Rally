// API Configuration
export const API_BASE_URL = __DEV__ 
  ? 'http://localhost:3001/api/v1' 
  : 'https://your-production-api.com/api';

// API timeout in milliseconds
export const API_TIMEOUT = 10000;

// Common API headers
export const DEFAULT_HEADERS = {
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

// Device ID storage key
export const DEVICE_ID_KEY = '@badminton_device_id';

// Auth token storage key
export const AUTH_TOKEN_KEY = '@badminton_auth_token';

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