import { useState } from 'react'
import type { Profile } from '@shared/types'
import { Icon } from './Icons'

const WORD = 'تأكيد'

interface Props {
  profile: Profile
  deviceLabel: string
  onCancel: () => void
  onConfirm: (o: { skipBackup: boolean }) => void
}

/** نافذة تأكيد للعمليات الحساسة: تعرض الجهاز المستهدف والتحذيرات وحالة النسخ الاحتياطي */
export function ConfirmDialog({ profile, deviceLabel, onCancel, onConfirm }: Props): JSX.Element {
  const [typed, setTyped] = useState('')
  const [skip, setSkip] = useState(false)
  const high = profile.risk === 'high'
  const canGo = !high || typed.trim() === WORD

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-ink-600 bg-ink-800 p-6 shadow-2xl">
        <div className="mb-4 flex items-center gap-3">
          <span className={`rounded-lg p-2 ${high ? 'bg-bad/15 text-bad' : 'bg-warn/15 text-warn'}`}>
            <Icon name="warn" className="h-6 w-6" />
          </span>
          <div>
            <h3 className="text-lg font-bold">تأكيد التنفيذ</h3>
            <p className="text-sm text-ink-300">{profile.title}</p>
          </div>
        </div>

        <div className="mb-3 rounded-lg bg-ink-900 px-3 py-2 text-sm">
          <span className="text-ink-400">الجهاز المستهدف: </span>
          <span className="font-semibold">{deviceLabel}</span>
        </div>

        {profile.warnings.length > 0 && (
          <ul className="mb-3 space-y-1.5 text-sm text-warn">
            {profile.warnings.map((w, i) => (
              <li key={i} className="flex gap-2">
                <span>•</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        )}

        {profile.backupFirst && (
          <label className="mb-3 flex items-start gap-2 rounded-lg border border-ink-700 bg-ink-900 p-3 text-sm">
            <input type="checkbox" className="mt-1" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
            <span>
              <span className="block font-semibold">
                {skip ? 'سيتم تخطي النسخة الاحتياطية (غير مستحسن)' : 'ستُؤخذ نسخة احتياطية تلقائية قبل التنفيذ'}
              </span>
              <span className="text-xs text-ink-400">علّم هنا فقط إن كنت متأكداً أنك لا تحتاج نسخة.</span>
            </span>
          </label>
        )}

        {high && (
          <div className="mb-3">
            <label className="label">
              عملية حساسة — اكتب كلمة «{WORD}» للمتابعة
            </label>
            <input className="field" value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          <button className="btn" onClick={onCancel}>
            إلغاء
          </button>
          <button
            className={`btn ${high ? 'btn-danger' : 'btn-primary'}`}
            disabled={!canGo}
            onClick={() => onConfirm({ skipBackup: skip })}
          >
            <Icon name="play" />
            تنفيذ الآن
          </button>
        </div>
      </div>
    </div>
  )
}
