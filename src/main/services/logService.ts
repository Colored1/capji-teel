import { appendFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import type { LogEntry, LogLevel } from '../../shared/types'

const MAX_ENTRIES = 5000

/** سجل العمليات: ذاكرة (للواجهة) + ملف يومي على القرص */
export class LogService {
  private entries: LogEntry[] = []
  private nextId = 1
  private listener: ((e: LogEntry) => void) | null = null
  private logsDir: string

  constructor(logsDir: string) {
    this.logsDir = logsDir
  }

  onEntry(cb: (e: LogEntry) => void): void {
    this.listener = cb
  }

  all(): LogEntry[] {
    return this.entries
  }

  clear(): void {
    this.entries = []
  }

  add(level: LogLevel, text: string): void {
    const entry: LogEntry = { id: this.nextId++, ts: Date.now(), level, text }
    this.entries.push(entry)
    if (this.entries.length > MAX_ENTRIES) this.entries.splice(0, this.entries.length - MAX_ENTRIES)
    this.listener?.(entry)
    void this.persist(entry)
  }

  info(t: string): void { this.add('info', t) }
  cmd(t: string): void { this.add('cmd', t) }
  out(t: string): void { this.add('out', t) }
  err(t: string): void { this.add('err', t) }
  ok(t: string): void { this.add('ok', t) }
  warn(t: string): void { this.add('warn', t) }

  /** نص كامل للتصدير */
  toText(): string {
    return this.entries.map((e) => `${formatTs(e.ts)} [${e.level.toUpperCase()}] ${e.text}`).join('\n')
  }

  private async persist(e: LogEntry): Promise<void> {
    try {
      await mkdir(this.logsDir, { recursive: true })
      const day = new Date(e.ts).toISOString().slice(0, 10)
      await appendFile(join(this.logsDir, `capji-${day}.log`), `${formatTs(e.ts)} [${e.level.toUpperCase()}] ${e.text}\n`, 'utf8')
    } catch {
      /* فشل كتابة السجل لا يجب أن يوقف التطبيق */
    }
  }
}

export function formatTs(ts: number): string {
  const d = new Date(ts)
  const p = (n: number, l = 2) => String(n).padStart(l, '0')
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}.${p(d.getMilliseconds(), 3)}`
}
