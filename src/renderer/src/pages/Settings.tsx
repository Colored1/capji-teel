import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/types'
import { Icon } from '../components/Icons'
import { useApp } from '../state/AppContext'

export function Settings(): JSX.Element {
  const { settings, saveSettings, bundle, reloadProfiles } = useApp()
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [form, setForm] = useState({ adbPath: '', fastbootPath: '', pollIntervalMs: 3000, autoBackupMaxAgeMin: 30 })
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void window.capji.app.info().then(setInfo)
  }, [])
  useEffect(() => {
    if (settings) setForm({ ...settings })
  }, [settings])

  const flash = (t: string): void => {
    setMsg(t)
    window.setTimeout(() => setMsg(null), 3000)
  }
  const guard = async (fn: () => Promise<void>, ok: string): Promise<void> => {
    try {
      await fn()
      flash(ok)
    } catch (e) {
      flash(e instanceof Error ? e.message : String(e))
    }
  }

  return (
    <div className="max-w-3xl">
      <div className="mb-5 flex items-center gap-3">
        <span className="rounded-xl bg-brand/10 p-2.5 text-brand">
          <Icon name="settings" className="h-6 w-6" />
        </span>
        <h1 className="text-xl font-extrabold">الإعدادات</h1>
        {msg && <span className="ms-3 text-sm text-ok">{msg}</span>}
      </div>

      <div className="card mb-4 space-y-3">
        <h2 className="font-bold">مسارات الأدوات</h2>
        <p className="text-xs text-ink-400">اتركها فارغة ليبحث البرنامج تلقائياً (resources/tools ثم PATH).</p>
        <div>
          <label className="label">مسار adb.exe</label>
          <input className="field" dir="ltr" value={form.adbPath} onChange={(e) => setForm({ ...form, adbPath: e.target.value })} placeholder="C:\platform-tools\adb.exe" />
        </div>
        <div>
          <label className="label">مسار fastboot.exe</label>
          <input className="field" dir="ltr" value={form.fastbootPath} onChange={(e) => setForm({ ...form, fastbootPath: e.target.value })} placeholder="C:\platform-tools\fastboot.exe" />
        </div>
      </div>

      <div className="card mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <label className="label">فاصل فحص الاتصال (مللي ثانية)</label>
          <input className="field" dir="ltr" type="number" min={1500} max={30000} step={500} value={form.pollIntervalMs} onChange={(e) => setForm({ ...form, pollIntervalMs: Number(e.target.value) })} />
        </div>
        <div>
          <label className="label">عمر النسخة الاحتياطية الحديثة (دقائق، 0 = دائماً نسخة جديدة)</label>
          <input className="field" dir="ltr" type="number" min={0} max={1440} value={form.autoBackupMaxAgeMin} onChange={(e) => setForm({ ...form, autoBackupMaxAgeMin: Number(e.target.value) })} />
        </div>
        <div className="md:col-span-2">
          <button className="btn btn-primary" onClick={() => void guard(() => saveSettings(form), 'تم حفظ الإعدادات')}>
            حفظ الإعدادات
          </button>
        </div>
      </div>

      <div className="card mb-4">
        <h2 className="mb-2 font-bold">القوالب وملفات JSON</h2>
        <p className="mb-3 text-sm text-ink-300">
          محمّل الآن: {bundle?.profiles.length ?? 0} قالب • {bundle?.carriers.length ?? 0} شركة. عدّل الملفات ثم اضغط «إعادة التحميل» (بدون إعادة تشغيل).
        </p>
        <div className="flex flex-wrap gap-2">
          <button className="btn" onClick={() => void guard(() => window.capji.app.openDataFolder(), 'تم فتح المجلد')}>
            <Icon name="folder" />
            فتح مجلد القوالب
          </button>
          <button className="btn" onClick={() => void guard(reloadProfiles, 'تمت إعادة تحميل القوالب')}>
            <Icon name="refresh" />
            إعادة تحميل القوالب
          </button>
          <button className="btn" onClick={() => void guard(() => window.capji.app.openBackupsFolder(), 'تم فتح المجلد')}>
            <Icon name="archive" />
            فتح مجلد النسخ الاحتياطي
          </button>
        </div>
        {bundle && bundle.errors.length > 0 && (
          <div className="mt-3 rounded-lg border border-bad/40 bg-bad/10 p-3 text-xs text-bad">
            <div className="mb-1 font-bold">أخطاء في ملفات الإعدادات (القوالب الخاطئة تُتجاهل):</div>
            <ul className="selectable space-y-1" dir="ltr">
              {bundle.errors.map((e, i) => (
                <li key={i}>• {e}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {info && (
        <div className="card text-xs text-ink-400" dir="ltr">
          <div>{info.name} v{info.version} ({info.platform})</div>
          <div className="selectable">data: {info.dataDir}</div>
          <div className="selectable">backups: {info.backupsDir}</div>
          <div className="selectable">logs: {info.logsDir}</div>
        </div>
      )}
    </div>
  )
}
