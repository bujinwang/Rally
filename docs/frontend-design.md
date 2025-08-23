# 📱 React Native App Design - Badminton Group Management

This document outlines the frontend architecture and implementation strategy for the badminton pairing management mobile application.

## 🏗️ App Overview

### Supported Platforms
- **iOS**: iOS 12.0+ (iPhone and iPad)
- **Android**: Android 8.0+ (API level 26+)
- **Web**: Modern browsers with React Native Web

### Core Features
- Session management and creation
- Real-time rotation system
- Player pairing and drag-and-drop
- Score recording (2-0, 2-1)
- Rest and leave requests
- Statistics and analytics
- Multi-language support (Chinese/English)

## 📁 Project Structure

### Root Level Structure
```
badminton-group-app/
├── android/                    # Android native code
├── ios/                       # iOS native code
├── src/
│   ├── components/            # Reusable UI components
│   ├── screens/              # Screen components
│   ├── navigation/           # Navigation configuration
│   ├── services/             # API and external services
│   ├── store/                # State management
│   ├── utils/                # Utility functions
│   ├── constants/            # App constants
│   ├── hooks/                # Custom React hooks
│   ├── types/                # TypeScript type definitions
│   └── assets/               # Images, fonts, etc.
├── web/                      # React Native Web specific
├── __tests__/               # Test files
├── package.json
├── app.json
├── babel.config.js
└── metro.config.js
```

### Detailed Source Structure
```
src/
├── components/
│   ├── common/
│   │   ├── Button/
│   │   ├── Card/
│   │   ├── LoadingSpinner/
│   │   ├── Modal/
│   │   └── EmptyState/
│   ├── session/
│   │   ├── SessionCard/
│   │   ├── PlayerList/
│   │   ├── CourtStatus/
│   │   └── RotationQueue/
│   ├── rotation/
│   │   ├── RotationWheel/
│   │   ├── PlayerTile/
│   │   ├── FairnessIndicator/
│   │   └── RotationControls/
│   ├── pairing/
│   │   ├── DraggablePlayer/
│   │   ├── CourtGrid/
│   │   ├── PairingSuggestion/
│   │   └── DragDropZone/
│   └── ui/
│       ├── Header/
│       ├── BottomTab/
│       └── StatusBar/
├── screens/
│   ├── auth/
│   │   ├── LoginScreen/
│   │   ├── RegisterScreen/
│   │   └── ForgotPasswordScreen/
│   ├── sessions/
│   │   ├── SessionListScreen/
│   │   ├── SessionDetailScreen/
│   │   ├── CreateSessionScreen/
│   │   └── EditSessionScreen/
│   ├── rotation/
│   │   ├── RotationScreen/
│   │   ├── ManualRotationScreen/
│   │   └── RotationHistoryScreen/
│   ├── pairing/
│   │   ├── PairingScreen/
│   │   ├── DragDropPairingScreen/
│   │   └── AutoPairingScreen/
│   ├── games/
│   │   ├── ScoreRecordingScreen/
│   │   ├── GameHistoryScreen/
│   │   └── GameDetailScreen/
│   ├── profile/
│   │   ├── ProfileScreen/
│   │   ├── StatisticsScreen/
│   │   └── SettingsScreen/
│   └── shared/
│       ├── ShareSessionScreen/
│       ├── QRCodeScreen/
│       └── NotificationSettingsScreen/
├── navigation/
│   ├── AppNavigator.tsx
│   ├── AuthNavigator.tsx
│   ├── MainTabNavigator.tsx
│   ├── StackNavigators.tsx
│   └── NavigationService.ts
├── services/
│   ├── api/
│   │   ├── apiClient.ts
│   │   ├── authService.ts
│   │   ├── sessionService.ts
│   │   ├── rotationService.ts
│   │   ├── gameService.ts
│   │   └── statsService.ts
│   ├── socket/
│   │   ├── socketService.ts
│   │   ├── sessionSocket.ts
│   │   └── rotationSocket.ts
│   ├── storage/
│   │   ├── AsyncStorageService.ts
│   │   ├── SecureStorageService.ts
│   │   └── CacheService.ts
│   ├── sync/
│   │   ├── SyncManager.ts
│   │   ├── ConflictResolver.ts
│   │   └── OfflineQueue.ts
│   └── push/
│       ├── PushNotificationService.ts
│       └── LocalNotificationService.ts
├── store/
│   ├── index.ts
│   ├── slices/
│   │   ├── authSlice.ts
│   │   ├── sessionSlice.ts
│   │   ├── rotationSlice.ts
│   │   ├── playerSlice.ts
│   │   └── uiSlice.ts
│   ├── middleware/
│   │   ├── syncMiddleware.ts
│   │   ├── offlineMiddleware.ts
│   │   └── loggingMiddleware.ts
│   └── selectors/
│       ├── sessionSelectors.ts
│       ├── rotationSelectors.ts
│       └── playerSelectors.ts
├── utils/
│   ├── validation/
│   ├── formatting/
│   ├── calculations/
│   ├── permissions/
│   └── constants/
├── hooks/
│   ├── useAuth.ts
│   ├── useSession.ts
│   ├── useRotation.ts
│   ├── useWebSocket.ts
│   ├── useOffline.ts
│   └── usePermissions.ts
├── types/
│   ├── auth.ts
│   ├── session.ts
│   ├── player.ts
│   ├── game.ts
│   ├── rotation.ts
│   └── api.ts
└── constants/
    ├── colors.ts
    ├── strings.ts
    ├── dimensions.ts
    └── config.ts
```

