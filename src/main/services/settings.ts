import { app } from 'electron'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import type { AppSettings } from '../../shared/types'

const DEFAULTS: AppSettings = {
  adbPath: '',
  fastbootPath: '',
  pollIntervalMs: 3000,
  autoBackupMaxAgeMin: 30
}

let cache: AppSettings | null = null

const file = (): string => join(app.getPath('userData'), 'settings.json')

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback
  return Math.min(max, Math.max(min, Math.round(v)))
}

function sanitize(raw: Partial<AppSettings>): AppSettings {
  return {
    adbPath: typeof raw.adbPath === 'string' ? raw.adbPath.trim() : DEFAULTS.adbPath,
    fastbootPath: typeof raw.fastbootPath === 'string' ? raw.fastbootPath.trim() : DEFAULTS.fastbootPath,
    pollIntervalMs: clamp(raw.pollIntervalMs, 1500, 30000, DEFAULTS.pollIntervalMs),
    autoBackupMaxAgeMin: clamp(raw.autoBackupMaxAgeMin, 0, 1440, DEFAULTS.autoBackupMaxAgeMin)
  }
}

export function getSettings(): AppSettings {
  if (cache) return cache
  try {
    const raw = readFileSync(file(), 'utf8').replace(/^﻿/, '')
    cache = sanitize(JSON.parse(raw) as Partial<AppSettings>)
  } catch {
    cache = { ...DEFAULTS }
  }
  return cache
}

export function updateSettings(patch: Partial<AppSettings>): AppSettings {
  cache = sanitize({ ...getSettings(), ...patch })
  try {
    writeFileSync(file(), JSON.stringify(cache, null, 2), 'utf8')
  } catch {
    /* فشل الحفظ لا يمنع استمرار العمل */
  }
  return cache
}
