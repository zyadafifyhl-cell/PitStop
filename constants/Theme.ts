/** PitStop light fintech design system — Electric Blue on slate/white. */
export const LightAppTheme = {
  bg: '#F8FAFC',
  bgElevated: '#FFFFFF',
  card: '#FFFFFF',
  cardHover: '#F1F5F9',
  inputBg: '#F8FAFC',
  inputBorder: 'rgba(148, 163, 184, 0.38)',
  border: 'rgba(148, 163, 184, 0.28)',
  chipBorder: 'rgba(0, 102, 255, 0.22)',
  accent: '#0066FF',
  accentHover: '#0052CC',
  accentSoft: 'rgba(0, 102, 255, 0.10)',
  focusRing: 'rgba(0, 102, 255, 0.25)',
  onAccent: '#FFFFFF',
  brand: '#0066FF',
  brandSoft: 'rgba(0, 102, 255, 0.10)',
  warm: '#0369A1',
  warmSoft: '#E0F2FE',
  green: '#047857',
  greenSoft: 'rgba(16, 185, 129, 0.12)',
  text: '#0F172A',
  textMuted: '#64748B',
  textDim: '#94A3B8',
  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.10)',
  success: '#047857',
  successSoft: 'rgba(16, 185, 129, 0.12)',
  warning: '#D97706',
  warningSoft: 'rgba(245, 158, 11, 0.12)',
  premium: '#0066FF',
  premiumSoft: 'rgba(0, 102, 255, 0.10)',
  gradientLabani: '#0066FF',
  gradientYellow: '#00D2FF',
  overlay: 'rgba(15, 23, 42, 0.45)',
  shadowColor: '#0F172A',
  white: '#FFFFFF',
  radiusSm: 12,
  radiusMd: 16,
  radiusLg: 24,
  radiusPill: 999,
  radiusBtn: 999,
  buttonHeight: 44,
};

export const DarkAppTheme: typeof LightAppTheme = {
  ...LightAppTheme,
};

export type AppThemeTokens = typeof LightAppTheme;

export const AppTheme = LightAppTheme;

export const APP_THEMES = {
  dark: DarkAppTheme,
  light: LightAppTheme,
} as const;

export const SCREEN_CONTENT = {
  width: '100%' as const,
  maxWidth: 1024,
  alignSelf: 'center' as const,
  paddingHorizontal: 20,
  paddingTop: 16,
  paddingBottom: 48,
};

export const SERVICE_COLORS = {
  maintenance: LightAppTheme.accent,
  wash: LightAppTheme.warm,
  parts: LightAppTheme.green,
  accessories: LightAppTheme.textMuted,
  winch: LightAppTheme.accent,
} as const;
