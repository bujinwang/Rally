import { configureStore, combineReducers } from '@reduxjs/toolkit';
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';
import {
  persistStore,
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import reducers
import authReducer from './slices/authSlice';
import sessionReducer from './slices/sessionSlice';
import rotationReducer from './slices/rotationSlice';
import playerReducer from './slices/playerSlice';
import uiReducer from './slices/uiSlice';
import realTimeReducer from './slices/realTimeSlice';
import syncReducer from './slices/syncSlice';
import { setSyncDispatch } from '../services/syncManager';

const rootReducer = combineReducers({
  auth: authReducer,
  sessions: sessionReducer,
  rotation: rotationReducer,
  players: playerReducer,
  ui: uiReducer,
  realTime: realTimeReducer,
  sync: syncReducer,
});

// Only the auth slice is persisted so the session survives app restarts.
// Other slices hold transient/socket state that must not be rehydrated.
//
// `sync` (Story 6.5) is deliberately NOT whitelisted: it is ephemeral
// offline/sync UI status that is re-derived from the queue at startup.
// Persisting it would risk rehydrating half-applied optimistic state on a cold
// start, so `whitelist` stays exactly `['auth']`.
const persistConfig = {
  key: 'root',
  version: 1,
  storage: AsyncStorage,
  whitelist: ['auth'],
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);

// Give `SyncManager` a way to push conflict records and the `'offline-replay'`
// freshness signal into the store. Registered here (not imported inside
// `syncManager.ts`) so the service never imports the store, avoiding a cycle.
// The dispatch target is bound to `store.dispatch` by reference, so it always
// works even after the module graph is fully initialised.
setSyncDispatch((action) => store.dispatch(action as never));

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Use throughout your app instead of plain `useDispatch` and `useSelector`
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector = <TSelected>(selector: (state: RootState) => TSelected): TSelected =>
  useSelector<RootState, TSelected>(selector);