import type { ApnEntry, Carrier, DeviceInfo } from '../../shared/types'

export interface TemplateCtx {
  serial?: string
  comPort?: string
  carrier?: Carrier
  apn?: ApnEntry
  inputs: Record<string, string>
  info?: DeviceInfo | null
  backupDir?: string
}

/**
 * أنماط التعويض:
 *  plain : وسائط (args) تمرَّر كما هي بدون shell على الكمبيوتر.
 *  shell : أمر يُنفَّذ داخل shell الجهاز — تُهرَّب علامة ' حتى لا تكسر الاقتباس.
 *          لذلك اكتب المتغيرات داخل علامات اقتباس مفردة: '{{apn.name}}'
 *  at    : أمر AT — يُرفض أي " أو سطر جديد داخل القيمة.
 *  regex : للحقول expect/reject — تُهرَّب رموز التعبير النمطي.
 */
export type TemplateMode = 'plain' | 'shell' | 'at' | 'regex'

const PLACEHOLDER = /\{\{\s*([\w.]+)\s*\}\}/g

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function stamp(): string {
  const d = new Date()
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

function lookup(key: string, ctx: TemplateCtx): string | undefined {
  const [ns, ...rest] = key.split('.')
  const name = rest.join('.')
  switch (ns) {
    case 'serial':
      return ctx.serial
    case 'comPort':
      return ctx.comPort
    case 'timestamp':
      return stamp()
    case 'backupDir':
      return ctx.backupDir
    case 'input':
      return ctx.inputs[name]
    case 'carrier': {
      if (!ctx.carrier) throw new Error('هذا القالب يحتاج اختيار شركة الاتصالات أولاً.')
      if (name === 'mccmnc') return ctx.carrier.mcc + ctx.carrier.mnc
      const v = (ctx.carrier as unknown as Record<string, unknown>)[name]
      return typeof v === 'string' ? v : undefined
    }
    case 'apn': {
      if (!ctx.apn) throw new Error('هذا القالب يحتاج اختيار نقطة الوصول (APN) أولاً.')
      const v = (ctx.apn as unknown as Record<string, unknown>)[name]
      return typeof v === 'string' ? v : v === undefined ? '' : String(v)
    }
    case 'device': {
      const v = (ctx.info as unknown as Record<string, unknown> | null | undefined)?.[name]
      return typeof v === 'string' ? v : undefined
    }
    default:
      return undefined
  }
}

function escapeFor(value: string, mode: TemplateMode, key: string): string {
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value) || /[\r\n]/.test(value)) {
    throw new Error(`القيمة {{${key}}} تحتوي على أحرف تحكم غير مسموحة.`)
  }
  switch (mode) {
    case 'shell':
      return value.replace(/'/g, `'\\''`)
    case 'at':
      if (value.includes('"')) throw new Error(`القيمة {{${key}}} تحتوي على " غير مسموحة في أوامر AT.`)
      return value
    case 'regex':
      return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    default:
      return value
  }
}

/** يستبدل {{متغير}} بقيمته. أي متغير غير معروف يوقف التنفيذ برسالة واضحة. */
export function resolveTemplate(tpl: string, ctx: TemplateCtx, mode: TemplateMode = 'plain'): string {
  return tpl.replace(PLACEHOLDER, (_m, key: string) => {
    const v = lookup(key, ctx)
    if (v === undefined) throw new Error(`متغير غير معروف أو غير متاح في القالب: {{${key}}}`)
    return escapeFor(v, mode, key)
  })
}

/** يلفّ أمراً ليُنفَّذ بصلاحية Root: su -c '...' */
export function wrapSu(command: string): string {
  return `su -c '${command.replace(/'/g, `'\\''`)}'`
}
