import { useState } from 'react'
import { LogConsole } from './components/LogConsole'
import { Sidebar, type PageId } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { Dashboard } from './pages/Dashboard'
import { SectionPage } from './pages/SectionPage'
import { Settings } from './pages/Settings'

function Page({ page }: { page: PageId }): JSX.Element {
  switch (page) {
    case 'dashboard':
      return <Dashboard />
    case '4g':
      return (
        <SectionPage
          section="4g"
          icon="signal"
          title="تفعيل 4G والبيانات"
          subtitle="4G & Data Profiles — وضع الشبكة وإعدادات APN لشبكات اليمن"
        />
      )
    case 'volte':
      return (
        <SectionPage
          section="volte"
          icon="call"
          title="تفعيل VoLTE والصوت"
          subtitle="VoLTE & IMS Tools — فحص وتفعيل الخيارات المدعومة حسب الجهاز"
          notice="نجاح VoLTE يعتمد على دعم الجهاز ودعم شبكة الشريحة له. تأكد من دعم الشركة قبل التفعيل."
        />
      )
    case 'carrier':
      return (
        <SectionPage
          section="carrier"
          icon="lock"
          title="الشرائح وإدارة الشبكة"
          subtitle="Carrier / SIM & Network Utilities — فحص القفل، فك الشبكة بالكود الرسمي، وتهيئة الشريحة"
          notice="فك القفل يتم بالكود الرسمي (NCK) فقط وعلى أجهزة تملكها أو مخوّل بصيانتها. الكود الخاطئ يستهلك محاولات محدودة."
        />
      )
    case 'backup':
      return (
        <SectionPage
          section="backup"
          icon="archive"
          title="النسخ الاحتياطي والأمان"
          subtitle="Backup & Safety First — خذ نسخة قبل أي تعديل"
        />
      )
    case 'settings':
      return <Settings />
  }
}

export default function App(): JSX.Element {
  const [page, setPage] = useState<PageId>('dashboard')
  return (
    <div className="flex h-full w-full bg-ink-900 text-ink-100">
      <Sidebar page={page} onChange={setPage} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-y-auto p-6">
          <Page page={page} />
        </main>
        <LogConsole />
      </div>
    </div>
  )
}
