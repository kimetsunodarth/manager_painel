/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        ananim: {
          bg: '#020617',
          bgSoft: '#06101d',
          surface: '#0b1526',
          surfaceAlt: '#101b31',
          panel: '#122038',
          panelStrong: '#182946',
          border: 'rgba(148,163,184,0.14)',
          borderStrong: 'rgba(56,189,248,0.22)',
          text: '#F8FAFC',
          textSoft: '#d4deea',
          muted: '#8ea2bc',
          accent: '#37c6db',
          accentStrong: '#72d9ef',
          accentSoft: 'rgba(55,198,219,0.16)',
          success: '#22C55E',
          warning: '#F59E0B',
          danger: '#F87171',
        },
        primary: { 600: '#00C8E0', 700: '#00B6CC' },
        gray: {
          750: '#1E293B',
          850: '#0A1220',
          925: '#020617',
        },
      },
      fontFamily: {
        sans: ['Fira Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Fira Code', 'Fira Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Fira Code', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      boxShadow: {
        'panel': '0 18px 48px rgba(2, 6, 23, 0.34)',
        'panel-sm': '0 10px 24px rgba(2, 6, 23, 0.22)',
        'accent': '0 0 0 1px rgba(55,198,219,0.12), 0 14px 34px rgba(55,198,219,0.08)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.25rem',
      },
      backgroundImage: {
        'ananim-grid':
          'linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)',
        'ananim-glow':
          'radial-gradient(circle at top left, rgba(0,200,224,0.22), transparent 28%), radial-gradient(circle at top right, rgba(56,189,248,0.12), transparent 24%)',
      },
    },
  },
  plugins: [],
};
