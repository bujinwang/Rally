import { createSlice, PayloadAction } from '@reduxjs/toolkit';

interface UIState {
  isLoading: boolean;
  theme: 'light' | 'dark';
  language: 'en' | 'zh';
  sidebarOpen: boolean;
  modalOpen: boolean;
  modalType: string | null;
  toast: {
    visible: boolean;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
  };
}

const initialState: UIState = {
  isLoading: false,
  theme: 'light',
  language: 'en',
  sidebarOpen: false,
  modalOpen: false,
  modalType: null,
  toast: {
    visible: false,
    message: '',
    type: 'info',
  },
};

const uiSlice = createSlice({
  name: 'ui',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setTheme: (state, action: PayloadAction<'light' | 'dark'>) => {
      state.theme = action.payload;
    },
    setLanguage: (state, action: PayloadAction<'en' | 'zh'>) => {
      state.language = action.payload;
    },
    setSidebarOpen: (state, action: PayloadAction<boolean>) => {
      state.sidebarOpen = action.payload;
    },
    setModalOpen: (state, action: PayloadAction<{ open: boolean; type?: string | null }>) => {
      state.modalOpen = action.payload.open;
      state.modalType = action.payload.type || null;
    },
    showToast: (state, action: PayloadAction<{ message: string; type?: 'success' | 'error' | 'info' | 'warning' }>) => {
      state.toast = {
        visible: true,
        message: action.payload.message,
        type: action.payload.type || 'info',
      };
    },
    hideToast: (state) => {
      state.toast.visible = false;
    },
  },
});

export const {
  setLoading,
  setTheme,
  setLanguage,
  setSidebarOpen,
  setModalOpen,
  showToast,
  hideToast,
} = uiSlice.actions;

export default uiSlice.reducer;