/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        background: '#0B1F33',
        surface: '#132B45',
        accent: {
          DEFAULT: '#00A6A6',
          glow: '#33BFBF',
        },
        success: '#10B981',
        error: '#EF4444',
        'text-primary': '#F7F9FA',
        'text-muted': '#8B98A6',
        border: 'rgba(255, 255, 255, 0.08)',
        input: 'rgba(255, 255, 255, 0.05)',
        ring: '#00A6A6',
        foreground: '#F7F9FA',
        primary: {
          DEFAULT: '#00A6A6',
          foreground: '#F7F9FA',
        },
        secondary: {
          DEFAULT: '#132B45',
          foreground: '#F7F9FA',
        },
        destructive: {
          DEFAULT: '#EF4444',
          foreground: '#F7F9FA',
        },
        muted: {
          DEFAULT: '#132B45',
          foreground: '#8B98A6',
        },
        card: {
          DEFAULT: '#132B45',
          foreground: '#F7F9FA',
        },
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.375rem',
      },
      fontFamily: {
        sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
        handwritten: ['var(--font-caveat)', 'cursive'],
      },
      boxShadow: {
        glow: '0 0 24px rgba(0,166,166, 0.45)',
        'glow-lg': '0 0 48px rgba(51,191,191, 0.35)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 16px rgba(0,166,166, 0.4)' },
          '50%': { boxShadow: '0 0 32px rgba(51,191,191, 0.7)' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 2.5s linear infinite',
        'pulse-glow': 'pulse-glow 2.4s ease-in-out infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
