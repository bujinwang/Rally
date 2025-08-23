import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';

// Import reducers
import authReducer from './slices/authSlice';
import sessionReducer from './slices/sessionSlice';
import rotationReducer from './slices/rotationSlice';
import playerReducer from './slices/playerSlice';
import uiReducer from './slices/uiSlice';
import realTimeReducer from './slices/realTimeSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    sessions: sessionReducer,
    rotation: rotationReducer,
    players: playerReducer,
    ui: uiReducer,
    realTime: realTimeReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Use throughout your app instead of plain `useDispatch` and `useSelector`
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = <TSelected>(selector: (state: RootState) => TSelected): TSelected =>
  useSelector<TSelected>(selector);

// For now, we'll skip persistence to avoid complex setup
export const persistor = null;