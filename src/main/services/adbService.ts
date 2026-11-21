import type { AdbDevice, AdbState } from '../../shared/types'
import { failure, runCommand, type RunOptions, type RunOutput } from './commandRunner'
import { resolveTool } from './toolPaths'

/** تشغيل أمر adb (مع -s serial إذا حُدد الجهاز) */
export async function runAdb(
  args: string[],
  opts: RunOptions & { serial?: string } = {}
): Promise<RunOutput> {
  const t = await resolveTool('adb')
  if (!t.found) return failure(t.error ?? 'adb غير متوفر')
  const full = opts.serial ? ['-s', opts.serial, ...args] : args
  return runCommand(t.bin, full, opts)
}

const STATE_MAP: Record<string, AdbState> = {
  device: 'device',
  offline: 'offline',
  unauthorized: 'unauthorized',
  recovery: 'recovery',
  sideload: 'sideload',
  bootloader: 'bootloader'
}

export async function listAdbDevices(): Promise<{ devices: AdbDevice[]; error?: string }> {
  let r = await runAdb(['devices', '-l'], { quiet: true, timeoutMs: 10_000 })
  if (!r.spawnError && r.code !== 0) {
    // غالباً الخادم لا يعمل: نشغّله ونعيد المحاولة مرة واحدة
    await runAdb(['start-server'], { quiet: true, timeoutMs: 15_000 })
    r = await runAdb(['devices', '-l'], { quiet: true, timeoutMs: 10_000 })
  }
  if (r.spawnError) return { devices: [], error: r.spawnError }
  if (r.code !== 0) return { devices: [], error: r.output.trim() || 'فشل تنفيذ adb devices' }

  const devices: AdbDevice[] = []
  for (const raw of r.stdout.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('*') || line.startsWith('List of')) continue
    const m = /^(\S+)\s+(.+)$/.exec(line)
    if (!m) continue
    const serial = m[1]
    const rest = m[2]
    const word = rest.split(/\s+/)[0]
    const state = STATE_MAP[word] ?? 'unknown'
    const kv: Record<string, string | undefined> = {}
    for (const x of rest.matchAll(/(\w+):(\S+)/g)) kv[x[1]] = x[2]
    devices.push({
      serial,
      state,
      model: kv['model']?.replace(/_/g, ' '),
      product: kv['product'],
      deviceName: kv['device'],
      detail: state === 'unknown' ? rest : undefined
    })
  }
  return { devices }
}

/** قراءة كل خصائص النظام (getprop) كخريطة */
export async function getProps(serial: string): Promise<Record<string, string>> {
  const r = await runAdb(['shell', 'getprop'], { serial, quiet: true, timeoutMs: 12_000 })
  const props: Record<string, string> = {}
  if (r.spawnError || r.code !== 0) return props
  for (const line of r.stdout.split(/\r?\n/)) {
    const m = /^\[(.+?)\]: \[(.*)\]$/.exec(line.trim())
    if (m) props[m[1]] = m[2]
  }
  return props
}
