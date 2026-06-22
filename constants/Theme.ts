/** Premium UI tokens for the booking flow. */
export const DarkAppTheme = {
  bg: '#0B0F14',
  bgElevated: '#111827',
  card: '#151C28',
  cardHover: '#1A2332',
  border: '#243044',
  accent: '#3B82F6',
  accentSoft: 'rgba(59, 130, 246, 0.15)',
  warm: '#F59E0B',
  warmSoft: 'rgba(245, 158, 11, 0.15)',
  green: '#22C55E',
  greenSoft: 'rgba(34, 197, 94, 0.15)',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  textDim: '#64748B',
  danger: '#EF4444',
  white: '#FFFFFF',
};

export const LightAppTheme = {
  bg: '#F8FAFC',
  bgElevated: '#FFFFFF',
  card: '#FFFFFF',
  cardHover: '#EEF2FF',
  border: '#CBD5E1',
  accent: '#2563EB',
  accentSoft: 'rgba(37, 99, 235, 0.12)',
  warm: '#D97706',
  warmSoft: 'rgba(217, 119, 6, 0.12)',
  green: '#16A34A',
  greenSoft: 'rgba(22, 163, 74, 0.12)',
  text: '#0F172A',
  textMuted: '#475569',
  textDim: '#64748B',
  danger: '#DC2626',
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
  winch: '#EC4899',
} as const;
