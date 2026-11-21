import type { FastbootDevice } from '../../shared/types'
import { failure, runCommand, type RunOptions, type RunOutput } from './commandRunner'
import { resolveTool } from './toolPaths'

/** تشغيل أمر fastboot (fastboot يكتب معلوماته العادية في stderr لذلك نسجّله كمخرجات عادية) */
export async function runFastboot(
  args: string[],
  opts: RunOptions & { serial?: string } = {}
): Promise<RunOutput> {
  const t = await resolveTool('fastboot')
  if (!t.found) return failure(t.error ?? 'fastboot غير متوفر')
  const full = opts.serial ? ['-s', opts.serial, ...args] : args
  return runCommand(t.bin, full, { stderrLevel: 'out', ...opts })
}

export async function listFastbootDevices(): Promise<{ devices: FastbootDevice[]; error?: string }> {
  const r = await runFastboot(['devices'], { quiet: true, timeoutMs: 8000 })
  if (r.spawnError) return { devices: [], error: r.spawnError }
  const devices: FastbootDevice[] = []
  for (const raw of r.output.split(/\r?\n/)) {
    const m = /^(\S+)\s+(fastboot\S*)/i.exec(raw.trim())
    if (m) devices.push({ serial: m[1], mode: m[2] })
  }
  return { devices }
}

const VARS = ['product', 'variant', 'unlocked', 'secure', 'current-slot', 'version-bootloader', 'serialno']

/** قراءة بعض متغيرات fastboot (بالتتابع لتفادي تعارض الاتصال) */
export async function fastbootVars(serial: string): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const v of VARS) {
    const r = await runFastboot(['getvar', v], { serial, quiet: true, timeoutMs: 6000 })
    if (r.spawnError) break
    const re = new RegExp(`^${v.replace(/[-]/g, '\\-')}:\\s*(.+)$`, 'mi')
    const m = re.exec(r.output)
    if (m) out[v] = m[1].trim()
  }
  return out
}
