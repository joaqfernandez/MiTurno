import type { Config } from 'tailwindcss';

export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta "Medical Clinic": teal médico + verde salud, WCAG AA
        brand: {
          50: '#ECFEFF',
          100: '#CFFAFE',
          200: '#A5F3FC',
          500: '#0891B2',
          600: '#0E7490',
          700: '#155E75',
          900: '#164E63',
        },
        success: { 50: '#F0FDF4', 600: '#16A34A', 700: '#15803D' },
        danger: { 50: '#FEF2F2', 600: '#DC2626', 700: '#B91C1C' },
        warn: { 50: '#FFFBEB', 600: '#D97706', 800: '#92400E' },
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        'card-hover': '0 4px 6px -1px rgb(15 23 42 / 0.07), 0 2px 4px -2px rgb(15 23 42 / 0.05)',
      },
      keyframes: {
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: { 'fade-up': 'fade-up 250ms ease-out both' },
    },
  },
  plugins: [],
} satisfies Config;