## 🧭 Navigation Architecture

### Navigation Structure
```typescript
// Main App Navigation
Stack Navigator (Auth Check)
├── Auth Stack
│   ├── Login Screen
│   ├── Register Screen
│   └── Forgot Password Screen
└── Main App (Tab Navigator)
    ├── Sessions Tab
    │   └── Stack Navigator
    │       ├── Session List
    │       ├── Session Detail
    │       ├── Create Session
    │       └── Edit Session
    ├── Rotation Tab
    │   └── Stack Navigator
    │       ├── Rotation Screen
    │       ├── Manual Rotation
    │       └── Rotation History
    ├── Pairing Tab
    │   └── Stack Navigator
    │       ├── Pairing Screen
    │       ├── Drag-Drop Pairing
    │       └── Auto Pairing
    ├── Games Tab
    │   └── Stack Navigator
    │       ├── Score Recording
    │       ├── Game History
    │       └── Game Detail
    └── Profile Tab
        └── Stack Navigator
            ├── Profile
            ├── Statistics
            ├── Settings
            ├── Share Session
            └── QR Code
```

### Navigation Service
```typescript
// NavigationService.ts
class NavigationService {
  static navigate(routeName: string, params?: any): void;
  static goBack(): void;
  static reset(routeName: string): void;
  static getCurrentRoute(): string;
}
```

## 🎨 UI/UX Design

### Design System
- **Colors**: Material Design 3.0 color system
- **Typography**: Custom font hierarchy
- **Icons**: Material Design Icons + Custom sports icons
- **Spacing**: 4px grid system (4, 8, 12, 16, 20, 24, 32, 40, 48, 56, 64)

### Key Screens Design

#### 1. Session List Screen
```
┌─────────────────────────────────┐
│           Header                │
│  Sessions               + New   │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ 🏸 北京-8/22-14:00          │ │
│ │ 📍 北京朝阳区羽毛球馆       │ │
│ │ 👥 12/20 players           │ │
│ │ ⏰ 2 hours ago             │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ 🏸 上海-8/23-10:00          │ │
│ │ 📍 上海浦东新区羽毛球馆     │ │
│ │ 👥 8/16 players            │ │
│ │ ⏰ 5 hours ago             │ │
│ └─────────────────────────────┘ │
└─────────────────────────────────┘
```

#### 2. Rotation Screen (Core Feature)
```
┌─────────────────────────────────┐
│        Rotation Queue          │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐ │
│ │ ⚫ 张三 (5 games) ← 下场     │ │
│ │ ⚫ 李四 (4 games)            │ │
│ │ 🔵 王五 (3 games)           │ │
│ │ 🔵 赵六 (3 games)           │ │
│ │ 🟢 孙七 (2 games)           │ │
│ └─────────────────────────────┘ │
├─────────────────────────────────┤
│  Fairness: Excellent (差2局)    │
├─────────────────────────────────┤
│  [手动轮换] [自动配对]         │
└─────────────────────────────────┘
```

#### 3. Drag-Drop Pairing Screen
```
┌─────────────────────────────────┐
│         Court 1                │
├─────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐       │
│ │ 张三    │ │ 李四    │       │
│ │ 5 games │ │ 4 games │       │
│ └─────────┘ └─────────┘       │
├─────────────────────────────────┤
│         Court 2                │
├─────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐       │
│ │ 王五    │ │ 赵六    │       │
│ │ 3 games │ │ 3 games │       │
│ └─────────┘ └─────────┘       │
└─────────────────────────────────┘
```

