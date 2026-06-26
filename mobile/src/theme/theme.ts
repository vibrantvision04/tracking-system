export const theme = {
  colors: {
    primary: '#10B981',        // Emerald
    primaryHover: '#059669',   // Darker emerald (pressed state)
    primaryLight: '#D1FAE5',   // Light emerald (backgrounds)
    background: '#F3F4F6',     // Base gray background
    surface: '#FFFFFF',        // Cards, inputs
    textDark: '#1E293B',       // Primary text
    textDim: '#64748B',        // Secondary text
    border: '#E2E8F0',         // Default borders
    success: '#16A34A',        // Success indicators
    warning: '#F59E0B',        // Warnings, amber
    warningLight: '#FEF3C7',   // Warning backgrounds
    error: '#EF4444',          // Errors
    errorLight: '#FEF2F2',     // Error backgrounds
  },
  typography: {
    fontFamily: undefined,     // System default
    heading: {
      fontSize: 20,
      fontWeight: '600' as const,
      lineHeight: 26,          // 20 * 1.3
    },
    body: {
      fontSize: 16,
      fontWeight: '400' as const,
      lineHeight: 24,          // 16 * 1.5
    },
    secondary: {
      fontSize: 14,
      fontWeight: '400' as const,
      lineHeight: 21,
    },
    caption: {
      fontSize: 12,
      fontWeight: '400' as const,
      lineHeight: 18,
    },
  },
  spacing: {
    xs: 4,
    sm: 8,
    md: 12,
    base: 16,
    lg: 20,
    xl: 24,
    xxl: 32,
  },
  borderRadius: {
    card: 8,
    button: 12,
    input: 12,
    modal: 16,
  },
  sizes: {
    touchTarget: 48,
    buttonHeight: 56,
    inputHeight: 56,
    headerHeight: 56,
    cardMinHeight: 120,
  },
} as const;

export type Theme = typeof theme;
export type ColorToken = keyof typeof theme.colors;
export type SpacingToken = keyof typeof theme.spacing;
export type BorderRadiusToken = keyof typeof theme.borderRadius;
export type SizeToken = keyof typeof theme.sizes;
