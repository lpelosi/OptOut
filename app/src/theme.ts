// Clean & minimal design tokens. Single accent, generous spacing, dark + light.
import { useColorScheme } from 'react-native';

const palette = {
  accent: '#4F8A8B',
  accentSoft: '#4F8A8B22',
  positive: '#2A9D8F',
  danger: '#E07A5F',
};

const light = {
  ...palette,
  bg: '#F7F8FA',
  card: '#FFFFFF',
  text: '#15181D',
  textMuted: '#6B7280',
  border: '#E6E8EC',
};

const dark = {
  ...palette,
  bg: '#0E1116',
  card: '#171B22',
  text: '#F2F4F7',
  textMuted: '#8B93A1',
  border: '#262B33',
};

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
export const radius = { sm: 8, md: 14, lg: 22, pill: 999 };

export type Colors = typeof light;

export function useColors(): Colors {
  return useColorScheme() === 'dark' ? dark : light;
}

// Format cents-free dollar amounts cleanly.
export function money(n: number): string {
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n % 1 === 0 ? 0 : 2 });
}
