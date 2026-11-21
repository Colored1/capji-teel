import type { ComKind, ComPortInfo } from '../../shared/types'
import { runCommand } from './commandRunner'

/* eslint-disable @typescript-eslint/no-explicit-any */

// ------------------------------------------------------------
//  منافذ COM: الاكتشاف + إرسال أوامر AT
//  - الأفضل: مكتبة serialport (تُثبَّت مع npm install).
//  - بدونها: على ويندوز نستخدم PowerShell لقراءة قائمة المنافذ فقط.
//    (إرسال أوامر AT يحتاج serialport.)
// ------------------------------------------------------------

type ListResult = { ports: ComPortInfo[]; error?: string; backend: 'serialport' | 'powershell' | 'none' }

let spModule: any | null | undefined

async function loadSerialport(): Promise<any | null> {
  if (spModule !== undefined) return spModule
  try {
    spModule = await import('serialport')
  } catch {
    spModule = null
  }
  return spModule
}

/** تصنيف المنفذ حسب الاسم/المعرّفات: مفيد للفني ليعرف أي منفذ يستعمل */
export function classify(p: { friendlyName?: string; manufacturer?: string; vendorId?: string; productId?: string }): ComKind {
  const name = `${p.friendlyName ?? ''} ${p.manufacturer ?? ''}`.toLowerCase()
  const vid = (p.vendorId ?? '').toLowerCase()
  const pid = (p.productId ?? '').toLowerCase()
  if (/9008|qdloader|emergency download/.test(name) || (vid === '05c6' && pid === '9008')) return 'edl'
  if (/preloader|brom|bootrom|mediatek usb port|mtk usb port/.test(name)) return 'bootrom'
  if (/diag/.test(name)) return 'diag'
  if (/modem|at interface|at command|at port|ap?\s?serial|gsm|3g pcui|application interface/.test(name))
    return 'modem'
  return 'other'
}

const comNumber = (p: ComPortInfo): number => Number(/(\d+)$/.exec(p.path)?.[1] ?? 0)

let psCache: { at: number; value: ListResult } | null = null

async function listViaPowerShell(force: boolean): Promise<ListResult> {
  if (!force && psCache && Date.now() - psCache.at < 8000) return psCache.value
  const script =
    "$r = @(Get-CimInstance Win32_PnPEntity | Where-Object { $_.Name -match '\\(COM\\d+\\)' } | Select-Object Name,Manufacturer,PNPDeviceID); ConvertTo-Json -InputObject $r -Compress"
  const r = await runCommand(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
    { quiet: true, timeoutMs: 15_000 }
  )
  let value: ListResult
  if (r.spawnError || r.code !== 0) {
    value = { ports: [], backend: 'none', error: 'تعذّر قراءة منافذ COM (PowerShell).' }
  } else {
    try {
      const parsed: any = JSON.parse(r.stdout.trim() || '[]')
      const arr: any[] = Array.isArray(parsed) ? parsed : [parsed]
      const ports: ComPortInfo[] = []
      for (const x of arr) {
        const path = /\((COM\d+)\)/.exec(String(x?.Name ?? ''))?.[1]
        if (!path) continue
        const vendorId = /VID_([0-9A-F]{4})/i.exec(String(x?.PNPDeviceID ?? ''))?.[1]?.toLowerCase()
        const productId = /PID_([0-9A-F]{4})/i.exec(String(x?.PNPDeviceID ?? ''))?.[1]?.toLowerCase()
        const friendlyName = String(x?.Name ?? '')
        const manufacturer = x?.Manufacturer ? String(x.Manufacturer) : undefined
        ports.push({
          path,
          friendlyName,
          manufacturer,
          vendorId,
          productId,
          kind: classify({ friendlyName, manufacturer, vendorId, productId })
        })
      }
      ports.sort((a, b) => comNumber(a) - comNumber(b))
      value = {
        ports,
        backend: 'powershell',
        error: 'مكتبة serialport غير مثبتة: القائمة للعرض فقط، وإرسال أوامر AT غير متاح. نفّذ npm install.'
      }
    } catch {
      value = { ports: [], backend: 'none', error: 'تعذّر تحليل قائمة منافذ COM.' }
    }
  }
  psCache = { at: Date.now(), value }
  return value
}

