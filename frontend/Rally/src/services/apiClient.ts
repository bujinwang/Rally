// Minimal API client stub
// Base URL comes from the canonical `config/api` module so there is a single
// source of truth (Story 6.9, T14/F13).
import { API_BASE_URL } from '../config/api';

const API_BASE = API_BASE_URL;

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
