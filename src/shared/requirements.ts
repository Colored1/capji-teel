import type { ConnectionSnapshot, Requirement } from './types'

export interface RequirementCheck {
  ok: boolean
  /** نوع الاتصال الذي سيُستخدم والرقم التسلسلي المختار */
  via?: 'adb' | 'fastboot'
  serial?: string
  /** سبب واضح بالعربية عند الفشل */
  reason?: string
}

/**
 * يتحقق إن كان الجهاز جاهزاً للإجراء. يُستخدم في الواجهة (لتعطيل الزر وشرح السبب)
 * وفي الـ Main (للتحقق الفعلي قبل التنفيذ).
 */
export function checkRequirement(
  snap: ConnectionSnapshot | null,
  requires: Requirement,
  preferredSerial?: string | null
): RequirementCheck {
  if (requires === 'none') return { ok: true }
  if (!snap) return { ok: false, reason: 'لم يتم فحص الاتصال بعد.' }

  const needAdb = requires === 'adb' || requires === 'any'
  const needFb = requires === 'fastboot' || requires === 'any'

  if (needAdb) {
    if (!snap.tools.adb.found) {
      return { ok: false, reason: 'أداة adb غير موجودة. ضعها في resources/tools أو أضفها إلى PATH.' }
    }
    const pick = preferredSerial
      ? snap.adb.find((d) => d.serial === preferredSerial)
      : snap.adb.find((d) => d.state === 'device')
    const usable = pick ?? snap.adb.find((d) => d.state === 'device')
    if (usable && usable.state === 'device') return { ok: true, via: 'adb', serial: usable.serial }

    const bad = pick ?? snap.adb[0]
    if (bad) {
      if (bad.state === 'unauthorized')
        return { ok: false, reason: 'الجهاز غير مصرَّح: وافق على رسالة "السماح بتصحيح USB" على شاشة الجهاز.' }
      if (bad.state === 'offline')
        return { ok: false, reason: 'الجهاز Offline: أعد توصيل الكابل أو أعد تشغيل adb (kill-server).' }
      if (bad.state === 'recovery' || bad.state === 'sideload')
        return { ok: false, reason: `الجهاز في وضع ${bad.state} ولا يقبل أوامر shell العادية.` }
      return { ok: false, reason: `حالة ADB غير جاهزة: ${bad.state}` }
    }
  }

  if (needFb) {
    if (!snap.tools.fastboot.found) {
      return { ok: false, reason: 'أداة fastboot غير موجودة. ضعها في resources/tools أو أضفها إلى PATH.' }
    }
    const fb = preferredSerial
      ? snap.fastboot.find((d) => d.serial === preferredSerial) ?? snap.fastboot[0]
      : snap.fastboot[0]
    if (fb) return { ok: true, via: 'fastboot', serial: fb.serial }
  }

  if (requires === 'fastboot') return { ok: false, reason: 'لا يوجد جهاز في وضع Fastboot. أعد تشغيل الجهاز إلى Bootloader.' }
  return { ok: false, reason: 'لا يوجد جهاز متصل. تأكد من الكابل وتفعيل خيارات المطور > USB Debugging.' }
}
