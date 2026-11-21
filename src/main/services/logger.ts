import { EventEmitter } from 'node:events'
import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs'
import { join } from 'node:path'
import type { LogEntry, LogLevel } from '../../shared/types'

const MAX_ENTRIES = 5000
const pad = (n: number): string => String(n).padStart(2, '0')

/**
 * سجل العمليات: يحتفظ بآخر 5000 سطر في الذاكرة، يكتبها إلى ملف يومي،
 * ويبثّها للواجهة. القيم السرية (مثل كود فك الشبكة) تُستبدل بـ •••• قبل التسجيل.
 */
class Logger extends EventEmitter {
  private buf: LogEntry[] = []
  private seq = 0
  private stream: WriteStream | null = null
  private secrets = new Set<string>()

  init(dir: string): void {
    try {
      mkdirSync(dir, { recursive: true })
      const d = new Date()
      const name = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.log`
      this.stream = createWriteStream(join(dir, name), { flags: 'a' })
    } catch {
      this.stream = null
    }
  }

  addSecret(value: string): void {
    if (value && value.length >= 3) this.secrets.add(value)
  }

  clearSecrets(): void {
    this.secrets.clear()
  }

  mask(text: string): string {
    let t = text
    for (const s of this.secrets) t = t.split(s).join('••••')
    return t
  }

  log(level: LogLevel, text: string): void {
    const lines = this.mask(String(text)).replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n')
    const entries: LogEntry[] = []
    for (const line of lines) {
      if (line === '' && lines.length > 1) continue
      const entry: LogEntry = { id: ++this.seq, ts: Date.now(), level, text: line }
      this.buf.push(entry)
      entries.push(entry)
      this.stream?.write(`${this.format(entry)}\n`)
    }
    if (this.buf.length > MAX_ENTRIES) this.buf.splice(0, this.buf.length - MAX_ENTRIES)
    if (entries.length) this.emit('entries', entries)
  }

  info(t: string): void {
    this.log('info', t)
  }
  cmd(t: string): void {
    this.log('cmd', t)
  }
  out(t: string): void {
    this.log('out', t)
  }
  err(t: string): void {
    this.log('err', t)
  }
  ok(t: string): void {
    this.log('ok', t)
  }
  warn(t: string): void {
    this.log('warn', t)
  }

  history(): LogEntry[] {
    return this.buf.slice()
  }

  clear(): void {
    this.buf = []
  }

  private format(e: LogEntry): string {
    const d = new Date(e.ts)
    const time = `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
    return `[${time}] ${e.level.toUpperCase().padEnd(4)} ${e.text}`
  }

  toText(): string {
    return this.buf.map((e) => this.format(e)).join('\n')
  }
}

export const logger = new Logger()
