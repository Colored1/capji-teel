import type { ReactNode } from 'react'
import type { SectionId } from '@shared/types'
import { ApnPicker } from '../components/ApnPicker'
import { Icon, type IconName } from '../components/Icons'
import { ProfileCard } from '../components/ProfileCard'
import { useApp } from '../state/AppContext'

interface Props {
  section: SectionId
  title: string
  subtitle: string
  icon: IconName
  notice?: string
  extra?: ReactNode
}

/**
 * صفحة عامة تعرض كل قوالب قسم معين تلقائياً من ملفات JSON.
 * إضافة قالب جديد = إضافة عنصر في ملف JSON فقط، بدون تعديل الواجهة.
 */
export function SectionPage({ section, title, subtitle, icon, notice, extra }: Props): JSX.Element {
  const { bundle } = useApp()
  const profiles = bundle?.profiles.filter((p) => p.section === section) ?? []
  const needsApn = profiles.some((p) => p.needsApn)

  return (
    <div>
      <div className="mb-5 flex items-center gap-3">
        <span className="rounded-xl bg-brand/10 p-2.5 text-brand">
          <Icon name={icon} className="h-6 w-6" />
        </span>
        <div>
          <h1 className="text-xl font-extrabold">{title}</h1>
          <p className="text-sm text-ink-400">{subtitle}</p>
        </div>
      </div>

      {notice && (
        <div className="mb-4 flex gap-2 rounded-xl border border-warn/30 bg-warn/5 p-3 text-sm text-warn">
          <Icon name="shield" className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {needsApn && <ApnPicker />}
      {extra}

      {!bundle && <p className="text-ink-400">جارٍ تحميل القوالب…</p>}
      {bundle && profiles.length === 0 && (
        <p className="text-ink-400">لا توجد قوالب في هذا القسم. أضف ملف JSON في مجلد profiles.</p>
      )}
      <div className="space-y-4">
        {profiles.map((p) => (
          <ProfileCard key={p.id} profile={p} />
        ))}
      </div>
    </div>
  )
}
