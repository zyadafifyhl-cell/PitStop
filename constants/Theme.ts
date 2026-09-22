/** PitStop Electric Cobalt design system. Both preferences use the branded dark canvas. */
export const LightAppTheme = {
  bg: '#0A0E17',
  bgElevated: '#111827',
  card: '#111827',
  cardHover: '#1A2234',
  inputBg: '#161F30',
  inputBorder: '#243048',
  border: 'rgba(255, 255, 255, 0.08)',
  chipBorder: 'rgba(30, 90, 230, 0.30)',
  accent: '#1E5AE6',
  accentHover: '#1646B8',
  accentSoft: 'rgba(30, 90, 230, 0.12)',
  focusRing: 'rgba(30, 90, 230, 0.25)',
  onAccent: '#FFFFFF',
  brand: '#1E5AE6',
  brandSoft: 'rgba(30, 90, 230, 0.12)',
  warm: '#60A5FA',
  warmSoft: 'rgba(96, 165, 250, 0.12)',
  green: '#22C55E',
  greenSoft: 'rgba(34, 197, 94, 0.12)',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  textDim: '#64748B',
  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.10)',
  success: '#22C55E',
  successSoft: 'rgba(34, 197, 94, 0.12)',
  warning: '#F59E0B',
  warningSoft: 'rgba(245, 158, 11, 0.12)',
  premium: '#60A5FA',
  premiumSoft: 'rgba(96, 165, 250, 0.12)',
  gradientLabani: '#1E5AE6',
  gradientYellow: '#1E5AE6',
  overlay: 'rgba(10, 14, 23, 0.76)',
  shadowColor: '#05070C',
  white: '#FFFFFF',
  radiusSm: 8,
  radiusMd: 10,
  radiusLg: 12,
  radiusPill: 999,
  radiusBtn: 9,
  buttonHeight: 48,
};

export const DarkAppTheme: typeof LightAppTheme = {
  ...LightAppTheme,
};

export type AppThemeTokens = typeof LightAppTheme;

export const AppTheme = DarkAppTheme;

export const APP_THEMES = {
  dark: DarkAppTheme,
  light: LightAppTheme,
} as const;

export const SERVICE_COLORS = {
  maintenance: DarkAppTheme.accent,
  wash: DarkAppTheme.warm,
  parts: DarkAppTheme.green,
  accessories: DarkAppTheme.textMuted,
  winch: DarkAppTheme.accent,
} as const;
