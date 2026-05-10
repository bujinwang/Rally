import { useSelector } from 'react-redux';
import { useAppDispatch } from '../store';
import { loginUser, registerUser, logout, clearError } from '../store/slices/authSlice';
import { RootState } from '../store';

export const useAuth = () => {
  const dispatch = useAppDispatch();
  const { user, tokens, isLoading, isAuthenticated, error } = useSelector(
    (state: RootState) => state.auth
  );

  const login = async (email: string, password: string, deviceId?: string) => {
    try {
      await dispatch(loginUser({ email, password, deviceId })).unwrap();
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  };

  const register = async (userData: {
    name: string;
    email: string;
    password: string;
    phone?: string;
  }) => {
    try {
      await dispatch(registerUser(userData)).unwrap();
      return { success: true };
    } catch (error) {
      return { success: false, error };
    }
  };

  const signOut = () => {
    dispatch(logout());
  };

  const clearAuthError = () => {
    dispatch(clearError());
  };

  return {
    user,
    tokens,
    isLoading,
    isAuthenticated,
    error,
    login,
    register,
    signOut,
    clearAuthError,
  };
};