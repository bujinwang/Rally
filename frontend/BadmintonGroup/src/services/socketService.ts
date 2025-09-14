import { io, Socket } from 'socket.io-client';
import { API_BASE_URL } from '../config/api';

export interface SocketEvents {
  // Session events
  'session:updated': (sessionData: any) => void;
  'session:player-joined': (player: any) => void;
  'session:player-left': (player: any) => void;
  'session:status-changed': (status: string) => void;

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
}

class SocketService {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 2000;
  private listeners: Map<string, Function[]> = new Map();
  private isEnabled = true; // Enable by default

  constructor() {
    // Don't auto-connect by default to prevent connection errors
    console.log('🔌 Socket service initialized (connection disabled by default)');
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
  connect(): void {
    if (!this.isEnabled) {
      console.log('🔌 Socket.IO disabled, skipping connection');
      return;
    }

    if (this.socket?.connected) {
      return;
    }

    console.log('🔌 Connecting to Socket.IO server...');
    
    const serverUrl = API_BASE_URL.replace('/api/v1', ''); // Remove API path for socket connection
    
    this.socket = io(serverUrl, {
      transports: ['polling', 'websocket'], // Start with polling, upgrade to websocket
      timeout: 3000,
      reconnection: true,
      reconnectionAttempts: this.maxReconnectAttempts,
      reconnectionDelay: this.reconnectDelay,
      forceNew: true,
      upgrade: true,
      rememberUpgrade: false
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
        this.emitToListeners('error', error);
      }
    });

    // Session event handlers
    this.socket.on('session:updated', (data) => {
      console.log('📡 Session updated:', data);
      this.emitToListeners('session:updated', data);
    });

    // MVP session event handlers
    this.socket.on('mvp-session-updated', (data) => {
      console.log('🔥 DEBUG: Received mvp-session-updated on socket:', data);
      this.emitToListeners('mvp-session-updated', data);
    });

    this.socket.on('session:player-joined', (data) => {
      console.log('👤 Player joined:', data);
      this.emitToListeners('session:player-joined', data);
    });

    this.socket.on('session:player-left', (data) => {
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

  // Join a session room for real-time updates (graceful fallback)
  joinSession(shareCode: string, deviceId?: string): void {
    if (!this.socket?.connected) {
      console.warn('Socket not connected, skipping real-time session join');
      return;
    }

    try {
      console.log(`📍 Joining session room: ${shareCode}`);
      this.socket.emit('join-session', shareCode);
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
    } catch (error) {
      console.warn('Failed to leave session room:', error);
    }
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