export async function listComPorts(force = false): Promise<ListResult> {
  const sp = await loadSerialport()
  if (sp?.SerialPort) {
    try {
      const raw: any[] = await sp.SerialPort.list()
      const ports: ComPortInfo[] = raw.map((p: any) => {
        const friendlyName: string | undefined = p.friendlyName ?? p.pnpId ?? undefined
        const manufacturer: string | undefined = p.manufacturer ?? undefined
        const vendorId: string | undefined = p.vendorId ? String(p.vendorId).toLowerCase() : undefined
        const productId: string | undefined = p.productId ? String(p.productId).toLowerCase() : undefined
        return {
          path: String(p.path),
          friendlyName,
          manufacturer,
          vendorId,
          productId,
          kind: classify({ friendlyName, manufacturer, vendorId, productId })
        }
      })
      ports.sort((a, b) => comNumber(a) - comNumber(b))
      return { ports, backend: 'serialport' }
    } catch {
      /* ننتقل للبديل */
    }
  }
  if (process.platform === 'win32') return listViaPowerShell(force)
  return { ports: [], backend: 'none', error: 'مكتبة serialport غير مثبتة. نفّذ: npm install' }
}

/** اختيار منفذ مودم (AT) تلقائياً: المفضّل ثم أول منفذ من نوع modem */
export function pickAtPort(ports: ComPortInfo[], preferred?: string | null): string | undefined {
  if (preferred && ports.some((p) => p.path === preferred)) return preferred
  return ports.find((p) => p.kind === 'modem')?.path
}

export interface AtResult {
  ok: boolean
  response: string
  error?: string
}

const FINAL = /(?:^|\r?\n)(OK|ERROR|NO CARRIER|\+CME ERROR:[^\r\n]*|\+CMS ERROR:[^\r\n]*)\r?\n/

/** إرسال أمر AT واحد وانتظار النتيجة النهائية (OK / ERROR / +CME ERROR) */
export async function sendAt(
  path: string,
  command: string,
  opts: { baudRate?: number; timeoutMs?: number; signal?: AbortSignal } = {}
): Promise<AtResult> {
  const sp = await loadSerialport()
  if (!sp?.SerialPort) {
    return {
      ok: false,
      response: '',
      error: 'مكتبة serialport غير مثبتة، لا يمكن إرسال أوامر AT. نفّذ: npm install ثم أعد تشغيل البرنامج.'
    }
  }
  const timeoutMs = opts.timeoutMs ?? 8000

  return new Promise<AtResult>((resolve) => {
    let port: any = null
    let buf = ''
    let done = false
    let timer: NodeJS.Timeout | undefined

    const clean = (): string => {
      const lines = buf.replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean)
      if (lines[0] === command.trim()) lines.shift() // حذف صدى الأمر
      return lines.join('\n')
    }
    const finish = (res: { ok: boolean; error?: string }): void => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      const out: AtResult = { ok: res.ok, response: clean(), error: res.error }
      try {
        if (port?.isOpen) port.close(() => resolve(out))
        else resolve(out)
      } catch {
        resolve(out)
      }
    }
    const onAbort = (): void => finish({ ok: false, error: 'تم الإلغاء' })

    if (opts.signal?.aborted) return finish({ ok: false, error: 'تم الإلغاء' })
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    timer = setTimeout(() => finish({ ok: false, error: 'انتهت المهلة دون رد من المودم' }), timeoutMs)

    try {
      port = new sp.SerialPort({ path, baudRate: opts.baudRate ?? 115200, autoOpen: false })
    } catch (e) {
      return finish({ ok: false, error: `تعذر فتح ${path}: ${e instanceof Error ? e.message : String(e)}` })
    }

    port.on('error', (e: Error) => finish({ ok: false, error: `خطأ في المنفذ ${path}: ${e.message}` }))
    port.on('data', (d: Buffer) => {
      buf += d.toString('utf8')
      const m = FINAL.exec(`${buf}\n`)
      if (m) finish({ ok: m[1] === 'OK', error: m[1] === 'OK' ? undefined : m[1] })
    })
    port.open((err: Error | null) => {
      if (err) return finish({ ok: false, error: `تعذر فتح ${path}: ${err.message}` })
      port.write(`${command}\r`, (e: Error | null | undefined) => {
        if (e) finish({ ok: false, error: `تعذّر الكتابة إلى ${path}: ${e.message}` })
      })
    })
  })
}
