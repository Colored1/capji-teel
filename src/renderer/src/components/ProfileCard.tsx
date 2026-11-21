import { useMemo, useState } from 'react'
import type { Profile, StepStatus } from '@shared/types'
import { MODE_LABEL, RISK_LABEL, checkReady } from '../lib/ready'
import { useApp } from '../state/AppContext'
import { ConfirmDialog } from './ConfirmDialog'
import { Icon } from './Icons'

const RISK_STYLE = {
  low: 'border-ok/40 text-ok bg-ok/10',
  medium: 'border-warn/40 text-warn bg-warn/10',
  high: 'border-bad/40 text-bad bg-bad/10'
} as const

function StepIcon({ status }: { status?: StepStatus }): JSX.Element {
  if (status === 'running') return <span className="h-3 w-3 animate-pulse rounded-full bg-brand" />
  if (status === 'ok') return <Icon name="check" className="h-3.5 w-3.5 text-ok" />
  if (status === 'fail') return <Icon name="x" className="h-3.5 w-3.5 text-bad" />
  if (status === 'skipped') return <span className="h-2 w-2 rounded-full bg-ink-500" />
  return <span className="h-2 w-2 rounded-full border border-ink-500" />
}

export function ProfileCard({ profile }: { profile: Profile }): JSX.Element {
  const { conn, runs, run, cancel, anyRunning } = useApp()
  const [inputs, setInputs] = useState<Record<string, string>>(() =>
    Object.fromEntries(profile.inputs.map((i) => [i.id, i.default ?? '']))
  )
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const state = runs[profile.id]
  const running = !!state?.running
  const ready = useMemo(() => checkReady(profile, conn), [profile, conn])
  const disabled = !ready.ok || (anyRunning && !running)

  const deviceLabel = conn?.info
    ? `${[conn.info.manufacturer, conn.info.model].filter(Boolean).join(' ') || 'جهاز'} (${conn.info.serial})`
    : (conn?.selectedCom ?? 'غير محدد')

  const start = (skipBackup: boolean, confirmed: boolean): void => {
    setConfirm(false)
    setOpen(true)
    void run(profile, { inputs, confirmed, skipBackup })
  }

  const onExecute = (): void => {
    for (const def of profile.inputs) {
      if (def.required && !(inputs[def.id] ?? '').trim()) {
        setFormError(`الحقل «${def.label}» مطلوب`)
        return
      }
      if (def.pattern && inputs[def.id] && !new RegExp(def.pattern).test(inputs[def.id])) {
        setFormError(`القيمة في «${def.label}» غير صالحة`)
        return
      }
    }
    setFormError(null)
    if (profile.risk !== 'low' || profile.backupFirst || profile.warnings.length > 0) setConfirm(true)
    else start(false, true)
  }

  const result = state?.result
  const done = Object.values(state?.steps ?? {}).filter((s) => s === 'ok' || s === 'fail' || s === 'skipped').length

  return (
    <div className="card">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold">{profile.title}</h3>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${RISK_STYLE[profile.risk]}`}>
              {RISK_LABEL[profile.risk]}
            </span>
            {profile.requires.map((m) => (
              <span key={m} className="rounded border border-ink-600 px-1.5 py-0.5 text-[11px] text-ink-300" dir="ltr">
                {MODE_LABEL[m]}
              </span>
            ))}
            {profile.backupFirst && (
              <span className="rounded border border-info/40 px-1.5 py-0.5 text-[11px] text-info">نسخة تلقائية</span>
            )}
          </div>
          {profile.description && <p className="mt-1 text-sm text-ink-300">{profile.description}</p>}
        </div>
        <div className="flex shrink-0 gap-2">
          {running ? (
            <button className="btn btn-danger" onClick={() => void cancel(profile.id)}>
              <Icon name="stop" />
              إلغاء
            </button>
          ) : (
            <button
              className={`btn ${profile.risk === 'high' ? 'btn-danger' : 'btn-primary'}`}
              disabled={disabled}
              onClick={onExecute}
              title={!ready.ok ? ready.reasons.join(' — ') : undefined}
            >
              <Icon name="play" />
              تنفيذ
            </button>
          )}
        </div>
      </div>

      {!ready.ok && <p className="mt-2 text-xs text-warn">غير جاهز: {ready.reasons.join(' — ')}</p>}

      {profile.inputs.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
          {profile.inputs.map((def) => (
            <div key={def.id}>
              <label className="label">{def.label}</label>
              {def.type === 'select' ? (
                <select
                  className="field"
                  value={inputs[def.id]}
                  onChange={(e) => setInputs({ ...inputs, [def.id]: e.target.value })}
                >
                  {def.options?.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  className="field"
                  dir="ltr"
                  type={def.type === 'password' ? 'password' : def.type === 'number' ? 'number' : 'text'}
                  placeholder={def.placeholder}
                  value={inputs[def.id]}
                  autoComplete="off"
                  onChange={(e) => setInputs({ ...inputs, [def.id]: e.target.value })}
                />
              )}
              {def.help && <p className="mt-1 text-[11px] text-ink-400">{def.help}</p>}
            </div>
          ))}
        </div>
      )}
      {formError && <p className="mt-2 text-sm text-bad">{formError}</p>}

      <button
        className="mt-3 flex items-center gap-1 text-xs text-ink-400 hover:text-ink-200"
        onClick={() => setOpen(!open)}
      >
        <Icon name="chevron" className={`h-3.5 w-3.5 transition ${open ? 'rotate-180' : ''}`} />
        الخطوات ({profile.steps.length})
        {running && <span className="ms-2 text-brand">{done}/{profile.steps.length}</span>}
      </button>

      {open && (
        <ol className="mt-2 space-y-1">
          {profile.backupFirst && state?.steps['auto-backup'] && (
            <li className="flex items-center gap-2 text-sm">
              <StepIcon status={state.steps['auto-backup']} />
              <span className="text-info">نسخة احتياطية تلقائية</span>
            </li>
          )}
          {profile.steps.map((s, i) => {
            const r = result?.steps.find((x) => x.stepId === s.id)
            return (
              <li key={s.id} className="text-sm">
                <div className="flex items-center gap-2">
                  <StepIcon status={state?.steps[s.id]} />
                  <span className="text-ink-400">{i + 1}.</span>
                  <span>{s.label}</span>
                  {r && <span className="text-[11px] text-ink-400">{(r.durationMs / 1000).toFixed(1)}ث</span>}
                </div>
                {r?.status === 'fail' && (
                  <div className="ms-7 mt-0.5 text-xs">
                    <span className="text-bad">{r.error}</span>
                    {r.hint && <div className="text-warn">💡 {r.hint}</div>}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}

      {result && !running && (
        <div
          className={`mt-3 rounded-lg px-3 py-2 text-sm ${
            result.ok
              ? 'bg-ok/10 text-ok'
              : result.cancelled
                ? 'bg-warn/10 text-warn'
                : 'bg-bad/10 text-bad'
          }`}
        >
          {result.ok ? '✔ اكتملت العملية بنجاح' : result.cancelled ? '⏹ أُلغيت العملية' : `✘ لم تكتمل: ${result.error ?? 'راجع الخطوة الفاشلة وسجل العمليات'}`}
        </div>
      )}

      {confirm && (
        <ConfirmDialog
          profile={profile}
          deviceLabel={deviceLabel}
          onCancel={() => setConfirm(false)}
          onConfirm={(o) => start(o.skipBackup, true)}
        />
      )}
    </div>
  )
}
