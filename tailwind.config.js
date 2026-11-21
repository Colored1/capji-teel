/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          950: '#070a10',
          900: '#0b0f17',
          850: '#0f1520',
          800: '#131b29',
          700: '#1b2536',
          600: '#263349',
          500: '#3a4a66',
          400: '#5b6b88',
          300: '#8a99b3',
          200: '#b7c2d6',
          100: '#dbe2ee'
        },
        brand: {
          DEFAULT: '#22d3c5',
          400: '#2ee6d6',
          500: '#22d3c5',
          600: '#14b3a8',
          700: '#0f8a82'
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
        glow: '0 0 0 1px rgba(34,211,197,.35), 0 8px 30px -8px rgba(34,211,197,.25)'
      }
    }
  },
  plugins: []
}
