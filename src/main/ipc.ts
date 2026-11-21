import { BrowserWindow, app, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { mkdirSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { CH } from '../shared/ipc'
import {
  APP_NAME,
  type AppInfo,
  type AppSettings,
  type LogEntry,
  type RunProgress,
  type RunRequest
} from '../shared/types'
import { backupsRoot } from './services/backupService'
import { deviceService } from './services/deviceService'
import { engine } from './services/engine'
import { logger } from './services/logger'
import { getBundle, loadBundle, userDataDir } from './services/profileStore'
import { getSettings, updateSettings } from './services/settings'
import { invalidateTools } from './services/toolPaths'

type Handler = (...args: any[]) => unknown // eslint-disable-line @typescript-eslint/no-explicit-any

/** الطلبات تُقبل فقط من صفحة التطبيق نفسها (وليس من أي موقع آخر) */
function senderAllowed(e: IpcMainInvokeEvent): boolean {
  const url = e.senderFrame?.url ?? ''
  if (url.startsWith('file://')) return true
  const dev = process.env['ELECTRON_RENDERER_URL']
  return !!dev && url.startsWith(dev)
}

/** كل معالج يُرجع {ok:true,data} أو {ok:false,error} ليظهر الخطأ للمستخدم بوضوح */
function handle(channel: string, fn: Handler): void {
  ipcMain.handle(channel, async (e, ...args) => {
    if (!senderAllowed(e)) return { ok: false, error: 'طلب مرفوض: مصدر غير موثوق' }
    try {
      return { ok: true, data: await fn(...args) }
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

function broadcast(channel: string, payload: unknown): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, payload)
  }
}

function parseRunRequest(raw: unknown): RunRequest {
  if (!raw || typeof raw !== 'object') throw new Error('طلب تنفيذ غير صالح')
  const r = raw as Record<string, unknown>
  const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length <= 256 ? v : undefined)
  const profileId = str(r['profileId'])
  if (!profileId) throw new Error('معرّف القالب مفقود')
  const inputs: Record<string, string> = {}
  if (r['inputs'] && typeof r['inputs'] === 'object') {
    for (const [k, v] of Object.entries(r['inputs'] as Record<string, unknown>)) {
      if (typeof v === 'string' && v.length <= 256) inputs[k] = v
    }
  }
  return {
    profileId,
    serial: str(r['serial']),
    comPort: str(r['comPort']),
    carrierId: str(r['carrierId']),
    apnId: str(r['apnId']),
    inputs,
    confirmed: r['confirmed'] === true,
    skipBackup: r['skipBackup'] === true
  }
}

export function registerIpc(): void {
  // ---------- التطبيق ----------
  handle(CH.appInfo, (): AppInfo => ({
    name: APP_NAME,
    version: app.getVersion(),
    platform: process.platform,
    dataDir: userDataDir(),
    backupsDir: backupsRoot(),
    logsDir: join(app.getPath('userData'), 'logs')
  }))
  handle(CH.openDataFolder, async () => {
    mkdirSync(userDataDir(), { recursive: true })
    const err = await shell.openPath(userDataDir())
    if (err) throw new Error(err)
  })
  handle(CH.openBackupsFolder, async () => {
    mkdirSync(backupsRoot(), { recursive: true })
    const err = await shell.openPath(backupsRoot())
    if (err) throw new Error(err)
  })

  // ---------- الجهاز ----------
  handle(CH.deviceGet, () => deviceService.getState())
  handle(CH.deviceRefresh, () => deviceService.refresh())
  handle(CH.deviceSelect, (serial: unknown) =>
    deviceService.select(typeof serial === 'string' && serial.length < 256 ? serial : null)
  )
  handle(CH.deviceSelectCom, (path: unknown) =>
    deviceService.selectCom(typeof path === 'string' && /^[\w./\\-]{1,64}$/.test(path) ? path : null)
  )
  deviceService.on('state', (s) => broadcast(CH.deviceStateEvent, s))

  // ---------- القوالب ----------
  handle(CH.profilesList, () => getBundle())
  handle(CH.profilesReload, () => loadBundle())

  // ---------- التنفيذ ----------
  handle(CH.runStart, (raw: unknown) => engine.run(parseRunRequest(raw), getBundle()))
  handle(CH.runCancel, (runId: unknown) => {
    if (typeof runId === 'string') engine.cancel(runId)
  })
  engine.on('progress', (p: RunProgress) => broadcast(CH.runProgressEvent, p))

  // ---------- السجل (يُرسل على دفعات كل 80ms لتخفيف الحمل) ----------
  let pending: LogEntry[] = []
  let timer: NodeJS.Timeout | null = null
  logger.on('entries', (entries: LogEntry[]) => {
    pending.push(...entries)
    if (!timer) {
      timer = setTimeout(() => {
        const batch = pending
        pending = []
        timer = null
        broadcast(CH.logEntriesEvent, batch)
      }, 80)
    }
  })
  handle(CH.logHistory, () => logger.history())
  handle(CH.logClear, () => {
    logger.clear()
  })
  handle(CH.logExport, async () => {
    const win = BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0]
    const d = new Date()
    const p2 = (n: number): string => String(n).padStart(2, '0')
    const name = `CAPji-teel-log-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.txt`
    const opts = {
      title: 'تصدير سجل العمليات',
      defaultPath: join(app.getPath('documents'), name),
      filters: [{ name: 'ملف نصي', extensions: ['txt', 'log'] }]
    }
    const res = win ? await dialog.showSaveDialog(win, opts) : await dialog.showSaveDialog(opts)
    if (res.canceled || !res.filePath) return { saved: false }
    await writeFile(res.filePath, `﻿${logger.toText()}`, 'utf8') // BOM ليظهر العربي صحيحاً في المفكرة
    return { saved: true, path: res.filePath }
  })

  // ---------- الإعدادات ----------
  handle(CH.settingsGet, () => getSettings())
  handle(CH.settingsSet, async (patch: unknown) => {
    if (!patch || typeof patch !== 'object') throw new Error('إعدادات غير صالحة')
    const s = updateSettings(patch as Partial<AppSettings>)
    invalidateTools()
    await deviceService.refresh()
    return s
  })
}
