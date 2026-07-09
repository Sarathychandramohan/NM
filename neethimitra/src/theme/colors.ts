export const Colors = {
  light: {
    background: '#FFFFFF',
    text: '#121F3E', // Brand navy dark
    textMuted: '#6B7280',
    primary: '#FF9933', // Brand saffron
    primaryHover: '#EA580C',
    secondary: '#128C7E', // Brand green
    accent: '#D4AF37', // Brand gold
    card: '#F9FAFB',
    border: '#E5E7EB',
    error: '#EF4444',
    success: '#10B981',
    info: '#3B82F6',
  },
  dark: {
    background: '#0A0A0A',
    text: '#F3F4F6',
    textMuted: '#9CA3AF',
    primary: '#FF9933', // Brand saffron
    primaryHover: '#EA580C',
    secondary: '#128C7E', // Brand green
    accent: '#D4AF37', // Brand gold
    card: '#121F3E', // Brand navy dark
    border: '#1F2937',
    error: '#EF4444',
    success: '#10B981',
    info: '#3B82F6',
  }
};

export type ThemeColors = typeof Colors.light;
