/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // Tema AnanimCloud (baseado no portal modelo http://localhost:5052/)
        ananim: {
          bg: '#08080C',
          surface: '#0C0C16',
          panel: '#0F111A',
          border: 'rgba(255,255,255,0.10)',
          text: '#E5E7EB',
          muted: '#9CA3AF',
          accent: '#00C8E0',
          accentSoft: 'rgba(0,200,224,0.20)',
        },
        // Mantém compatibilidade com classes antigas (blue -> cyan)
        primary: { 600: '#00C8E0', 700: '#00B6CC' },
        gray: { 750: '#1A1A2E', 850: '#0C0C16' },
      },
      fontFamily: {
        sans: ['Sora', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Space Grotesque', 'Sora', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
