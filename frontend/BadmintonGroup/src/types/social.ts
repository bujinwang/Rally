// Social Features Types

// Friend System Types
export interface Friend {
  id: string;
  playerId: string;
  friendId: string;
  status: FriendStatus;
  requestedAt: Date;
  acceptedAt?: Date;
}

export interface FriendRequest {
  id: string;
  senderId: string;
  receiverId: string;
  message?: string;
  status: FriendRequestStatus;
  sentAt: Date;
  respondedAt?: Date;
  sender: {
    id: string;
    name: string;
  };
  receiver: {
    id: string;
    name: string;
  };
}

export interface FriendWithDetails {
  id: string;
  friendId: string;
  friendName: string;
  sessionId?: string;
  friendshipSince?: Date;
}

export interface BlockedUser {
  id: string;
  userId: string;
  userName: string;
  blockedAt?: Date;
}

export interface FriendStats {
  friendsCount: number;
  pendingRequestsCount: number;
  sentRequestsCount: number;
}

// Challenge System Types
export interface Challenge {
  id: string;
  challengerId: string;
  challengedId: string;
  challengeType: ChallengeType;
  message?: string;
  sessionId?: string;
  matchFormat: string;
  scoringSystem: string;
  bestOfGames: number;
  status: ChallengeStatus;
  sentAt: Date;
  respondedAt?: Date;
  scheduledAt?: Date;
  challenger: {
    id: string;
    name: string;
  };
  challenged: {
    id: string;
    name: string;
  };
}

export interface ChallengeData {
  challengedId: string;
  challengeType?: ChallengeType;
  message?: string;
  sessionId?: string;
  matchFormat?: string;
  scoringSystem?: string;
  bestOfGames?: number;
  scheduledAt?: Date;
}

export interface ChallengeResponse {
  challengeId: string;
  challengerId: string;
  challengedId: string;
  status: string;
  message?: string;
}

export interface ChallengeStats {
  sentCount: number;
  receivedCount: number;
  acceptedCount: number;
  completedCount: number;
}

// Messaging System Types
export interface MessageThread {
  id: string;
  participants: string[];
  title?: string;
  lastMessageAt: Date;
  lastMessage?: {
    content: string;
    sentAt: Date;
    senderName: string;
  };
}

export interface Message {
  id: string;
  threadId: string;
  senderId: string;
  content: string;
  messageType: MessageType;
  sentAt: Date;
  isRead: boolean;
  readAt?: Date;
  sender: {
    id: string;
    name: string;
  };
}

export interface MessageData {
  threadId: string;
  content: string;
  messageType?: MessageType;
}

export interface ThreadData {
  participants: string[];
  title?: string;
}

// Enums
export enum FriendStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  BLOCKED = 'BLOCKED'
}

export enum FriendRequestStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  CANCELLED = 'CANCELLED'
}

export enum ChallengeType {
  MATCH = 'MATCH',
  TOURNAMENT = 'TOURNAMENT',
  PRACTICE = 'PRACTICE',
  FRIENDLY = 'FRIENDLY'
}

export enum ChallengeStatus {
  PENDING = 'PENDING',
  ACCEPTED = 'ACCEPTED',
  DECLINED = 'DECLINED',
  CANCELLED = 'CANCELLED',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED'
}

export enum MessageType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  SYSTEM = 'SYSTEM',
  CHALLENGE = 'CHALLENGE'
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  count?: number;
}

export interface FriendApiResponse extends ApiResponse<FriendWithDetails[]> {
  count: number;
}

export interface FriendRequestApiResponse extends ApiResponse<FriendRequest[]> {
  count: number;
}

export interface ChallengeApiResponse extends ApiResponse<Challenge[]> {
  count: number;
}

export interface MessageApiResponse extends ApiResponse<Message[]> {
  count: number;
}

export interface ThreadApiResponse extends ApiResponse<MessageThread[]> {
  count: number;
}

// Form Types
export interface SendFriendRequestForm {
  receiverId: string;
  message?: string;
}

export interface RespondToFriendRequestForm {
  requestId: string;
  accept: boolean;
}

export interface CreateChallengeForm {
  challengedId: string;
  challengeType?: ChallengeType;
  message?: string;
  sessionId?: string;
  matchFormat?: string;
  scoringSystem?: string;
  bestOfGames?: number;
  scheduledAt?: Date;
}

export interface RespondToChallengeForm {
  challengeId: string;
  accept: boolean;
}

export interface CreateThreadForm {
  participants: string[];
  title?: string;
}

export interface SendMessageForm {
  threadId: string;
  content: string;
  messageType?: MessageType;
}

// Search and Filter Types
export interface FriendSearchFilters {
  name?: string;
  status?: FriendStatus;
}

export interface ChallengeFilters {
  type?: ChallengeType;
  status?: ChallengeStatus;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

export interface MessageSearchFilters {
  query: string;
  threadId?: string;
  dateRange?: {
    start: Date;
    end: Date;
  };
}

// Notification Types
export interface SocialNotification {
  id: string;
  type: 'friend_request' | 'challenge' | 'message';
  title: string;
  message: string;
  data: any;
  createdAt: Date;
  isRead: boolean;
}

// Statistics Types
export interface SocialStats {
  friends: FriendStats;
  challenges: ChallengeStats;
  messages: {
    totalThreads: number;
    unreadCount: number;
  };
}