export interface SessionData {
  id: string;
  title: string;
  date: string;
  time: string;
  location: {
    name: string;
    address?: string;
  };
  shareCode: string;
  organizerId: string;
  organizerName: string;
  maxPlayers: number;
  status: 'upcoming' | 'active' | 'completed';
}

export interface SessionHeaderProps {
  session: SessionData;
  isEditable?: boolean;
  onEdit?: () => void;
}