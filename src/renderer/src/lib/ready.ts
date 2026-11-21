import type { ConnectionState, Profile } from '@shared/types'

export interface Readiness {
  ok: boolean
  reasons: string[]
}

/** هل يمكن تشغيل هذا القالب الآن؟ (نفس منطق الفحص في Main، لإظهار السبب قبل الضغط) */
export function checkReady(profile: Profile, conn: ConnectionState | null): Readiness {
  if (!conn) return { ok: false, reasons: ['جارٍ تهيئة الاتصال…'] }
  const reasons: string[] = []
  const sel = conn.selectedSerial
  for (const m of profile.requires) {
    if (m === 'adb') {
      if (!conn.tools.adb.found) reasons.push('أداة adb غير موجودة')
      else {
        const d = conn.adb.devices.find((x) => x.serial === sel)
        if (!d) reasons.push('لا يوجد جهاز ADB محدد')
        else if (d.state === 'unauthorized') reasons.push('اقبل تصحيح USB على الجهاز')
        else if (d.state !== 'device') reasons.push(`حالة ADB: ${d.state}`)
      }
    } else if (m === 'fastboot') {
      if (!conn.tools.fastboot.found) reasons.push('أداة fastboot غير موجودة')
      else if (!conn.fastboot.devices.some((x) => x.serial === sel)) reasons.push('الجهاز ليس في وضع Fastboot')
    } else if (m === 'com') {
      if (conn.com.ports.length === 0) reasons.push('لا يوجد منفذ COM')
      else if (!conn.selectedCom && !conn.com.ports.some((p) => p.kind === 'modem'))
        reasons.push('اختر منفذ مودم (COM) من لوحة الجهاز')
    }
  }
  return { ok: reasons.length === 0, reasons }
}

export const RISK_LABEL = { low: 'آمن', medium: 'يحتاج انتباه', high: 'حساس' } as const
export const MODE_LABEL = { adb: 'ADB', fastboot: 'Fastboot', com: 'COM' } as const
export const COM_KIND_LABEL = {
  modem: 'مودم (AT)',
  diag: 'تشخيص (Diag)',
  edl: 'EDL 9008',
  bootrom: 'BootROM/Preloader',
  other: 'منفذ آخر'
} as const
