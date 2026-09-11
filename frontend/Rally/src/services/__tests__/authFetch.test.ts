jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../config/api', () => ({
  API_BASE_URL: 'http://localhost:3001/api/v1',
  ACCESS_TOKEN_KEY: 'accessToken',
  REFRESH_TOKEN_KEY: 'refreshToken',
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import { authFetch, clearAuthTokens, refreshAccessToken } from '../authFetch';

const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;
const removeItem = AsyncStorage.removeItem as jest.Mock;

const makeResponse = (status: number, body: any = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  json: jest.fn().mockResolvedValue(body),
  clone() {
    return makeResponse(status, body);
  },
});

const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

const tokens = (accessToken: string | null, refreshToken: string | null) =>
  getItem.mockImplementation((key: string) =>
    Promise.resolve(key === 'accessToken' ? accessToken : refreshToken)
  );

describe('authFetch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setItem.mockResolvedValue(undefined);
    removeItem.mockResolvedValue(undefined);
  });

  it('attaches the stored access token', async () => {
    tokens('access-1', 'refresh-1');
    mockFetch.mockResolvedValue(makeResponse(200, { success: true }));

    await authFetch('/mvp-sessions/ABC');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/v1/mvp-sessions/ABC');
    expect((init.headers as any).Authorization).toBe('Bearer access-1');
  });

  it('sends no Authorization header for guests (token-free join)', async () => {
    tokens(null, null);
    mockFetch.mockResolvedValue(makeResponse(201, { success: true }));

    await authFetch('/mvp-sessions/join/ABC', { method: 'POST' });

    const [, init] = mockFetch.mock.calls[0];
    expect((init.headers as any).Authorization).toBeUndefined();
  });

  it('refreshes once, persists the new pair, and retries the original request', async () => {
    tokens('expired-access', 'refresh-1');
    mockFetch
      .mockResolvedValueOnce(makeResponse(401, { error: { code: 'UNAUTHORIZED' } }))
      .mockResolvedValueOnce(
        makeResponse(200, { data: { tokens: { accessToken: 'new-access', refreshToken: 'refresh-2' } } })
      )
      .mockResolvedValueOnce(makeResponse(200, { success: true, retried: true }));

    const response = await authFetch('/mvp-sessions/ABC');

    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(setItem).toHaveBeenCalledWith('accessToken', 'new-access');
    expect(setItem).toHaveBeenCalledWith('refreshToken', 'refresh-2');

    const [retryUrl, retryInit] = mockFetch.mock.calls[2];
    expect(retryUrl).toBe('http://localhost:3001/api/v1/mvp-sessions/ABC');
    expect((retryInit.headers as any).Authorization).toBe('Bearer new-access');
    expect(response.status).toBe(200);
  });

  it('clears tokens and surfaces the original 401 when refresh fails', async () => {
    tokens('expired-access', 'refresh-1');
    mockFetch
      .mockResolvedValueOnce(makeResponse(401, { error: { code: 'UNAUTHORIZED' } }))
      .mockResolvedValueOnce(makeResponse(401, { error: { code: 'UNAUTHORIZED' } }));

    const response = await authFetch('/mvp-sessions/ABC');

    expect(response.status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(removeItem).toHaveBeenCalledWith('accessToken');
    expect(removeItem).toHaveBeenCalledWith('refreshToken');
  });

  it('does not attempt a refresh for the auth endpoints themselves', async () => {
    tokens('access-1', 'refresh-1');
    mockFetch.mockResolvedValueOnce(makeResponse(401, { error: { code: 'UNAUTHORIZED' } }));

    const response = await authFetch('/auth/refresh', { method: 'POST' });

    expect(response.status).toBe(401);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('passes non-401 responses straight through', async () => {
    tokens('access-1', 'refresh-1');
    mockFetch.mockResolvedValueOnce(makeResponse(500, { error: { code: 'INTERNAL_ERROR' } }));

    const response = await authFetch('/mvp-sessions/ABC');

    expect(response.status).toBe(500);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('clearAuthTokens removes both keys', async () => {
    await clearAuthTokens();
    expect(removeItem).toHaveBeenCalledWith('accessToken');
    expect(removeItem).toHaveBeenCalledWith('refreshToken');
  });

  it('refreshAccessToken returns null when no refresh token is stored', async () => {
    tokens('access-1', null);
    await expect(refreshAccessToken()).resolves.toBeNull();
    expect(mockFetch).not.toHaveBeenCalled();
  });
});
