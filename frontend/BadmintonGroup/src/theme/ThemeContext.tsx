import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryLight: string;
  success: string;
  danger: string;
  border: string;
  inputBg: string;
  headerBg: string;
  headerText: string;
  cardBg: string;
  cardBorder: string;
  overlay: string;
}

export const lightTheme: ThemeColors = {
  background: '#F5F5F5',
  surface: '#FFFFFF',
  surfaceAlt: '#F8F9FA',
  text: '#333333',
  textSecondary: '#666666',
  textMuted: '#999999',
  primary: '#2196F3',
  primaryLight: '#E3F2FD',
  success: '#4CAF50',
  danger: '#f44336',
  border: '#E0E0E0',
  inputBg: '#FFFFFF',
  headerBg: '#1976D2',
  headerText: '#FFFFFF',
  cardBg: '#FFFFFF',
  cardBorder: '#E0E0E0',
  overlay: 'rgba(0,0,0,0.5)',
};

export const darkTheme: ThemeColors = {
  background: '#121212',
  surface: '#1E1E1E',
  surfaceAlt: '#252525',
  text: '#E0E0E0',
  textSecondary: '#B0B0B0',
  textMuted: '#777777',
  primary: '#64B5F6',
  primaryLight: '#1A3A5C',
  success: '#66BB6A',
  danger: '#EF5350',
  border: '#333333',
  inputBg: '#2A2A2A',
  headerBg: '#0D1B2A',
  headerText: '#E0E0E0',
  cardBg: '#1E1E1E',
  cardBorder: '#333333',
  overlay: 'rgba(0,0,0,0.8)',
};

type ThemeContextType = {
  colors: ThemeColors;
  isDark: boolean;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  colors: lightTheme,
  isDark: false,
  toggleTheme: () => {},
});

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    // Detect system preference
    if (typeof window !== 'undefined' && window.matchMedia) {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      setIsDark(mq.matches);
      const handler = (e: MediaQueryListEvent) => setIsDark(e.matches);
      mq.addEventListener('change', handler);
      return () => mq.removeEventListener('change', handler);
    }
  }, []);

  const toggleTheme = useCallback(() => setIsDark(d => !d), []);

  const colors = isDark ? darkTheme : lightTheme;

  return (
    <ThemeContext.Provider value={{ colors, isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};
