// Minimal API client stub
const API_BASE = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3001/api/v1';

export const apiClient = {
  get: async (url: string, options?: any) => {
    const response = await fetch(`${API_BASE}${url}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      ...options,
    });
    return response.json();
  },
  post: async (url: string, data?: any, options?: any) => {
    const response = await fetch(`${API_BASE}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: data ? JSON.stringify(data) : undefined,
      ...options,
    });
    return response.json();
  },
};
