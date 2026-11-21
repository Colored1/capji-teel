/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#060607',
          900: '#0a0a0e',
          850: '#0f0f14',
          800: '#141419',
          700: '#1f1f26',
          600: '#2d2d36',
          500: '#4a4a56',
          400: '#76767f',
          300: '#a3a3ab',
          200: '#cfcfd4',
          100: '#ebe8e2'
        },
        brand: {
          DEFAULT: '#d3b58f',
          400: '#e3cba8',
          500: '#d3b58f',
          600: '#c4a57d',
          700: '#a08460'
        },
        ok: '#34d399',
        warn: '#fbbf24',
        bad: '#fb7185',
        info: '#60a5fa'
      },
      fontFamily: {
        sans: ['"Segoe UI"', 'Tahoma', '"Noto Sans Arabic"', 'system-ui', 'sans-serif'],
        mono: ['"Cascadia Mono"', 'Consolas', '"Courier New"', 'monospace']
      },
      boxShadow: {
        glow: '0 0 0 1px rgba(211,181,143,.35), 0 8px 30px -8px rgba(211,181,143,.22)'
      }
    }
  },
  plugins: []
}
