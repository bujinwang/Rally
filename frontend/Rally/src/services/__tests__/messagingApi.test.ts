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
import { messagingApi, MessagingApiError } from '../messagingApi';

const getItem = AsyncStorage.getItem as jest.Mock;
const setItem = AsyncStorage.setItem as jest.Mock;

const makeResponse = (status: number, body: any = {}) => ({
  status,
  ok: status >= 200 && status < 300,
  json: jest.fn().mockResolvedValue(body),
  clone() {
    return makeResponse(status, body);
  },
});

const tokens = (accessToken: string | null, refreshToken: string | null) =>
  getItem.mockImplementation((key: string) =>
    Promise.resolve(key === 'accessToken' ? accessToken : refreshToken)
  );

describe('messagingApi', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setItem.mockResolvedValue(undefined);
  });

  it('GET /messaging/threads succeeds with the stored token', async () => {
    tokens('access-1', 'refresh-1');
    const mockFetch = jest.fn().mockResolvedValue(
      makeResponse(200, { data: [{ id: 't1', participants: ['u1'] }] })
    );
    (global as any).fetch = mockFetch;

    const threads = await messagingApi.getUserThreads();

    expect(threads).toEqual([{ id: 't1', participants: ['u1'] }]);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:3001/api/v1/messaging/threads');
    expect((init.headers as any).Authorization).toBe('Bearer access-1');
  });

  it('refreshes and retries once on a 401 (expired token recovery)', async () => {
    tokens('expired', 'refresh-1');
    // First call: 401 for threads. Then /auth/refresh returns a new token.
    // Final call: 200 for threads.
    const mockFetch = jest
      .fn()
      .mockResolvedValueOnce(makeResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired access token' } }))
      .mockResolvedValueOnce(makeResponse(200, { data: { tokens: { accessToken: 'new-access', refreshToken: 'new-refresh' } } }))
      .mockResolvedValueOnce(makeResponse(200, { data: [{ id: 't2' }] }));
    (global as any).fetch = mockFetch;

    const threads = await messagingApi.getUserThreads();

    expect(threads).toEqual([{ id: 't2' }]);
    // threads(401) + refresh + threads(200)
    expect(mockFetch).toHaveBeenCalledTimes(3);
    expect(setItem).toHaveBeenCalledWith('accessToken', 'new-access');
  });

  it('attaches Content-Type for POST bodies (createThread)', async () => {
    tokens('access-1', 'refresh-1');
    const mockFetch = jest.fn().mockResolvedValue(makeResponse(200, { data: { id: 't3' } }));
    (global as any).fetch = mockFetch;

    await messagingApi.createThread(['u2'], 'Plan Saturday');

    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe('POST');
    expect((init.headers as any)['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({ participants: ['u2'], title: 'Plan Saturday' });
  });

  it('throws MessagingApiError with status on failure', async () => {
    tokens('access-1', 'refresh-1');
    const mockFetch = jest.fn().mockResolvedValue(
      makeResponse(500, { error: { message: 'boom' } })
    );
    (global as any).fetch = mockFetch;

    await expect(messagingApi.getUserThreads()).rejects.toBeInstanceOf(MessagingApiError);
    await expect(messagingApi.getUserThreads()).rejects.toMatchObject({ status: 500 });
  });
});
