import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Player {
  id: string;
  name: string;
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
  gamesPlayed: number;
  wins: number;
  losses: number;
}

interface RotationState {
  queue: Player[];
  currentSessionId: string | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: RotationState = {
  queue: [],
  currentSessionId: null,
  isLoading: false,
  error: null,
};

const rotationSlice = createSlice({
  name: 'rotation',
  initialState,
  reducers: {
    setRotationQueue: (state, action: PayloadAction<Player[]>) => {
      state.queue = action.payload;
    },
    setCurrentSession: (state, action: PayloadAction<string>) => {
      state.currentSessionId = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const { setRotationQueue, setCurrentSession, setLoading, setError } = rotationSlice.actions;
export default rotationSlice.reducer;