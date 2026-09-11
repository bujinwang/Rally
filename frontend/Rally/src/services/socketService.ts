import { io, Socket } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, ACCESS_TOKEN_KEY } from '../config/api';
import DeviceService from './deviceService';

export interface SocketEvents {
  // Session events
  'session:updated': (sessionData: any) => void;
  'session:player-joined': (player: any) => void;
  'session:player-left': (player: any) => void;
  'session:status-changed': (status: string) => void;

  // MVP session broadcast events
  'mvp-session-updated': (data: any) => void;
  'session-notification': (data: any) => void;
  'user-joined': (data: any) => void;

  // Discovery events
  'discovery:sessions': (data: { sessions: any[]; location: any; radius: number; timestamp: string }) => void;
  'discovery:session-created': (data: { session: any; timestamp: string }) => void;
  'discovery:session-updated': (data: { session: any; timestamp: string }) => void;
  'discovery:session-deleted': (data: { sessionId: string; shareCode: string; timestamp: string }) => void;

  // Status management events
  'status_request': (data: {
    requestId: string;
    playerId: string;
    playerName: string;
    action: 'rest' | 'leave';
    reason?: string;
    requestedAt: string;
    requestedBy: 'self' | 'organizer';
  }) => void;

  'status_approved': (data: {
    playerId: string;
    playerName: string;
    newStatus: 'ACTIVE' | 'RESTING' | 'LEFT';
    action: 'rest' | 'leave';
    approvedAt: string;
    expiresAt?: string;
    reason?: string;
  }) => void;

  'status_denied': (data: {
    playerId: string;
    playerName: string;
    action: 'rest' | 'leave';
    deniedAt: string;
    reason?: string;
  }) => void;

  'status_expired': (data: {
    playerId: string;
    playerName: string;
    newStatus: 'ACTIVE';
    expiredAt: string;
  }) => void;

  // Pairing events
  'pairings_updated': (data: {
    sessionId: string;
    pairings: any[];
    fairnessScore: number;
    generatedAt: string;
  }) => void;

  'pairing_adjusted': (data: {
    sessionId: string;
    pairingId: string;
    changes: any[];
    adjustedAt: string;
  }) => void;

  // Game events
  'game:started': (gameData: any) => void;
  'game:updated': (gameData: any) => void;
  'game:completed': (gameData: any) => void;
  'game:score-updated': (scoreData: any) => void;

  // Connection events
  'connect': () => void;
  'disconnect': () => void;
  'error': (error: any) => void;

