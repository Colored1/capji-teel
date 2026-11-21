import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import type { LogEntry, LogLevel } from '@shared/types'
import { useApp } from '../state/AppContext'
import { Icon } from './Icons'

const COLORS: Record<LogLevel, string> = {
  cmd: 'text-brand-400',
  out: 'text-ink-200',
  err: 'text-bad',
  ok: 'text-ok',
  warn: 'text-warn',
  info: 'text-info'
}

const time = (ts: number): string => new Date(ts).toLocaleTimeString('en-GB')
const toText = (list: LogEntry[]): string => list.map((e) => `[${time(e.ts)}] ${e.text}`).join('\n')

export function LogConsole(): JSX.Element {
  const { logs, clearLogs, exportLogs } = useApp()
  const [height, setHeight] = useState(260)
  const [collapsed, setCollapsed] = useState(false)
  const [auto, setAuto] = useState(true)
  const [filter, setFilter] = useState('')
  const [note, setNote] = useState<string | null>(null)
  const box = useRef<HTMLDivElement>(null)

  const shown = useMemo(() => {
    const f = filter.trim().toLowerCase()
    const list = f ? logs.filter((e) => e.text.toLowerCase().includes(f)) : logs
    return list.slice(-1500)
  }, [logs, filter])

  useEffect(() => {
    if (auto && box.current) box.current.scrollTop = box.current.scrollHeight
  }, [shown, auto, collapsed])

  const flash = (t: string): void => {
    setNote(t)
    window.setTimeout(() => setNote(null), 2500)
  }

  const startDrag = (e: ReactMouseEvent): void => {
    e.preventDefault()
    const move = (ev: MouseEvent): void =>
      setHeight(Math.min(Math.max(window.innerHeight - ev.clientY, 120), window.innerHeight * 0.7))
    const up = (): void => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }

  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(toText(shown))
      flash('تم نسخ السجل')
    } catch {
      flash('تعذّر النسخ')
    }
  }

  const doExport = async (): Promise<void> => {
    try {
      const p = await exportLogs()
      if (p) flash(`تم الحفظ: ${p}`)
    } catch (e) {
      flash(e instanceof Error ? e.message : 'تعذّر التصدير')
    }
  }

  return (
    <section
      className="flex shrink-0 flex-col border-t border-ink-700 bg-ink-950"
      style={{ height: collapsed ? 40 : height }}
    >
      {!collapsed && (
        <div className="h-1.5 cursor-row-resize bg-ink-800 hover:bg-brand/50" onMouseDown={startDrag} />
      )}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Icon name="terminal" className="h-4 w-4 text-brand" />
        <span className="text-sm font-semibold">سجل العمليات المباشر</span>
        <span className="text-xs text-ink-400" dir="ltr">
          {logs.length}
        </span>
        {note && <span className="ms-2 text-xs text-ok">{note}</span>}
        <div className="flex-1" />
        {!collapsed && (
          <>
            <input
              className="field !w-44 !py-1 text-xs"
              placeholder="بحث في السجل…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <label className="flex items-center gap-1 text-xs text-ink-300">
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
              تمرير تلقائي
            </label>
            <button className="btn !py-1 text-xs" onClick={() => void copy()}>
              <Icon name="copy" className="h-3.5 w-3.5" />
              نسخ
            </button>
            <button className="btn !py-1 text-xs" onClick={() => void doExport()}>
              <Icon name="download" className="h-3.5 w-3.5" />
              تصدير
            </button>
            <button className="btn !py-1 text-xs" onClick={() => void clearLogs()}>
              <Icon name="trash" className="h-3.5 w-3.5" />
              مسح
            </button>
          </>
        )}
        <button className="btn !py-1 text-xs" onClick={() => setCollapsed(!collapsed)}>
          <Icon name="chevron" className={`h-3.5 w-3.5 transition ${collapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>
      {!collapsed && (
        <div
          ref={box}
          dir="ltr"
          className="selectable min-h-0 flex-1 overflow-y-auto px-3 pb-2 font-mono text-[12.5px] leading-5"
        >
          {shown.length === 0 && <div className="text-ink-500">لا توجد عمليات بعد…</div>}
          {shown.map((e) => (
            <div key={e.id} className={`whitespace-pre-wrap break-all ${COLORS[e.level]}`}>
              <span className="me-2 text-ink-500">{time(e.ts)}</span>
              {e.text}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
