/** Premium automotive UI tokens — deep blue/black with restrained glow. */
export const DarkAppTheme = {
  bg: '#080D1A',
  bgElevated: '#0D1423',
  card: '#121826',
  cardHover: '#172034',
  border: 'rgba(255,255,255,0.05)',
  accent: '#0052FF',
  accentSoft: 'rgba(0, 82, 255, 0.22)',
  onAccent: '#000000',
  warm: '#00D4FF',
  warmSoft: 'rgba(0, 212, 255, 0.16)',
  green: '#34D399',
  greenSoft: 'rgba(52, 211, 153, 0.14)',
  text: '#FFFFFF',
  textMuted: '#C5D1E3',
  textDim: '#93A0B8',
  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.14)',
  success: '#22C55E',
  successSoft: 'rgba(34, 197, 94, 0.14)',
  white: '#FFFFFF',
  radiusSm: 12,
  radiusMd: 18,
  radiusLg: 24,
  radiusPill: 999,
  radiusBtn: 28,
};

export const LightAppTheme = {
  bg: '#F0F5FF',
  bgElevated: '#FFFFFF',
  card: '#FFFFFF',
  cardHover: '#F4F8FF',
  border: '#D8E2F5',
  accent: '#0052FF',
  accentSoft: 'rgba(0, 82, 255, 0.14)',
  onAccent: '#FFFFFF',
  warm: '#00A8D1',
  warmSoft: 'rgba(0, 168, 209, 0.12)',
  green: '#059669',
  greenSoft: 'rgba(5, 150, 105, 0.10)',
  text: '#0B1422',
  textMuted: '#4A5E78',
  textDim: '#667892',
  danger: '#DC2626',
  dangerSoft: 'rgba(220, 38, 38, 0.12)',
  success: '#16A34A',
  successSoft: 'rgba(22, 163, 74, 0.12)',
  white: '#FFFFFF',
  radiusSm: 12,
  radiusMd: 18,
  radiusLg: 24,
  radiusPill: 999,
  radiusBtn: 28,
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
  winch: '#9CA3AF',
} as const;
