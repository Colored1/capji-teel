import { useState } from 'react'
import { useApp } from '../state/AppContext'
import { Icon } from './Icons'

export function Pill({ on, label, detail }: { on: boolean; label: string; detail?: string }): JSX.Element {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs ${
        on ? 'border-ok/40 bg-ok/10 text-ok' : 'border-ink-600 bg-ink-800 text-ink-400'
      }`}
    >
      <span className={`h-2 w-2 rounded-full ${on ? 'bg-ok' : 'bg-ink-500'}`} />
      <span className="font-semibold" dir="ltr">
        {label}
      </span>
      {detail && <span className="opacity-80">{detail}</span>}
    </span>
  )
}

export function TopBar(): JSX.Element {
  const { conn, refresh } = useApp()
  const [busy, setBusy] = useState(false)
  const adbReady = conn?.adb.devices.filter((d) => d.state === 'device').length ?? 0
  const fb = conn?.fastboot.devices.length ?? 0
  const com = conn?.com.ports.length ?? 0
  const info = conn?.info

  const doRefresh = async (): Promise<void> => {
    setBusy(true)
    try {
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  return (
    <header className="flex items-center gap-3 border-b border-ink-700 bg-ink-850 px-6 py-3">
      <Pill on={adbReady > 0} label="ADB" detail={adbReady ? String(adbReady) : undefined} />
      <Pill on={fb > 0} label="Fastboot" detail={fb ? String(fb) : undefined} />
      <Pill on={com > 0} label="COM" detail={com ? String(com) : undefined} />
      <div className="mx-3 h-6 w-px bg-ink-700" />
      <div className="min-w-0 flex-1 truncate text-sm text-ink-200">
        {info ? (
          <>
            <span className="font-semibold text-ink-100">
              {[info.manufacturer, info.model].filter(Boolean).join(' ') || 'جهاز غير معروف'}
            </span>
            <span className="ms-3 text-xs text-ink-400" dir="ltr">
              {info.serial}
            </span>
          </>
        ) : (
          <span className="text-ink-400">لا يوجد جهاز محدد — وصّل الجهاز واضغط تحديث</span>
        )}
      </div>
      <button className="btn" onClick={doRefresh} disabled={busy}>
        <Icon name="refresh" className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
        تحديث الاتصال
      </button>
    </header>
  )
}
