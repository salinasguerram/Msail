import { DarkTheme, type Theme } from 'expo-router';

/** Paleta tomada de los diseños de MSAIL: azul noche profundo con acentos azul eléctrico. */
export const colors = {
  background: '#050b18',
  surface: '#0b1730',
  surfaceRaised: '#11213f',
  border: '#1c2c4d',
  primary: '#2f8cff',
  primaryPressed: '#1f6fd6',
  text: '#e6edf7',
  textMuted: '#7f8fab',
  success: '#2ecc71',
  warning: '#f5b942',
  danger: '#ff5a5f',
  live: '#e63946',
};

/** Tipografía de la marca (Montserrat, como el logo y los títulos de los diseños). Se cargan en el layout raíz. */
export const fonts = {
  display: 'Montserrat_800ExtraBold',
  heading: 'Montserrat_700Bold',
  semibold: 'Montserrat_600SemiBold',
};

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };

export const typography = {
  title: { fontSize: 28, fontFamily: fonts.display, color: colors.text, letterSpacing: 0.5 },
  heading: { fontSize: 20, fontWeight: '700' as const, color: colors.text },
  body: { fontSize: 15, color: colors.text, lineHeight: 22 },
  caption: { fontSize: 13, color: colors.textMuted, lineHeight: 18 },
  label: { fontSize: 12, fontWeight: '600' as const, color: colors.textMuted, letterSpacing: 1, textTransform: 'uppercase' as const },
};

export const navigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: colors.primary,
    background: colors.background,
    card: colors.surface,
    text: colors.text,
    border: colors.border,
    notification: colors.live,
  },
};
