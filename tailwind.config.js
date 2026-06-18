/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tg: {
          bg: '#17212b',
          sidebar: '#0e1621',
          'bubble-out': '#2b5278',
          'bubble-in': '#182533',
          border: '#0b1218',
          accent: '#5288c1',
          muted: '#6c7883',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
