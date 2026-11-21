/// <reference types="vite/client" />
import type { CapjiApi } from '@shared/types'

declare global {
  interface Window {
    capji: CapjiApi
  }
}

export {}
