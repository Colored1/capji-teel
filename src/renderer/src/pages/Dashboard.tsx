import { useApp } from '../state/AppContext'
import { Icon } from '../components/Icons'
import { Pill } from '../components/TopBar'
import { COM_KIND_LABEL } from '../lib/ready'

function Row({ k, v }: { k: string; v?: string }): JSX.Element {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-ink-700/60 py-1.5 text-sm last:border-0">
      <span className="text-ink-400">{k}</span>
      <span className="selectable text-end font-medium" dir="ltr">
        {v || '—'}
      </span>
    </div>
  )
}

export function Dashboard(): JSX.Element {
  const { conn, selectDevice, selectCom, refresh } = useApp()
  if (!conn) return <p className="text-ink-400">جارٍ فحص الاتصال…</p>
  const info = conn.info
  const devices = [
    ...conn.adb.devices.map((d) => ({
      serial: d.serial,
      mode: 'ADB',
      state: d.state,
      label: d.model ?? d.product ?? ''
    })),
    ...conn.fastboot.devices.map((d) => ({ serial: d.serial, mode: 'Fastboot', state: d.mode, label: '' }))
  ]
  const locked = info?.bootloaderLocked
  const modes = [
    conn.adb.devices.some((d) => d.state === 'device') && 'ADB',
    conn.fastboot.devices.length > 0 && 'Fastboot',
    conn.com.ports.length > 0 && 'COM'
  ].filter(Boolean) as string[]

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <span className="rounded-xl bg-brand/10 p-2.5 text-brand">
          <Icon name="cpu" className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-xl font-extrabold">لوحة معلومات الجهاز</h1>
          <p className="text-sm text-ink-400">Device Inspector — الأوضاع المتاحة الآن: {modes.length ? modes.join(' • ') : 'لا شيء'}</p>
        </div>
        <div className="flex-1" />
        <button className="btn btn-primary" onClick={() => void refresh()}>
          <Icon name="refresh" />
          فحص / تحديث الاتصال
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {/* ----- الأجهزة المتصلة ----- */}
        <div className="card">
          <h2 className="mb-3 font-bold">الأجهزة المتصلة (ADB / Fastboot)</h2>
          {devices.length === 0 ? (
            <p className="text-sm text-ink-400">
              لا يوجد جهاز. فعّل «تصحيح USB» ووصّل الكابل، أو أدخل الجهاز بوضع Fastboot.
            </p>
          ) : (
            <ul className="space-y-2">
              {devices.map((d) => {
                const active = d.serial === conn.selectedSerial
                return (
                  <li key={`${d.mode}-${d.serial}`}>
                    <button
                      onClick={() => void selectDevice(d.serial)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-start transition ${
                        active ? 'border-brand/60 bg-brand/10' : 'border-ink-700 hover:bg-ink-700/50'
                      }`}
                    >
                      <Icon name="phone" className="h-5 w-5 text-brand" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold" dir="ltr">
                          {d.serial}
                        </span>
                        <span className="text-xs text-ink-400">{d.label}</span>
                      </span>
                      <span className="rounded border border-ink-600 px-1.5 py-0.5 text-[11px]" dir="ltr">
                        {d.mode}
                      </span>
                      <span
                        className={`text-xs ${d.state === 'device' || d.mode === 'Fastboot' ? 'text-ok' : 'text-warn'}`}
                        dir="ltr"
                      >
                        {d.state}
                      </span>
                    </button>
                    {d.state === 'unauthorized' && (
                      <p className="mt-1 text-xs text-warn">اقبل نافذة «السماح بتصحيح USB» على شاشة الجهاز.</p>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {conn.adb.error && <p className="mt-3 text-xs text-bad">ADB: {conn.adb.error}</p>}
          {conn.fastboot.error && !conn.tools.fastboot.found && (
            <p className="mt-1 text-xs text-warn">Fastboot: {conn.fastboot.error}</p>
          )}
        </div>

        {/* ----- معلومات الجهاز ----- */}
        <div className="card">
          <h2 className="mb-3 font-bold">معلومات الجهاز</h2>
          {info ? (
            <div>
              <Row k="الشركة المصنّعة" v={info.manufacturer} />
              <Row k="الطراز" v={info.model} />
              <Row k="الاسم الداخلي" v={info.codename} />
              <Row k="إصدار أندرويد" v={info.androidVersion ? `${info.androidVersion} (SDK ${info.sdk ?? '?'})` : undefined} />
              <Row k="رقم البيلد" v={info.buildId} />
              <Row k="تحديث الأمان" v={info.securityPatch} />
              <Row k="المعالج / المنصة" v={[info.platform, info.hardware].filter(Boolean).join(' / ')} />
              <Row k="Baseband" v={info.baseband} />
              <Row k="حالة الشريحة" v={info.simState} />
              <Row k="المشغّل" v={[info.operatorName, info.operatorNumeric].filter(Boolean).join(' · ')} />
              <Row k="نوع الشبكة" v={info.networkType} />
              <Row k="قفل البوتلودر" v={locked === '1' ? 'مقفل' : locked === '0' ? 'مفتوح' : undefined} />
              {info.extra && Object.entries(info.extra).map(([k, v]) => <Row key={k} k={`fastboot: ${k}`} v={v} />)}
            </div>
          ) : (
            <p className="text-sm text-ink-400">اختر جهازاً لعرض معلوماته.</p>
          )}
        </div>

        {/* ----- منافذ COM ----- */}
        <div className="card">
          <h2 className="mb-3 font-bold">منافذ COM</h2>
          {conn.com.ports.length === 0 ? (
            <p className="text-sm text-ink-400">لا توجد منافذ COM. وصّل الجهاز بوضع المودم/التشخيص مع التعريف المناسب.</p>
          ) : (
            <ul className="space-y-2">
              {conn.com.ports.map((p) => {
                const active = p.path === conn.selectedCom
                return (
                  <li key={p.path}>
                    <button
                      onClick={() => void selectCom(active ? null : p.path)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-start transition ${
                        active ? 'border-brand/60 bg-brand/10' : 'border-ink-700 hover:bg-ink-700/50'
                      }`}
                    >
                      <span className="w-16 font-mono text-sm font-bold text-brand" dir="ltr">
                        {p.path}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs text-ink-300" dir="ltr">
                        {p.friendlyName ?? p.manufacturer ?? ''}
                      </span>
                      <span
                        className={`rounded border px-1.5 py-0.5 text-[11px] ${
                          p.kind === 'modem' ? 'border-ok/40 text-ok' : p.kind === 'edl' ? 'border-warn/40 text-warn' : 'border-ink-600 text-ink-300'
                        }`}
                      >
                        {COM_KIND_LABEL[p.kind]}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
          <p className="mt-3 text-xs text-ink-400">
            إذا لم تختر منفذاً يُستخدم أول منفذ «مودم (AT)» تلقائياً. انقر منفذاً لتثبيته، وانقره ثانيةً لإلغاء التثبيت.
          </p>
          {conn.com.error && <p className="mt-2 text-xs text-warn">{conn.com.error}</p>}
        </div>

        {/* ----- الأدوات ----- */}
        <div className="card">
          <h2 className="mb-3 font-bold">الأدوات</h2>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-3">
              <Pill on={conn.tools.adb.found} label="adb" />
              <span className="selectable truncate text-xs text-ink-400" dir="ltr">
                {conn.tools.adb.found ? conn.tools.adb.version : conn.tools.adb.error}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Pill on={conn.tools.fastboot.found} label="fastboot" />
              <span className="selectable truncate text-xs text-ink-400" dir="ltr">
                {conn.tools.fastboot.found ? conn.tools.fastboot.version : conn.tools.fastboot.error}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <Pill on={conn.com.backend === 'serialport'} label="serialport (AT)" />
              <span className="text-xs text-ink-400">
                {conn.com.backend === 'serialport' ? 'جاهز لإرسال أوامر AT' : 'غير مثبت — نفّذ npm install'}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
