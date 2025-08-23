import { io, Socket } from 'socket.io-client';
import { MvpSession } from './mvpApiService';

interface SocketEvents {
  'mvp-session-updated': (data: { session: MvpSession; timestamp: string }) => void;
  'user-joined': (data: { socketId: string; timestamp: string }) => void;
  error: (error: { message: string }) => void;
}

interface SocketEmitEvents {
  'join-session': (shareCode: string) => void;
  'leave-session': (shareCode: string) => void;
  'mvp-player-status-update': (data: { shareCode: string; playerId: string; status: string }) => void;
  'mvp-player-joined': (data: { shareCode: string; player: any }) => void;
}

class SocketService {
  private socket: Socket | null = null;
  private currentSession: string | null = null;
  private listeners: Map<keyof SocketEvents, Function[]> = new Map();

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }

      // Get server URL from environment
      const serverUrl = process.env.EXPO_PUBLIC_API_URL?.replace('/api/v1', '') || 'http://localhost:3001';
      
      this.socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionAttempts: 5,
        timeout: 5000,
      });

      this.socket.on('connect', () => {
        console.log('📡 Connected to socket server');
        resolve();
      });

      this.socket.on('connect_error', (error) => {
        console.error('📡 Socket connection error:', error);
        reject(error);
      });

      this.socket.on('disconnect', () => {
        console.log('📡 Disconnected from socket server');
      });

      // Set up event forwarding
      this.setupEventForwarding();
    });
  }

  disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.currentSession = null;
      console.log('📡 Socket disconnected');
    }
  }

  async joinSession(shareCode: string): Promise<void> {
    if (!this.socket?.connected) {
      await this.connect();
    }

    if (this.currentSession === shareCode) {
      return; // Already joined this session
    }

    // Leave current session if any
    if (this.currentSession) {
      this.leaveSession();
    }

    this.currentSession = shareCode;
    this.socket?.emit('join-session', shareCode);
    console.log(`📡 Joined session: ${shareCode}`);
  }

  leaveSession(): void {
    if (this.currentSession && this.socket?.connected) {
      this.socket.emit('leave-session', this.currentSession);
      console.log(`📡 Left session: ${this.currentSession}`);
      this.currentSession = null;
    }
  }

  // Event listening methods
  on<K extends keyof SocketEvents>(event: K, listener: SocketEvents[K]): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)!.push(listener);
  }

  off<K extends keyof SocketEvents>(event: K, listener: SocketEvents[K]): void {
    const eventListeners = this.listeners.get(event);
    if (eventListeners) {
      const index = eventListeners.indexOf(listener);
      if (index > -1) {
        eventListeners.splice(index, 1);
      }
    }
  }

  // Emit methods for different events
  emitPlayerStatusUpdate(shareCode: string, playerId: string, status: string): void {
    if (this.socket?.connected) {
      this.socket.emit('mvp-player-status-update', {
        shareCode,
        playerId,
        status,
      });
    }
  }

  emitPlayerJoined(shareCode: string, player: any): void {
    if (this.socket?.connected) {
      this.socket.emit('mvp-player-joined', {
        shareCode,
        player,
      });
    }
  }

  private setupEventForwarding(): void {
    if (!this.socket) return;

    // Forward socket events to registered listeners
    this.socket.on('mvp-session-updated', (data) => {
      const listeners = this.listeners.get('mvp-session-updated') || [];
      listeners.forEach(listener => listener(data));
    });

    this.socket.on('user-joined', (data) => {
      const listeners = this.listeners.get('user-joined') || [];
      listeners.forEach(listener => listener(data));
    });

    this.socket.on('error', (error) => {
      const listeners = this.listeners.get('error') || [];
      listeners.forEach(listener => listener(error));
    });
  }

  // Utility methods
  isConnected(): boolean {
    return this.socket?.connected || false;
  }

  getCurrentSession(): string | null {
    return this.currentSession;
  }

  // Clean up all listeners
  removeAllListeners(): void {
    this.listeners.clear();
  }
}

// Export singleton instance
export const socketService = new SocketService();
export default socketService;