/**
 * Color design tokens for VSWM UI.
 *
 * Five token groups:
 *   background — page/surface/card/elevated layers
 *   brand      — primary red accent and variants
 *   semantic   — success, warning, error, info states
 *   text       — default, dim, and inverted text
 *   border     — default and subtle borders
 *
 * `as const` ensures literal type inference so invalid
 * token references produce a compile-time error (Requirements 1.7, 1.8).
 */
export const colors = {
  background: {
    base:     '#0F172A', // Requirement 3.1
    surface:  '#111827', // Requirement 3.2
    card:     '#1E293B', // Requirement 3.3
    elevated: '#243244', // Requirement 3.4
  },
  brand: {
    primary:      '#DC2626', // Requirement 3.5
    primaryHover: '#B91C1C', // Requirement 3.6
    primaryLight: '#FEE2E2', // Requirement 3.7
  },
  semantic: {
    success: '#16A34A', // Requirement 3.8
    warning: '#F59E0B', // Requirement 3.9
    error:   '#EF4444', // Requirement 3.10
    info:    '#06B6D4',
  },
  text: {
    default:  '#F8FAFC',
    dim:      '#94A3B8',
    inverted: '#0F172A',
  },
  border: {
    default: '#1E293B',
    subtle:  '#243244',
  },
} as const;

export type Colors = typeof colors;