## 📊 State Management

### Redux Store Structure
```typescript
// Root State
interface RootState {
  auth: AuthState;
  sessions: SessionsState;
  rotation: RotationState;
  players: PlayersState;
  games: GamesState;
  ui: UIState;
  offline: OfflineState;
}

// Example Slices
interface AuthState {
  user: User | null;
  tokens: Tokens | null;
  isLoading: boolean;
  error: string | null;
}

interface RotationState {
  currentSessionId: string | null;
  queue: Player[];
  fairness: FairnessMetrics;
  isLoading: boolean;
  error: string | null;
}
```

### Key Redux Actions
```typescript
// Auth Actions
login(credentials: LoginCredentials)
logout()
refreshToken()

// Session Actions
fetchSessions()
createSession(sessionData)
joinSession(sessionId)
leaveSession(sessionId)

// Rotation Actions
fetchRotationQueue(sessionId)
triggerRotation(sessionId)
manualRotation(sessionId, adjustments)
updatePlayerStatus(playerId, status)

// Game Actions
recordGame(sessionId, gameData)
fetchGames(sessionId)
updateGame(gameId, updates)
```

## 🔄 Real-time Synchronization

### Socket.io Integration
```typescript
// SocketService.ts
class SocketService {
  private socket: Socket;

  connect(sessionId: string): void {
    this.socket = io(SERVER_URL);
    this.socket.emit('join-session', sessionId);
  }

  // Event listeners
  onRotationUpdate(callback: (data: any) => void): void {
    this.socket.on('rotation-updated', callback);
  }

  onPlayerJoined(callback: (player: Player) => void): void {
    this.socket.on('player-joined', callback);
  }

  onScoreRecorded(callback: (game: Game) => void): void {
    this.socket.on('score-recorded', callback);
  }

  // Event emitters
  updatePlayerStatus(playerId: string, status: PlayerStatus): void {
    this.socket.emit('player-status-update', { playerId, status });
  }

  requestRest(sessionId: string, duration: number): void {
    this.socket.emit('rest-request', { sessionId, duration });
  }
}
```

### Sync Manager
```typescript
// SyncManager.ts
class SyncManager {
  private syncQueue: SyncOperation[] = [];
  private isOnline: boolean = true;

  // Queue operations when offline
  queueOperation(operation: SyncOperation): void {
    if (this.isOnline) {
      this.executeOperation(operation);
    } else {
      this.syncQueue.push(operation);
    }
  }

  // Process queued operations when back online
  processQueue(): void {
    while (this.syncQueue.length > 0) {
      const operation = this.syncQueue.shift();
      if (operation) {
        this.executeOperation(operation);
      }
    }
  }
}
```

## 💾 Offline Support

### Offline-First Architecture
1. **Local Storage**: Redux Persist with AsyncStorage
2. **Optimistic Updates**: Immediate UI updates
3. **Conflict Resolution**: Timestamp-based resolution
4. **Background Sync**: When connection restored

### Storage Strategy
```typescript
// AsyncStorageService.ts
class AsyncStorageService {
  // Session data
  static async saveSession(session: Session): Promise<void>;
  static async getSession(sessionId: string): Promise<Session | null>;
  static async getAllSessions(): Promise<Session[]>;

  // Offline queue
  static async queueOperation(operation: SyncOperation): Promise<void>;
  static async getQueuedOperations(): Promise<SyncOperation[]>;
  static async clearQueuedOperation(id: string): Promise<void>;
}
```

## 🔧 API Integration Layer

### API Client
```typescript
// apiClient.ts
class ApiClient {
  private baseURL: string;
  private tokens: Tokens | null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
  }

  // Authentication
  async login(credentials: LoginCredentials): Promise<AuthResponse>;
  async refreshToken(): Promise<TokenResponse>;

  // Generic request methods
  private async request<T>(
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    endpoint: string,
    data?: any
  ): Promise<ApiResponse<T>>;
}

// Service-specific API calls
// sessionService.ts
export const sessionService = {
  async getSessions(): Promise<Session[]> {
    return ApiClient.request<Session[]>('GET', '/sessions');
  },

  async createSession(sessionData: CreateSessionData): Promise<Session> {
    return ApiClient.request<Session>('POST', '/sessions', sessionData);
  },

  async joinSession(sessionId: string): Promise<void> {
    return ApiClient.request<void>('POST', `/sessions/${sessionId}/join`);
  }
};
```

