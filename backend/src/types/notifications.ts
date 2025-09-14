export enum NotificationType {
  MATCH_RESULT = 'MATCH_RESULT',
  ACHIEVEMENT_UNLOCK = 'ACHIEVEMENT_UNLOCK',
  FRIEND_REQUEST = 'FRIEND_REQUEST',
  FRIEND_ACCEPTED = 'FRIEND_ACCEPTED',
  CHALLENGE_RECEIVED = 'CHALLENGE_RECEIVED',
  CHALLENGE_RESPONSE = 'CHALLENGE_RESPONSE',
  TOURNAMENT_UPDATE = 'TOURNAMENT_UPDATE',
  SESSION_REMINDER = 'SESSION_REMINDER',
  SOCIAL_MESSAGE = 'SOCIAL_MESSAGE',
  SYSTEM_ANNOUNCEMENT = 'SYSTEM_ANNOUNCEMENT'
}

export enum NotificationCategory {
  MATCHES = 'MATCHES',
  ACHIEVEMENTS = 'ACHIEVEMENTS',
  SOCIAL = 'SOCIAL',
  TOURNAMENTS = 'TOURNAMENTS',
  SESSIONS = 'SESSIONS',
  SYSTEM = 'SYSTEM'
}

export interface NotificationData {
  title: string;
  body: string;
  data?: any;
  type: NotificationType;
  category: NotificationCategory;
}

export interface PushTokenData {
  token: string;
  platform: string;
  deviceId?: string;
}

export interface NotificationPreferences {
  matchResults: boolean;
  achievements: boolean;
  friendRequests: boolean;
  challenges: boolean;
  tournamentUpdates: boolean;
  socialMessages: boolean;
  sessionReminders: boolean;
  pushEnabled: boolean;
  emailEnabled: boolean;
  quietHoursStart?: string;
  quietHoursEnd?: string;
}

export interface NotificationRecord {
  id: string;
  playerId: string;
  title: string;
  body: string;
  data?: any;
  type: NotificationType;
  category: NotificationCategory;
  isRead: boolean;
  readAt?: Date;
  deliveredAt?: Date;
  sentAt: Date;
}