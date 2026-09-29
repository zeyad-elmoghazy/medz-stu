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
        background: 'var(--bg)',
        surface: 'var(--surface)',
        accent: {
          DEFAULT: 'rgb(var(--accent-text-rgb) / <alpha-value>)',
          glow: 'rgb(var(--accent-glow-rgb) / <alpha-value>)',
          foreground: '#F7F9FA',
        },
        success: 'rgb(var(--success-rgb) / <alpha-value>)',
        error: 'rgb(var(--error-rgb) / <alpha-value>)',
        'text-primary': 'var(--text)',
        'text-muted': 'rgb(var(--text3-rgb) / <alpha-value>)',
        border: 'var(--line)',
        input: 'var(--fill)',
        ring: 'rgb(var(--accent-text-rgb) / <alpha-value>)',
        foreground: 'var(--text)',
        primary: {
          DEFAULT: 'rgb(var(--accent-text-rgb) / <alpha-value>)',
          foreground: '#F7F9FA',
        },
        secondary: {
          DEFAULT: 'var(--surface)',
          foreground: 'var(--text)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--error-rgb) / <alpha-value>)',
          foreground: '#F7F9FA',
        },
        muted: {
          DEFAULT: 'var(--surface)',
          foreground: 'rgb(var(--text3-rgb) / <alpha-value>)',
        },
        card: {
          DEFAULT: 'var(--surface)',
          foreground: 'var(--text)',
        },
      },
      borderRadius: {
        lg: '0.75rem',
        md: '0.5rem',
        sm: '0.375rem',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        handwritten: ['var(--font-caveat)', 'cursive'],
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
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        shimmer: 'shimmer 2.5s linear infinite',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
};
