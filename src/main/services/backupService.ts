import { app } from 'electron'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { runAdb } from './adbService'
import { logger } from './logger'

export const backupsRoot = (): string => join(app.getPath('userData'), 'backups')

const pad = (n: number): string => String(n).padStart(2, '0')

function stamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

const safe = (s: string): string => s.replace(/[^\w.-]/g, '_')

/** آخر نسخة احتياطية ناجحة لكل جهاز (في هذه الجلسة) */
const last = new Map<string, { ts: number; dir: string }>()

export function lastBackup(serial: string): { ts: number; dir: string } | undefined {
  return last.get(serial)
}

/** ينشئ مجلداً جديداً للنسخ الخاص بجهاز: backups/<serial>/<التاريخ>_<لاحقة> */
export function makeRunDir(serial: string, suffix: string): string {
  const dir = join(backupsRoot(), safe(serial || 'no-device'), `${stamp()}_${suffix}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

interface Item {
  file: string
  args: string[]
  required: boolean
}

const ITEMS: Item[] = [
  { file: 'getprop.txt', args: ['shell', 'getprop'], required: true },
  { file: 'settings_global.txt', args: ['shell', 'settings', 'list', 'global'], required: true },
  { file: 'settings_secure.txt', args: ['shell', 'settings', 'list', 'secure'], required: false },
  { file: 'settings_system.txt', args: ['shell', 'settings', 'list', 'system'], required: false },
  {
    file: 'apn_carriers.txt',
    args: ['shell', 'content', 'query', '--uri', 'content://telephony/carriers'],
    required: false
  },
  {
    file: 'apn_preferred.txt',
    args: ['shell', 'content', 'query', '--uri', 'content://telephony/carriers/preferapn'],
    required: false
  },
  { file: 'telephony_registry.txt', args: ['shell', 'dumpsys', 'telephony.registry'], required: false },
  { file: 'carrier_config.txt', args: ['shell', 'dumpsys', 'carrier_config'], required: false },
  { file: 'telephony_ims.txt', args: ['shell', 'dumpsys', 'telephony_ims'], required: false },
  { file: 'packages_third_party.txt', args: ['shell', 'pm', 'list', 'packages', '-3'], required: false }
]

export interface SnapshotResult {
  ok: boolean
  dir: string
  saved: string[]
  failed: string[]
  error?: string
}

/**
 * نسخة احتياطية لإعدادات الجهاز والشبكة (نصوص): خصائص النظام، الإعدادات، قائمة APN،
 * حالة الاتصال وإعدادات الشركة. تُحفظ محلياً داخل مجلد النسخ ويمكن الرجوع إليها قبل أي تعديل.
 */
export async function snapshot(serial: string, signal?: AbortSignal): Promise<SnapshotResult> {
  const dir = makeRunDir(serial, 'snapshot')
  const saved: string[] = []
  const failed: string[] = []
  logger.info(`📦 نسخة احتياطية لإعدادات الجهاز ← ${dir}`)

  for (const item of ITEMS) {
    if (signal?.aborted) return { ok: false, dir, saved, failed, error: 'تم الإلغاء' }
    const r = await runAdb(item.args, { serial, quiet: true, timeoutMs: 30_000, signal })
    const text = r.stdout.trim()
    const good = !r.spawnError && r.code === 0 && text.length > 0 && !/Permission Denial|SecurityException/i.test(text)
    if (good) {
      try {
        writeFileSync(join(dir, item.file), r.stdout, 'utf8')
        saved.push(item.file)
        logger.ok(`  ✔ ${item.file}`)
      } catch (e) {
        failed.push(item.file)
        logger.warn(`  ✘ تعذّر حفظ ${item.file}: ${e instanceof Error ? e.message : String(e)}`)
        if (item.required) return { ok: false, dir, saved, failed, error: `تعذّر حفظ ${item.file}` }
      }
    } else {
      failed.push(item.file)
      const why = r.spawnError ?? (r.output.trim().split('\n')[0] || `رمز الخروج ${r.code}`)
      if (item.required) {
        logger.err(`  ✘ ${item.file}: ${why}`)
        return { ok: false, dir, saved, failed, error: `فشل جلب ${item.file}: ${why}` }
      }
      logger.warn(`  ○ ${item.file}: غير متاح على هذا الجهاز (${why})`)
    }
  }

  last.set(serial, { ts: Date.now(), dir })
  logger.ok(`✔ تمت النسخة الاحتياطية (${saved.length} ملف، ${failed.length} غير متاح)`)
  return { ok: true, dir, saved, failed }
}
