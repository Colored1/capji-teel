import { useApp } from '../state/AppContext'

/** اختيار شركة الاتصالات و APN: يغذّي القوالب التي تستخدم {{carrier.*}} و {{apn.*}} */
export function ApnPicker(): JSX.Element | null {
  const { bundle, selection, setSelection, conn } = useApp()
  if (!bundle) return null
  if (bundle.carriers.length === 0) {
    return (
      <div className="card mb-4 text-sm text-warn">
        لا توجد شركات اتصالات محمّلة. تحقق من ملفات apn/*.json في مجلد الإعدادات (الإعدادات ← فتح مجلد القوالب).
      </div>
    )
  }
  const carrier = bundle.carriers.find((c) => c.id === selection.carrierId) ?? bundle.carriers[0]
  const apn = carrier.apns.find((a) => a.id === selection.apnId) ?? carrier.apns[0]
  const detected = conn?.info?.operatorNumeric?.split(',')[0]?.trim()

  const autoDetect = (): void => {
    const m = bundle.carriers.find((c) => c.mcc + c.mnc === detected)
    if (m) setSelection({ carrierId: m.id, apnId: m.apns[0]?.id })
  }

  const rows: Array<[string, string]> = apn
    ? [
        ['Name', apn.name],
        ['APN', apn.apn],
        ['MCC / MNC', `${carrier.mcc} / ${carrier.mnc}`],
        ['Type', apn.type],
        ['Protocol', `${apn.protocol} (roaming: ${apn.roamingProtocol})`],
        ['Auth', apn.authType],
        ['User', apn.user || '—'],
        ['Password', apn.password ? '••••' : '—']
      ]
    : []

  return (
    <div className="card mb-4">
      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[200px] flex-1">
          <label className="label">شركة الاتصالات</label>
          <select
            className="field"
            value={carrier.id}
            onChange={(e) => {
              const c = bundle.carriers.find((x) => x.id === e.target.value)
              if (c) setSelection({ carrierId: c.id, apnId: c.apns[0]?.id })
            }}
          >
            {bundle.carriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameAr ?? c.name} — {c.mcc}-{c.mnc}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px] flex-1">
          <label className="label">نقطة الوصول (APN)</label>
          <select
            className="field"
            value={apn?.id ?? ''}
            onChange={(e) => setSelection({ carrierId: carrier.id, apnId: e.target.value })}
          >
            {carrier.apns.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
                {a.verified ? '' : ' (غير موثّق)'}
              </option>
            ))}
          </select>
        </div>
        <button className="btn" onClick={autoDetect} disabled={!detected}>
          كشف من الشريحة {detected ? <span dir="ltr">({detected})</span> : null}
        </button>
      </div>

      {apn && (
        <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs md:grid-cols-4" dir="ltr">
          {rows.map(([k, v]) => (
            <div key={k} className="flex gap-2">
              <span className="text-ink-400">{k}:</span>
              <span className="selectable truncate text-ink-100">{v}</span>
            </div>
          ))}
        </div>
      )}
      {apn && !apn.verified && (
        <p className="mt-2 text-xs text-warn">
          ⚠ هذه القيم غير موثّقة من مصدر رسمي{apn.note ? ` — ${apn.note}` : ''}. عدّلها من ملف apn/yemen.json عند اللزوم.
        </p>
      )}
      {apn?.verified && apn.note && <p className="mt-2 text-xs text-ok">✔ {apn.note}</p>}
    </div>
  )
}