  // Story 6.4 — real-time sync hardening
  'session:player-status-changed': (data: any) => void;
  'session:score-updated': (data: any) => void;
  'tournament:bracket': (data: any) => void;
  'tournament:match-complete': (data: any) => void;
  'tournament:leaderboard': (data: any) => void;
  'sync:resumed': (data: any) => void;
  'polling:fallback': (data: any) => void;
  'polling:tick': (data: any) => void;
}

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 2000;
  private listeners: Map<string, Function[]> = new Map();
  private isEnabled = true; // Enable by default

  // Story 6.4 — reconnect recovery + polling fallback state.
  // lastEventId per room, so on reconnect the server can replay only what we
  // missed or tell us to refetch (AC 8, AC 11).
  private lastEventIds: Map<string, number> = new Map();
  // Rooms we have joined, re-subscribed automatically after a reconnect.
  private joinedRooms: Set<string> = new Set();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollingFallbackActive = false;
  // Called when a refetch is required (missed too many events).
  private refetchHandler: ((room: string) => void) | null = null;

  constructor() {
    // Don't auto-connect by default to prevent connection errors
    console.log('🔌 Socket service initialized (connection disabled by default)');
  }

  /** Register a callback invoked when the server says "refetch room X". */
  onRefetchRequired(handler: (room: string) => void): void {
    this.refetchHandler = handler;
  }

  /** True when we have degraded to polling (AC 16). */
  isPollingFallbackActive(): boolean {
    return this.pollingFallbackActive;
  }

  // Enable Socket.IO connections
  enable(): void {
    this.isEnabled = true;
    console.log('🔌 Socket.IO enabled');
  }

  // Disable Socket.IO connections
  disable(): void {
    this.isEnabled = false;
    this.disconnect();
    console.log('🔌 Socket.IO disabled');
  }

  // Connect to Socket.IO server (only if enabled)
  async connect(): Promise<void> {
    if (!this.isEnabled) {
      console.log('🔌 Socket.IO disabled, skipping connection');
      return;
    }

    if (this.socket?.connected) {
      return;
    }

    console.log('🔌 Connecting to Socket.IO server...');

    const serverUrl = API_BASE_URL.replace('/api/v1', ''); // Remove API path for socket connection

    // Read auth token for handshake (Story 6.4)
    const token = await AsyncStorage.getItem(ACCESS_TOKEN_KEY);
    // Resolve the persistent device id so guest sockets can be authorized to
    // join their own session rooms (Story 6.4 regression fix). Guests have no
    // JWT, so the self-asserted deviceId is the only identity they can present.
    const deviceId = await DeviceService.getDeviceId().catch(() => undefined);

    this.socket = io(serverUrl, {
      transports: ['polling', 'websocket'], // Start with polling, upgrade to websocket
      timeout: 3000,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      forceNew: true,
      upgrade: true,
      rememberUpgrade: false,
      auth: {
        token: token ? `Bearer ${token}` : undefined,
        deviceId,
      },
    });

    this.setupEventHandlers();
  }

  // Disconnect from server
  disconnect(): void {
    console.log('🔌 Disconnecting from Socket.IO server...');
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.listeners.clear();
  }

  // Setup basic event handlers
  private setupEventHandlers(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      console.log('✅ Connected to Socket.IO server');
      this.reconnectAttempts = 0;
      // A successful socket connection supersedes any polling fallback.
      this.stopPollingFallback();
      // Re-subscribe to rooms and request missed-event replay (AC 8, AC 11).
      this.resumeRooms();
      this.emitToListeners('connect');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('❌ Disconnected from Socket.IO server:', reason);
      this.emitToListeners('disconnect');
    });

    this.socket.on('connect_error', (error) => {
      console.warn('⚠️ Socket connection error (will retry):', error.message);
      this.reconnectAttempts++;

      // Don't spam the listeners with every connection error
      if (this.reconnectAttempts >= this.maxReconnectAttempts) {
        console.error('💥 Max socket reconnection attempts reached');
        // Graceful degradation: fall back to polling instead of going dark
        // (Story 6.4, AC 16).
        this.startPollingFallback();
        this.emitToListeners('error', error);
      }
    });

    // Server response to a resume request (AC 11).
    this.socket.on('sync:resumed', (data: {
      results?: Array<{ room: string; mode: 'replay' | 'refetch'; replayed?: number }>;
    }) => {
      (data?.results || []).forEach((r) => {
        if (r.mode === 'refetch') {
          console.warn(`🔄 Refetch required for room ${r.room}`);
          this.refetchHandler?.(r.room);
        } else {
          console.log(`🔄 Replayed ${r.replayed ?? 0} event(s) for ${r.room}`);
        }
      });
      this.emitToListeners('sync:resumed', data);
    });

    // Session event handlers
    this.socket.on('session:updated', (data) => {
      this.trackEventId(data);
      console.log('📡 Session updated:', data);
      this.emitToListeners('session:updated', data);
    });

    // MVP session event handlers
    this.socket.on('mvp-session-updated', (data) => {
      this.trackEventId(data);
      console.log('🔥 DEBUG: Received mvp-session-updated on socket:', data);
      this.emitToListeners('mvp-session-updated', data);
    });

    // Story 6.4 — authoritative gameplay events.
    this.socket.on('session:player-status-changed', (data) => {
      this.trackEventId(data);
      this.emitToListeners('session:player-status-changed', data);
    });

    this.socket.on('session:score-updated', (data) => {
      this.trackEventId(data);
      this.emitToListeners('session:score-updated', data);
    });

    // Story 6.4 — tournament real-time (replaces the server-side placeholder).
    this.socket.on('tournament:bracket', (data) => {
      this.trackEventId(data);
      this.emitToListeners('tournament:bracket', data);
    });

    this.socket.on('tournament:match-complete', (data) => {
      this.trackEventId(data);
      this.emitToListeners('tournament:match-complete', data);
    });

    this.socket.on('tournament:leaderboard', (data) => {
      this.trackEventId(data);
      this.emitToListeners('tournament:leaderboard', data);
    });

    this.socket.on('session:player-joined', (data) => {
      this.trackEventId(data);
      console.log('👤 Player joined:', data);
      this.emitToListeners('session:player-joined', data);
    });

    this.socket.on('session:player-left', (data) => {
      this.trackEventId(data);
      console.log('👋 Player left:', data);
      this.emitToListeners('session:player-left', data);
    });

    // Status management event handlers
    this.socket.on('status_request', (data) => {
      console.log('📝 Status change request:', data);
      this.emitToListeners('status_request', data);
    });

    this.socket.on('status_approved', (data) => {
      console.log('✅ Status change approved:', data);
      this.emitToListeners('status_approved', data);
    });

    this.socket.on('status_denied', (data) => {
      console.log('❌ Status change denied:', data);
      this.emitToListeners('status_denied', data);
    });

    this.socket.on('status_expired', (data) => {
      console.log('⏰ Rest period expired:', data);
      this.emitToListeners('status_expired', data);
    });

    // Pairing event handlers
    this.socket.on('pairings_updated', (data) => {
      console.log('🎯 Pairings updated:', data);
      this.emitToListeners('pairings_updated', data);
    });

    this.socket.on('pairing_adjusted', (data) => {
      console.log('🔧 Pairing adjusted:', data);
      this.emitToListeners('pairing_adjusted', data);
    });

    // Discovery event handlers
    this.socket.on('discovery:sessions', (data) => {
      console.log('📍 Discovery sessions received:', data);
      this.emitToListeners('discovery:sessions', data);
    });

    this.socket.on('discovery:session-created', (data) => {
      console.log('🆕 Session created:', data);
      this.emitToListeners('discovery:session-created', data);
    });

    this.socket.on('discovery:session-updated', (data) => {
      console.log('🔄 Session updated:', data);
      this.emitToListeners('discovery:session-updated', data);
    });

    this.socket.on('discovery:session-deleted', (data) => {
      console.log('🗑️ Session deleted:', data);
      this.emitToListeners('discovery:session-deleted', data);
    });
  }

  // Emit event to registered listeners
  private emitToListeners(eventName: string, data?: any): void {
    const eventListeners = this.listeners.get(eventName);
    if (eventListeners) {
      eventListeners.forEach(listener => {
        try {
          listener(data);
        } catch (error) {
          console.error(`Error in ${eventName} listener:`, error);
        }
      });
    }
  }

  // -------------------------------------------------------------------------
  // Story 6.4 — reconnect recovery + polling fallback
  // -------------------------------------------------------------------------

  /**
   * Record the monotonic eventId carried by an authoritative event so the
   * next reconnect can ask the server to replay only what we missed (AC 11).
   */
  private trackEventId(data: any): void {
    const room =
      data?.shareCode ? `session:${data.shareCode}` :
      data?.tournamentId ? `tournament:${data.tournamentId}` :
      null;
    if (room && typeof data?.eventId === 'number') {
      const prev = this.lastEventIds.get(room) || 0;
      if (data.eventId > prev) this.lastEventIds.set(room, data.eventId);
    }
  }

  /**
   * Re-subscribe to every room we had joined and ask the server to replay
   * missed events (AC 8 — no duplicate or lost events on reconnect).
   */
  private resumeRooms(): void {
    if (!this.socket?.connected) return;

    if (this.joinedRooms.size === 0) return;

    // Re-join each room using the authenticated object form (so a reconnecting
    // guest still presents its deviceId), then request the missed-event replay.
    void Promise.all(
      Array.from(this.joinedRooms).map((shareCode) =>
        this.joinSession(shareCode).catch(() => undefined)
      )
    ).then(() => {
      this.socket?.emit('sync:resume', {
        rooms: Array.from(this.joinedRooms).map((shareCode) => ({
          room: `session:${shareCode}`,
          lastEventId: this.lastEventIds.get(`session:${shareCode}`) || 0,
        })),
      });
    });
  }

  /**
   * Degrade to polling when sockets are unavailable (AC 16).
   * Emits a synthetic `polling:fallback` signal so screens can switch to
   * their REST refresh loop instead of going dark.
   */
  private startPollingFallback(): void {
    if (this.pollingFallbackActive) return;
    this.pollingFallbackActive = true;
    console.warn('📡 Socket unavailable — falling back to polling');

    this.emitToListeners('polling:fallback', { active: true });

    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = setInterval(() => {
      this.emitToListeners('polling:tick', { timestamp: Date.now() });
    }, 15000);
    // Node/browser differs on Interval types; clearInterval handles both.
    (this.pollTimer as any)?.unref?.();
  }

  /** Stop the polling fallback once sockets recover. */
  private stopPollingFallback(): void {
    if (!this.pollingFallbackActive && !this.pollTimer) return;
    this.pollingFallbackActive = false;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.emitToListeners('polling:fallback', { active: false });
  }

  // Join a session room for real-time updates (graceful fallback)
  async joinSession(shareCode: string, deviceId?: string): Promise<void> {
    if (!this.socket?.connected) {
      console.warn('Socket not connected, skipping real-time session join');
      return;
    }

    try {
      // Prefer the caller-supplied deviceId, else fall back to the persistent
      // one. The server requires a verified userId or a deviceId (Story 6.4),
      // so we must always emit the object form with our guest identity.
      const resolvedDeviceId =
        deviceId || (await DeviceService.getDeviceId().catch(() => undefined));
      console.log(`📍 Joining session room: ${shareCode}`);
      this.socket.emit('join-session', { shareCode, deviceId: resolvedDeviceId });
      this.joinedRooms.add(shareCode);
    } catch (error) {
      console.warn('Failed to join session room:', error);
    }
  }

  // Leave a session room (graceful fallback)
  leaveSession(shareCode: string): void {
    if (!this.socket?.connected) {
      console.warn('Socket not connected, skipping real-time session leave');
      return;
    }

    try {
      console.log(`📤 Leaving session room: ${shareCode}`);
      this.socket.emit('leave-session', shareCode);
      this.joinedRooms.delete(shareCode);
      this.lastEventIds.delete(`session:${shareCode}`);
    } catch (error) {
      console.warn('Failed to leave session room:', error);
    }
  }

  // Join a tournament room for real-time bracket/leaderboard updates (Story 6.4)
  joinTournament(tournamentId: string): void {
    if (!this.socket?.connected) {
      console.warn('Socket not connected, skipping real-time tournament join');
      return;
    }
    try {
      console.log(`🏆 Joining tournament room: ${tournamentId}`);
      this.socket.emit('join-tournament', { tournamentId });
    } catch (error) {
      console.warn('Failed to join tournament room:', error);
    }
  }

  // Leave a tournament room (graceful fallback)
  leaveTournament(tournamentId: string): void {
    if (!this.socket?.connected) {
      console.warn('Socket not connected, skipping real-time tournament leave');
      return;
    }
    try {
      console.log(`🏆 Leaving tournament room: ${tournamentId}`);
      this.socket.emit('leave-tournament', { tournamentId });
    } catch (error) {
      console.warn('Failed to leave tournament room:', error);
    }
  }

  // Remove all registered listeners
  removeAllListeners(): void {
    this.listeners.clear();
  }

  // Notify the server that a player's status changed
  emitPlayerStatusUpdate(shareCode: string, playerId: string, status: string): void {
    this.emit('session:player-status-update', { shareCode, playerId, status });
  }

  // Notify the server that a player joined
  emitPlayerJoined(shareCode: string, player: any): void {
    this.emit('session:player-joined', { shareCode, player });
  }

  // Register event listener
  on<K extends keyof SocketEvents>(event: K, listener: SocketEvents[K]): void {
    if (!this.listeners) {
      console.warn('Socket listeners not initialized');
      return;
    }
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  // Unregister event listener
  off<K extends keyof SocketEvents>(event: K, listener: SocketEvents[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  // Check if connected
  isConnected(): boolean {
    return this.isEnabled && (this.socket?.connected || false);
  }

  // Get connection status
  getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' | 'disabled' {
    if (!this.isEnabled) return 'disabled';
    if (!this.socket) return 'disconnected';
    if (this.socket.connected) return 'connected';
    // Socket.IO doesn't have a direct 'connecting' state, so we infer it
    return 'disconnected';
  }

  // Join discovery location room for real-time updates
  joinDiscovery(latitude: number, longitude: number, radius: number = 10): void {
    if (!this.socket?.connected) {
      console.warn('Socket not connected, skipping discovery join');
      return;
    }

    try {
      console.log(`📍 Joining discovery room: ${latitude}, ${longitude}, ${radius}km`);
      this.socket.emit('join-discovery', { latitude, longitude, radius });
    } catch (error) {
      console.warn('Failed to join discovery room:', error);
    }
  }

  // Leave discovery room
  leaveDiscovery(latitude: number, longitude: number, radius: number = 10): void {
    if (!this.socket?.connected) {
      console.warn('Socket not connected, skipping discovery leave');
      return;
    }

    try {
      console.log(`📤 Leaving discovery room: ${latitude}, ${longitude}, ${radius}km`);
      this.socket.emit('leave-discovery', { latitude, longitude, radius });
    } catch (error) {
      console.warn('Failed to leave discovery room:', error);
    }
  }

  // Emit session events for real-time discovery updates
  emitSessionCreated(sessionId: string, shareCode: string): void {
    this.emit('session:created', { sessionId, shareCode });
  }

  emitSessionUpdated(sessionId: string, shareCode: string): void {
    this.emit('session:updated', { sessionId, shareCode });
  }

  emitSessionDeleted(sessionId: string, shareCode: string): void {
    this.emit('session:deleted', { sessionId, shareCode });
  }

  // Emit event to server
  emit(event: string, data?: any): void {
    if (!this.socket?.connected) {
      console.warn('Socket not connected, cannot emit event:', event);
      return;
    }
    this.socket.emit(event, data);
  }
}

// Create singleton instance
const socketService = new SocketService();

// Export singleton
export default socketService;