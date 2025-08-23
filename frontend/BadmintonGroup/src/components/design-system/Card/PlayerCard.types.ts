export interface Player {
  id: string;
  name: string;
  gamesPlayed: number;
  status: 'confirmed' | 'pending' | 'active' | 'waiting';
  isOrganizer?: boolean;
  joinedAt?: Date;
}

export interface PlayerCardProps {
  player: Player;
  variant?: 'active' | 'waiting' | 'confirmed';
  onActionPress?: (player: Player) => void;
  showActionButton?: boolean;
  disabled?: boolean;
}

export type PlayerCardVariant = 'active' | 'waiting' | 'confirmed';