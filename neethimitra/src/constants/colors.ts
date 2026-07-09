// NeethiMithra AI — Unified Design System Colors
// Single source of truth. Import ONLY from here.

export const Colors = {
  // ─── Brand Primitives ───────────────────────────────────────────────────────
  orange: '#F97316',
  orangeDark: '#EA580C',
  green: '#16A34A',
  greenDark: '#15803D',
  white: '#FFFFFF',

  // ─── Gradients ───────────────────────────────────────────────────────────────
  gradients: {
    primary:  ['#F97316', '#EA580C'] as const,   // brand orange CTA
    forest:   ['#15803D', '#16A34A'] as const,   // header / nav bar
    cyber:    ['#1E3A5F', '#2563EB'] as const,
    domestic: ['#831843', '#BE185D'] as const,
    senior:   ['#78350F', '#D97706'] as const,
    consumer: ['#134E4A', '#0D9488'] as const,
  },

  // ─── Light Mode ──────────────────────────────────────────────────────────────
  light: {
    background:   '#F8F9FA',
    surface:      '#FFFFFF',
    surfaceBorder:'#E5E7EB',
    text:         '#111827',
    textSecondary:'#6B7280',
    textHint:     '#9CA3AF',
    header:       '#15803D',
    navBar:       '#15803D',
    mic:          '#F97316',
    shadow:       'rgba(0,0,0,0.06)',
  },

  // ─── Dark Mode ───────────────────────────────────────────────────────────────
  dark: {
    background:   '#0D0D0F',
    surface:      '#17171A',
    surfaceBorder:'#262629',
    text:         '#F9FAFB',
    textSecondary:'#9CA3AF',
    textHint:     '#6B7280',
    header:       '#0F172A',
    navBar:       '#0F172A',
    mic:          '#F97316',
    shadow:       'rgba(0,0,0,0.35)',
  },

  // ─── Category Accents ────────────────────────────────────────────────────────
  category: {
    land:   { color: '#78350F', bg: 'rgba(120,53,15,0.09)'  },
    police: { color: '#1E3A5F', bg: 'rgba(30,58,95,0.09)'   },
    cyber:  { color: '#1D4ED8', bg: 'rgba(29,78,216,0.09)'  },
    health: { color: '#134E4A', bg: 'rgba(19,78,74,0.09)'   },
    family: { color: '#5C1A3A', bg: 'rgba(92,26,58,0.09)'   },
    rti:    { color: '#EA580C', bg: 'rgba(234,88,12,0.09)'  },
    general:{ color: '#0369A1', bg: 'rgba(3,105,161,0.09)'  },
  },

  // ─── AI bubble backgrounds ────────────────────────────────────────────────────
  aiBubbleLight: '#F3F4F6',
  aiBubbleDark:  '#1E1E23',
};

export type ThemeColors = typeof Colors.light;
