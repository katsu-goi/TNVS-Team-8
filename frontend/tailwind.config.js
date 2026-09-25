/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        heading: ['Outfit', 'sans-serif'],
      },
      colors: {
        brand: {
          50: '#FFF5F5',   // Warm page background
          100: '#FCD7D9',
          200: '#F8B1B4',
          500: '#B5121B',  // Hirna Red
          600: '#C8102E',
          700: '#98131B',  // Hirna Dark Red
          900: '#7B1B1E',
          950: '#4D1113',
        },
        surface: {
          sidebar: '#D02F34', // Hirna Red background for Sidebar
          primary: '#0B1220',
          secondary: '#0F172A',
          tertiary: '#1e293b',
          card: 'rgba(17, 24, 39, 0.6)',
          'card-solid': '#111827',
          header: 'rgba(11, 18, 32, 0.85)',
          input: '#111827',
          hover: 'rgba(255, 255, 255, 0.05)',
          active: '#1e293b',
          overlay: 'rgba(0, 0, 0, 0.6)',
          code: '#0F172A',
          page: '#FFF5F5',
          'card-light': '#FFFDFD',
          'card-light-hover': '#FFF7F7',
          'input-light': '#FFFDFD',
          'header-light': 'rgba(255, 255, 255, 0.85)',
          'hover-light': '#FDF0F1',
        },
        content: {
          primary: '#1F2937', // Default text color updated as requested
          secondary: '#94A3B8',
          muted: '#64748b',
          dim: '#475569',
          accent: '#D02F34', // Hirna Red as accent
          'accent-hover': '#A9252A', // Hirna Dark Red as accent hover
          inverse: '#FFFFFF',
          success: '#22C55E',
          error: '#D02F34', // Alert Red matches Hirna Red closely
          warning: '#FFC629', // Warning Yellow matches Hirna Yellow
        },
        border: {
          DEFAULT: '#E5E7EB', // Neutral border updated as requested
          secondary: '#F1F5F9',
          accent: '#D02F34', // Hirna Red border accent
          success: '#22C55E',
          error: '#D02F34',
          warning: '#FFC629',
        },
        accent: {
          DEFAULT: '#D02F34', // Hirna Red
          hover: '#A9252A', // Hirna Dark Red
          bg: 'rgba(208, 47, 52, 0.1)',
          'bg-hover': 'rgba(208, 47, 52, 0.15)',
        },
        success: {
          DEFAULT: '#22C55E',
          bg: 'rgba(34, 197, 94, 0.1)',
        },
        error: {
          DEFAULT: '#D02F34',
          bg: 'rgba(208, 47, 52, 0.1)',
        },
        warning: {
          DEFAULT: '#FFC629', // Hirna Yellow
          bg: 'rgba(255, 198, 41, 0.1)',
        },
        hirna: {
          red: '#B5121B',
          'dark-red': '#98131B',
          yellow: '#FFBF2F',
          'light-red': '#FFF5F5',
          'light-yellow': '#FFF6D8',
        }
      },
      borderRadius: {
        'control': '0.75rem',
        'card': '1rem',
        'modal': '1.25rem',
        'container': '1.5rem',
      },
      boxShadow: {
        glass: '0 8px 32px rgba(0, 0, 0, 0.1)',
        card: '0 2px 8px rgba(0, 0, 0, 0.05)',
        soft: '0 1px 3px rgba(0, 0, 0, 0.05)',
        medium: '0 4px 12px rgba(0, 0, 0, 0.08)',
        strong: '0 8px 24px rgba(0, 0, 0, 0.12)',
        heavy: '0 12px 40px rgba(0, 0, 0, 0.15)',
        'card-light': '0 1px 2px rgba(0, 0, 0, 0.05)',
        'card-light-hover': '0 4px 6px rgba(0, 0, 0, 0.07)',
        modal: '0 24px 60px rgba(70, 10, 16, 0.22)',
        brand: '0 8px 24px rgba(101, 24, 30, 0.10)',
      },
      backgroundImage: {
        'gradient-page': 'linear-gradient(to bottom right, #F8FAFC, #FFFFFF)',
        'gradient-accent': 'linear-gradient(135deg, #D02F34, #A9252A)',
      },
    },
  },
  plugins: [],
}
