import { FullTheme } from 'react-native-elements';

// BadmintonGroup Design System Theme
// Based on the UI/UX specification with card-based design
export const badmintonTheme: Partial<FullTheme> = {
  colors: {
    // Primary colors from specification
    primary: '#6366F1',     // Main actions, active states
    secondary: '#10B981',   // Success states, confirmed players
    success: '#22C55E',     // Confirmed actions, "上场" buttons
    warning: '#F97316',     // Status changes, "下场" buttons
    error: '#EF4444',       // Errors, cancellations
    
    // Text colors
    text: '#1E293B',        // Primary text, player names
    grey0: '#1E293B',       // Primary text (RNE compatibility)
    grey1: '#64748B',       // Secondary text, status info
    grey2: '#94A3B8',       // Tertiary text
    grey3: '#CBD5E1',       // Disabled text
    grey4: '#E2E8F0',       // Border color
    grey5: '#F1F5F9',       // Light backgrounds
    
    // Surface colors
    background: '#FFFFFF',   // Main background
    surface: '#F8FAFC',     // Card backgrounds
    disabled: '#F1F5F9',    // Disabled states
    
    // Status-specific backgrounds (matching visual design)
    activeBackground: '#DCFCE7',   // Light green for active players
    waitingBackground: '#FEF3C7',  // Light orange for waiting players
  },
  
  // Button theme overrides
  Button: {
    borderRadius: 6,
    paddingHorizontal: 20,
    height: 44, // Minimum touch target from spec
    titleStyle: {
      fontSize: 14,
      fontWeight: '500',
    },
  },
  
  // Card theme overrides  
  Card: {
    borderRadius: 4,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  
  // Text theme
  Text: {
    style: {
      fontSize: 16,
      color: '#1E293B',
      fontFamily: 'System', // Will use SF Pro on iOS, Roboto on Android
    },
    h1Style: {
      fontSize: 24,
      fontWeight: '700',
      color: '#1E293B',
    },
    h2Style: {
      fontSize: 20,
      fontWeight: '600', 
      color: '#1E293B',
    },
    h3Style: {
      fontSize: 18,
      fontWeight: '600',
      color: '#1E293B',
    },
  },
  
  // Input theme
  Input: {
    inputStyle: {
      fontSize: 16,
      color: '#1E293B',
    },
    labelStyle: {
      fontSize: 14,
      color: '#64748B',
      fontWeight: '500',
    },
  },
};

// Color constants for easy access throughout the app
export const colors = {
  primary: '#6366F1',
  secondary: '#10B981', 
  success: '#22C55E',
  warning: '#F97316',
  error: '#EF4444',
  text: '#1E293B',
  textSecondary: '#64748B',
  surface: '#F8FAFC',
  border: '#E2E8F0',
  activeBackground: '#DCFCE7',
  waitingBackground: '#FEF3C7',
} as const;

// Typography scale
export const typography = {
  playerName: {
    fontSize: 16,
    fontWeight: '600' as const,
    color: '#1E293B',
    lineHeight: 22,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '400' as const,
    color: '#64748B',
    lineHeight: 20,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '500' as const,
    color: '#FFFFFF',
  },
  sessionTitle: {
    fontSize: 24,
    fontWeight: '700' as const,
    color: '#1E293B',
    lineHeight: 28,
  },
} as const;

// Common spacing values (8px base system from spec)
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export default badmintonTheme;