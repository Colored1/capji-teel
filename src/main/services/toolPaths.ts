import { app } from 'electron'
import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { ToolStatus } from '../../shared/types'
import { runCommand } from './commandRunner'
import { getSettings } from './settings'

export type ToolName = 'adb' | 'fastboot'
export type ResolvedTool = ToolStatus & { bin: string }

const found = new Map<ToolName, ResolvedTool>()
const missing = new Map<ToolName, { at: number; res: ResolvedTool }>()

const exeName = (tool: ToolName): string => (process.platform === 'win32' ? `${tool}.exe` : tool)

/** مجلد الأدوات المرفقة: resources/tools في التطوير، وبجانب البرنامج بعد البناء */
export function bundledToolsDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'tools') : join(app.getAppPath(), 'resources', 'tools')
}

/** مجلد القوالب الافتراضية المرفقة */
export function bundledDataDir(): string {
  return app.isPackaged ? join(process.resourcesPath, 'data') : join(app.getAppPath(), 'resources', 'data')
}

function candidates(tool: ToolName): string[] {
  const s = getSettings()
  const custom = (tool === 'adb' ? s.adbPath : s.fastbootPath).trim()
  const list: string[] = []
  if (custom) list.push(custom)
  list.push(join(bundledToolsDir(), exeName(tool)))
  list.push(exeName(tool)) // من PATH
  return list
}

export function invalidateTools(): void {
  found.clear()
  missing.clear()
}

/** يبحث عن adb/fastboot: المسار المخصص ← المجلد المرفق ← PATH، ويتحقق بتشغيل أمر الإصدار */
export async function resolveTool(tool: ToolName): Promise<ResolvedTool> {
  const cached = found.get(tool)
  if (cached) return cached
  const miss = missing.get(tool)
  if (miss && Date.now() - miss.at < 10_000) return miss.res

  for (const bin of candidates(tool)) {
    if (isAbsolute(bin) && !existsSync(bin)) continue
    const r = await runCommand(bin, tool === 'adb' ? ['version'] : ['--version'], {
      quiet: true,
      timeoutMs: 8000
    })
    if (!r.spawnError && r.code === 0) {
      const version = (r.stdout.split(/\r?\n/)[0] || r.stderr.split(/\r?\n/)[0] || '').trim()
      const res: ResolvedTool = { found: true, bin, path: bin, version }
      found.set(tool, res)
      return res
    }
  }

  const res: ResolvedTool = {
    found: false,
    bin: exeName(tool),
    error: `لم يتم العثور على ${exeName(tool)}. ضعه في المجلد resources/tools أو حدّد مساره من الإعدادات.`
  }
  missing.set(tool, { at: Date.now(), res })
  return res
}
