/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Mesma paleta do Cofre Ananim (tema AnanimCloud, revisões 25/26).
        ananim: {
          bg: '#070b14',
          bgSoft: '#0a0f1c',
          surface: '#11161f',
          surfaceAlt: '#0f1a2e',
          panel: '#0f1a2e',
          panelStrong: '#14324b',
          border: 'rgba(255,255,255,0.10)',
          borderStrong: 'rgba(0,229,255,0.30)',
          text: '#F8FAFC',
          textSoft: '#b9cad7',
          muted: '#94a3b8',
          heading: '#a6bacd',
          accent: '#00e5ff',
          accentStrong: '#7df3ff',
          accentSoft: 'rgba(0,229,255,0.10)',
          onAccent: '#04141b',
          teal: '#14b8a6',
          success: '#22C55E',
          warning: '#F59E0B',
          danger: '#F87171',
        },
        primary: { 600: '#00e5ff', 700: '#00c4db' },
        gray: {
          750: '#1E293B',
          850: '#0A1220',
          925: '#020617',
        },
      },
      // Outfit (títulos) + Inter (texto), servidas pelo próprio portal como no Cofre (public/fonts).
      fontFamily: {
        sans: ['AnanimInter', 'Inter', 'Segoe UI', 'system-ui', 'Arial', 'sans-serif'],
        display: ['AnanimOutfit', 'Outfit', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['ui-monospace', 'SFMono-Regular', 'Consolas', 'monospace'],
      },
      boxShadow: {
        'panel': '0 18px 40px rgba(0, 0, 0, 0.25)',
        'panel-sm': '0 8px 20px rgba(0, 0, 0, 0.18)',
        'accent': 'inset 3px 0 #00e5ff',
      },
      // Cantos do Cofre: 20px em cartões e 12px em campos e botões.
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '20px',
      },
      backgroundImage: {
        'ananim-grid':
          'linear-gradient(rgba(148,163,184,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.05) 1px, transparent 1px)',
        'ananim-glow':
          'radial-gradient(circle at 25% 20%, rgba(0,229,255,0.16), transparent 45%), radial-gradient(circle at 80% 90%, rgba(20,184,166,0.14), transparent 45%)',
      },
    },
  },
  plugins: [],
};
