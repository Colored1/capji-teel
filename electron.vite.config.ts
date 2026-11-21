import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'

// سياسة أمان المحتوى (CSP) تُضاف في نسخة الإنتاج فقط
// (في وضع التطوير يحتاج Vite لسكربتات داخلية للـ Hot Reload).
const CSP =
  `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'" />`

const cspPlugin = (): Plugin => ({
  name: 'capji-csp',
  apply: 'build',
  transformIndexHtml: (html) => html.replace('<!--CSP-->', CSP)
})

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { external: ['serialport'] } }
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared')
      }
    },
    plugins: [react(), cspPlugin()]
  }
})
