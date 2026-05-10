import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Session {
  id: string;
  name: string;
  scheduledAt: string;
  location?: string;
  maxPlayers: number;
  skillLevel?: string;
  cost?: number;
  status: 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  owner: {
    id: string;
    name: string;
    email?: string;
  };
  playerCount: number;
  isOwner: boolean;
}

interface SessionState {
  sessions: Session[];
  currentSession: Session | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: SessionState = {
  sessions: [],
  currentSession: null,
  isLoading: false,
  error: null,
};

const sessionSlice = createSlice({
  name: 'sessions',
  initialState,
  reducers: {
    setSessions: (state, action: PayloadAction<Session[]>) => {
      state.sessions = action.payload;
    },
    setCurrentSession: (state, action: PayloadAction<Session | null>) => {
      state.currentSession = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const { setSessions, setCurrentSession, setLoading, setError } = sessionSlice.actions;
export default sessionSlice.reducer;