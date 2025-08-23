import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { apiService } from '../../services/apiService';

// Types
interface User {
  id: string;
  name: string;
  email: string | null;
  role: 'OWNER' | 'PLAYER';
}

interface Tokens {
  accessToken: string;
  refreshToken: string;
}

interface AuthState {
  user: User | null;
  tokens: Tokens | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  error: string | null;
}

// Initial state
const initialState: AuthState = {
  user: null,
  tokens: null,
  isLoading: false,
  isAuthenticated: false,
  error: null,
};

// Async thunks
export const loginUser = createAsyncThunk(
  'auth/login',
   async (credentials: { email: string; password: string; deviceId?: string }, { rejectWithValue }) => {
    try {
      const response = await apiService.login(credentials);

      if (!response.success) {
        return rejectWithValue(response.error?.message || 'Login failed');
      }

      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Login failed');
    }
  }
);

export const registerUser = createAsyncThunk(
  'auth/register',
   async (userData: { name: string; email: string; password: string; phone?: string }, { rejectWithValue }) => {
    try {
      const response = await apiService.register(userData);

      if (!response.success) {
        return rejectWithValue(response.error?.message || 'Registration failed');
      }

      return response.data;
    } catch (error: any) {
      return rejectWithValue(error.message || 'Registration failed');
    }
  }
);

export const refreshToken = createAsyncThunk(
  'auth/refreshToken',
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: AuthState };
      const refreshToken = state.auth.tokens?.refreshToken;

      if (!refreshToken) {
        throw new Error('No refresh token available');
      }

      const response = await fetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      return await response.json();
    } catch (error: any) {
      return rejectWithValue(error.message);
    }
  }
);

// Slice
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    logout: (state) => {
      state.user = null;
      state.tokens = null;
      state.isAuthenticated = false;
      state.error = null;
      // Clear stored tokens
      AsyncStorage.removeItem('accessToken');
      AsyncStorage.removeItem('refreshToken');
    },
    clearError: (state) => {
      state.error = null;
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
  },
  extraReducers: (builder) => {
    // Login
    builder
      .addCase(loginUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(loginUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload?.user;
        state.tokens = action.payload?.tokens;
        state.isAuthenticated = true;
        state.error = null;

        // Store tokens
        if (action.payload?.tokens) {
          AsyncStorage.setItem('accessToken', action.payload.tokens.accessToken);
          AsyncStorage.setItem('refreshToken', action.payload.tokens.refreshToken);
        }
      })
      .addCase(loginUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Register
    builder
      .addCase(registerUser.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(registerUser.fulfilled, (state, action) => {
        state.isLoading = false;
        state.user = action.payload?.user;
        state.tokens = action.payload?.tokens;
        state.isAuthenticated = true;
        state.error = null;

        // Store tokens
        if (action.payload?.tokens) {
          AsyncStorage.setItem('accessToken', action.payload.tokens.accessToken);
          AsyncStorage.setItem('refreshToken', action.payload.tokens.refreshToken);
        }
      })
      .addCase(registerUser.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });

    // Refresh token
    builder
      .addCase(refreshToken.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(refreshToken.fulfilled, (state, action) => {
        state.isLoading = false;
        state.tokens = action.payload.data.tokens;
        state.error = null;

        // Update stored tokens
        AsyncStorage.setItem('accessToken', action.payload.data.tokens.accessToken);
        AsyncStorage.setItem('refreshToken', action.payload.data.tokens.refreshToken);
      })
      .addCase(refreshToken.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        // If refresh fails, logout user
        state.user = null;
        state.tokens = null;
        state.isAuthenticated = false;
        AsyncStorage.removeItem('accessToken');
        AsyncStorage.removeItem('refreshToken');
      });
  },
});

export const { logout, clearError, setLoading } = authSlice.actions;
export default authSlice.reducer;