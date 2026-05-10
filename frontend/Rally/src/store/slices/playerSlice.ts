import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface Player {
  id: string;
  name: string;
  email?: string;
  status: 'ACTIVE' | 'RESTING' | 'LEFT';
  gamesPlayed: number;
  wins: number;
  losses: number;
  joinedAt: string;
}

interface PlayerState {
  players: Player[];
  currentPlayer: Player | null;
  isLoading: boolean;
  error: string | null;
}

const initialState: PlayerState = {
  players: [],
  currentPlayer: null,
  isLoading: false,
  error: null,
};

const playerSlice = createSlice({
  name: 'players',
  initialState,
  reducers: {
    setPlayers: (state, action: PayloadAction<Player[]>) => {
      state.players = action.payload;
    },
    setCurrentPlayer: (state, action: PayloadAction<Player | null>) => {
      state.currentPlayer = action.payload;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
  },
});

export const { setPlayers, setCurrentPlayer, setLoading, setError } = playerSlice.actions;
export default playerSlice.reducer;