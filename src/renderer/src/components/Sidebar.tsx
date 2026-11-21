import { Icon, type IconName } from './Icons'
import { Logo } from './Logo'

export type PageId = 'dashboard' | '4g' | 'volte' | 'carrier' | 'backup' | 'settings'

const ITEMS: Array<{ id: PageId; label: string; sub: string; icon: IconName }> = [
  { id: 'dashboard', label: 'لوحة الجهاز', sub: 'Device Inspector', icon: 'cpu' },
  { id: '4g', label: 'الشبكة و4G', sub: '4G & Data / APN', icon: 'signal' },
  { id: 'volte', label: 'VoLTE والصوت', sub: 'VoLTE & IMS', icon: 'call' },
  { id: 'carrier', label: 'الشرائح والقفل', sub: 'Carrier / SIM', icon: 'lock' },
  { id: 'backup', label: 'النسخ الاحتياطي', sub: 'Backup & Safety', icon: 'archive' },
  { id: 'settings', label: 'الإعدادات', sub: 'Settings', icon: 'settings' }
]

export function Sidebar({ page, onChange }: { page: PageId; onChange: (p: PageId) => void }): JSX.Element {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-s border-ink-700 bg-ink-950/60">
      <div className="px-4 pb-5 pt-5">
        <Logo />
      </div>
      <nav className="flex-1 space-y-1 px-3">
        {ITEMS.map((it) => {
          const active = it.id === page
          return (
            <button
              key={it.id}
              onClick={() => onChange(it.id)}
              className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start transition ${
                active ? 'bg-brand/10 text-brand shadow-glow' : 'text-ink-200 hover:bg-ink-800'
              }`}
            >
              <Icon name={it.icon} className="h-5 w-5 shrink-0" />
              <span className="leading-tight">
                <span className="block text-sm font-semibold">{it.label}</span>
                <span className="block text-[10px] text-ink-400" dir="ltr">
                  {it.sub}
                </span>
              </span>
            </button>
          )
        })}
      </nav>
      <div className="px-4 py-3 text-[11px] leading-relaxed text-ink-400">
        <div dir="ltr">CAPji teel · v1.0.0</div>
        <div>تطوير: أحمد الارحبي — CAPJI كابجي</div>
      </div>
    </aside>
  )
}