## 🖱️ Custom Hooks

### Essential Hooks
```typescript
// useAuth.ts
export const useAuth = () => {
  const { user, tokens, isLoading } = useSelector(authSelector);
  const dispatch = useDispatch();

  const login = useCallback(async (credentials: LoginCredentials) => {
    dispatch(loginStart());
    try {
      const response = await authService.login(credentials);
      dispatch(loginSuccess(response));
    } catch (error) {
      dispatch(loginFailure(error.message));
    }
  }, [dispatch]);

  return { user, tokens, isLoading, login, logout };
};

// useRotation.ts
export const useRotation = (sessionId: string) => {
  const rotation = useSelector(rotationSelector);
  const dispatch = useDispatch();

  useEffect(() => {
    dispatch(fetchRotationQueue(sessionId));
  }, [sessionId, dispatch]);

  const triggerRotation = useCallback(() => {
    dispatch(triggerRotationAction(sessionId));
  }, [sessionId, dispatch]);

  return {
    queue: rotation.queue,
    fairness: rotation.fairness,
    triggerRotation,
    isLoading: rotation.isLoading
  };
};
```

## 📱 Platform-Specific Features

### iOS-Specific
- **Face ID/Touch ID**: Biometric authentication
- **Haptic Feedback**: Enhanced user feedback
- **App Clips**: Quick session joining
- **Share Extension**: Share session from other apps

### Android-Specific
- **Material You**: Dynamic theming
- **App Shortcuts**: Quick actions
- **Notification Channels**: Organized notifications
- **Picture-in-Picture**: Continue using app while recording scores

### Web-Specific (React Native Web)
- **PWA Features**: Install as app, offline support
- **Deep Linking**: URL-based navigation
- **Responsive Design**: Adaptive layouts
- **Browser Notifications**: Web notification API

## 🧪 Testing Strategy

### Test Structure
```
__tests__/
├── components/
│   ├── Button.test.tsx
│   ├── SessionCard.test.tsx
│   └── RotationQueue.test.tsx
├── screens/
│   ├── LoginScreen.test.tsx
│   ├── SessionListScreen.test.tsx
│   └── RotationScreen.test.tsx
├── services/
│   ├── api.test.ts
│   ├── socket.test.ts
│   └── storage.test.ts
├── utils/
│   ├── validation.test.ts
│   ├── calculations.test.ts
│   └── formatting.test.ts
└── integration/
    ├── authFlow.test.ts
    ├── rotationFlow.test.ts
    └── offlineSync.test.ts
```

### Testing Libraries
- **Unit Tests**: Jest + React Native Testing Library
- **Integration Tests**: React Native Testing Library + MSW (API mocking)
- **E2E Tests**: Detox (iOS/Android), Cypress (Web)

## 📈 Performance Optimization

### Code Splitting
```typescript
// Lazy loading screens
const SessionListScreen = lazy(() => import('./screens/SessionListScreen'));
const RotationScreen = lazy(() => import('./screens/RotationScreen'));

// Component lazy loading
const RotationQueue = lazy(() => import('./components/RotationQueue'));
```

### Image Optimization
- **Image Compression**: Automatic resizing and compression
- **Lazy Loading**: Load images on demand
- **Caching**: Cache images with React Native Fast Image
- **WebP Support**: Modern image format for better performance

### Memory Management
- **Component Cleanup**: Proper useEffect cleanup
- **Image Cleanup**: Clear image cache when needed
- **Redux State**: Selective state updates
- **List Virtualization**: For long player lists

## 🔐 Security

### Data Security
- **Secure Storage**: Sensitive data in Keychain (iOS) / Keystore (Android)
- **Certificate Pinning**: Prevent man-in-the-middle attacks
- **Data Encryption**: Encrypt sensitive data at rest
- **Token Security**: Secure token storage and automatic refresh

### Code Security
- **Code Obfuscation**: JavaScript code protection
- **Reverse Engineering Protection**: Basic anti-tampering measures
- **SSL Pinning**: Certificate validation
- **Input Validation**: Client-side and server-side validation

This frontend design provides a comprehensive blueprint for building a high-quality, cross-platform badminton pairing management application that meets all the requirements specified in the PRD while ensuring excellent user experience, performance, and maintainability.