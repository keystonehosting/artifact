// Annotation colors: names are stored, values come from the theme.
export const COLORS = ['yellow', 'green', 'blue', 'red', 'purple'] as const;
export type ColorName = (typeof COLORS)[number];

export const COLOR_VALUES: Record<ColorName, { light: string; dark: string }> = {
  yellow: { light: '#f5d547', dark: '#b8962a' },
  green: { light: '#8fd18b', dark: '#3f8f50' },
  blue: { light: '#8cbcf2', dark: '#3c6fa8' },
  red: { light: '#f29a8f', dark: '#a8473d' },
  purple: { light: '#c3a6ef', dark: '#7656a8' },
};
