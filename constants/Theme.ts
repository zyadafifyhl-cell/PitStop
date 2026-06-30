/** Premium UI tokens for the booking flow. */
export const DarkAppTheme = {
  bg: '#050505',
  bgElevated: '#0B0B0B',
  card: '#101010',
  cardHover: '#181818',
  border: '#2A2A2A',
  accent: '#FFFFFF',
  accentSoft: 'rgba(255, 255, 255, 0.10)',
  onAccent: '#050505',
  warm: '#E5E5E5',
  warmSoft: 'rgba(255, 255, 255, 0.08)',
  green: '#FFFFFF',
  greenSoft: 'rgba(255, 255, 255, 0.08)',
  text: '#FFFFFF',
  textMuted: '#C7C7C7',
  textDim: '#8A8A8A',
  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.14)',
  success: '#22C55E',
  successSoft: 'rgba(34, 197, 94, 0.14)',
  white: '#FFFFFF',
};

export const LightAppTheme = {
  bg: '#FFFFFF',
  bgElevated: '#FFFFFF',
  card: '#FFFFFF',
  cardHover: '#F4F4F4',
  border: '#D7D7D7',
  accent: '#050505',
  accentSoft: 'rgba(0, 0, 0, 0.08)',
  onAccent: '#FFFFFF',
  warm: '#222222',
  warmSoft: 'rgba(0, 0, 0, 0.06)',
  green: '#050505',
  greenSoft: 'rgba(0, 0, 0, 0.06)',
  text: '#050505',
  textMuted: '#404040',
  textDim: '#737373',
  danger: '#DC2626',
  dangerSoft: 'rgba(220, 38, 38, 0.12)',
  success: '#16A34A',
  successSoft: 'rgba(22, 163, 74, 0.12)',
  white: '#FFFFFF',
};

export type AppThemeTokens = typeof DarkAppTheme;

export const AppTheme = DarkAppTheme;

export const APP_THEMES = {
  dark: DarkAppTheme,
  light: LightAppTheme,
} as const;

export const SERVICE_COLORS = {
  maintenance: DarkAppTheme.accent,
  wash: DarkAppTheme.warm,
  parts: DarkAppTheme.green,
  accessories: DarkAppTheme.warm,
  winch: '#C7C7C7',
} as const;
