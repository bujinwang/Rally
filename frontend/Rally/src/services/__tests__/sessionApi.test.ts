// @ts-nocheck
// Tests for sessionApi and mvpApiService pure logic (no RN dependencies needed)

// Mock AsyncStorage and DeviceService before import
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn().mockResolvedValue(undefined),
  getItem: jest.fn().mockResolvedValue(null),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../../services/deviceService', () => ({
  __esModule: true,
  default: {
    getDeviceId: jest.fn().mockResolvedValue('device-test-123'),
    getIdentity: jest.fn().mockResolvedValue({ deviceId: 'device-test-123', lastUsedName: 'David' }),
    saveUserName: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../config/api', () => ({
  API_BASE_URL: 'http://localhost:3001/api/v1',
  DEVICE_ID_KEY: '@badminton_device_id',
}));

import sessionApi from '../sessionApi';

describe('sessionApi - validation', () => {
  it('rejects missing organizer name', () => {
    const errors = sessionApi.validateSessionData({ dateTime: '2026-05-11T19:00:00Z' });
    expect(errors).toContain('Your name is required');
  });

  it('rejects missing dateTime', () => {
    const errors = sessionApi.validateSessionData({ organizerName: 'David' });
    expect(errors).toContain('Session date and time is required');
  });

  it('rejects past date', () => {
    const errors = sessionApi.validateSessionData({
      organizerName: 'David',
      dateTime: '2020-01-01T00:00:00Z',
    });
    expect(errors).toContain('Session must be scheduled for a future date and time');
  });

  it('accepts valid future session', () => {
    const errors = sessionApi.validateSessionData({
      organizerName: 'David',
      dateTime: '2099-06-01T19:00:00Z',
    });
    expect(errors).toHaveLength(0);
  });

  it('rejects name > 30 characters', () => {
    const errors = sessionApi.validateSessionData({
      organizerName: 'A'.repeat(31),
      dateTime: '2099-06-01T19:00:00Z',
    });
    expect(errors).toContain('Name cannot exceed 30 characters');
  });

  it('rejects maxPlayers out of range', () => {
    const errors = sessionApi.validateSessionData({
      organizerName: 'David',
      dateTime: '2099-06-01T19:00:00Z',
      maxPlayers: 100,
    });
    expect(errors).toContain('Maximum players must be between 2 and 20');
  });
});

describe('sessionApi - formatting', () => {
  it('formats session for display', () => {
    const result = sessionApi.formatSessionForDisplay({
      id: 's1',
      name: 'Monday Badminton',
      scheduledAt: '2026-05-11T19:00:00Z',
      status: 'ACTIVE',
      maxPlayers: 16,
      players: [{ id: 'p1', name: 'David' }, { id: 'p2', name: 'Kevin' }] as any,
      games: [] as any,
    } as any);

    expect(result.displayName).toBe('Monday Badminton');
    expect(result.playersText).toBe('2/16 players');
    expect(result.statusText).toBe('Active');
    expect(result.statusColor).toBe('#4CAF50');
  });

  it('returns Not started for session with no games', () => {
    const result = sessionApi.formatSessionForDisplay({
      id: 's1', games: [], status: 'ACTIVE', scheduledAt: '2026-05-11T19:00:00Z',
      players: [], maxPlayers: 10, name: 'Test',
    } as any);
    expect(result.duration).toBe('Not started');
  });

  it('returns correct status text for each status', () => {
    const baseSession = { players: [], games: [], maxPlayers: 10, scheduledAt: '2026-05-11T19:00:00Z', name: 'X' } as any;

    expect(sessionApi.formatSessionForDisplay({ ...baseSession, status: 'COMPLETED' }).statusText).toBe('Completed');
    expect(sessionApi.formatSessionForDisplay({ ...baseSession, status: 'CANCELLED' }).statusText).toBe('Cancelled');
    expect(sessionApi.formatSessionForDisplay({ ...baseSession, status: 'ACTIVE' }).statusText).toBe('Active');
  });

  it('computes duration from game start/end times', () => {
    const result = sessionApi.formatSessionForDisplay({
      id: 's1', name: 'Test', scheduledAt: '2026-05-11T19:00:00Z',
      status: 'COMPLETED', maxPlayers: 10,
      players: [],
      games: [
        { startTime: '2026-05-11T19:00:00Z', endTime: '2026-05-11T19:25:00Z' },
        { startTime: '2026-05-11T19:30:00Z', endTime: '2026-05-11T20:00:00Z' },
      ],
    } as any);
    expect(result.duration).toBe('1h 0min');
  });
});

describe('sessionApi - share link', () => {
  it('generates share link from share code', () => {
    const link = sessionApi.generateShareLink('ABC123');
    expect(link).toBe('https://badminton-group.app/join/ABC123');
  });
});

describe('sessionApi - organizer name persistence', () => {
  it('saves and retrieves organizer name', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');

    await sessionApi.saveLastOrganizerName('David');
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('last_organizer_name', 'David');

    AsyncStorage.getItem.mockResolvedValueOnce('David');
    const name = await sessionApi.getLastOrganizerName();
    expect(name).toBe('David');
  });

  it('returns empty string when no name stored', async () => {
    const AsyncStorage = require('@react-native-async-storage/async-storage');
    AsyncStorage.getItem.mockResolvedValueOnce(null);
    const name = await sessionApi.getLastOrganizerName();
    expect(name).toBe('');
  });
});

// ── mvpApiService format test ───────────────────────────────

jest.mock('../../services/apiService', () => ({
  ApiService: class {
    constructor(baseUrl: string) { this.baseUrl = baseUrl; }
    async request(path: string, options: any) { return { success: true }; }
  },
}));

import { mvpApiService } from '../mvpApiService';

describe('mvpApiService - format for share', () => {
  it('formats session for WeChat/WhatsApp share', () => {
    const session = {
      id: 's1', name: 'Monday Badminton', shareCode: 'ABC', shareUrl: 'https://app.com/join/ABC',
      scheduledAt: '2026-05-11T19:00:00Z', location: 'Community Center',
      status: 'ACTIVE', maxPlayers: 16, playerCount: 4, ownerName: 'David', createdAt: '',
      players: [
        { name: 'David', status: 'ACTIVE', role: 'ORGANIZER' },
        { name: 'Kevin', status: 'ACTIVE', role: 'PLAYER' },
        { name: 'Jie', status: 'RESTING', role: 'PLAYER' },
        { name: 'Bertchen', status: 'RESTING', role: 'PLAYER' },
      ],
    };

    const message = mvpApiService.formatSessionForShare(session);
    expect(message).toContain('Monday Badminton');
    expect(message).toContain('Community Center');
    expect(message).toContain('已确认 (2)');
    expect(message).toContain('David, Kevin');
    expect(message).toContain('等待中 (2)');
    expect(message).toContain('Jie, Bertchen');
    expect(message).toContain('https://app.com/join/ABC');
  });
});
