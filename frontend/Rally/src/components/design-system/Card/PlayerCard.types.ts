export interface Player {
  id: string;
  name: string;
  gamesPlayed: number;
  status: 'ACTIVE' | 'RESTING' | 'LEFT' | 'confirmed' | 'pending' | 'active' | 'waiting';
  role?: 'ORGANIZER' | 'PLAYER';
  isOrganizer?: boolean;
  joinedAt?: Date;
  restExpiresAt?: string;
  statusRequestedAt?: string;
  deviceId?: string;
  requestedAction?: 'rest' | 'leave';
}

export interface PlayerCardProps {
  player: Player;
  variant?: 'active' | 'waiting' | 'confirmed';
  onActionPress?: (player: Player) => void;
  showActionButton?: boolean;
  disabled?: boolean;
}

export type PlayerCardVariant = 'active' | 'waiting' | 'confirmed';