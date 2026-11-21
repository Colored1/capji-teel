/**
 * يحوّل رسائل الأخطاء التقنية (من adb / fastboot / مودم AT) إلى تفسير عربي واضح.
 * يُرجع أول تفسير مطابق، أو undefined إن لم يعرف الخطأ.
 */
const RULES: Array<[RegExp, string]> = [
  [
    /device unauthorized|error: .*unauthorized/i,
    'الجهاز غير مصرّح: اقبل نافذة «السماح بتصحيح USB» على شاشة الجهاز ثم أعد المحاولة.'
  ],
  [
    /no devices\/emulators found|device '.*' not found|device not found|no devices found/i,
    'لا يوجد جهاز متصل. تأكد من الكابل وتعريف USB (Driver) وتفعيل تصحيح USB.'
  ],
  [
    /device offline/i,
    'الجهاز في حالة offline: افصل الكابل وأعد توصيله، أو حدّث الاتصال من لوحة الجهاز.'
  ],
  [
    /more than one device/i,
    'يوجد أكثر من جهاز متصل. اختر الجهاز المطلوب من لوحة الجهاز.'
  ],
  [
    /cannot connect to daemon|daemon not running/i,
    'خادم ADB لا يعمل. حدّث الاتصال أو أعد تشغيل البرنامج.'
  ],
  [
    /No permission to write APN settings/i,
    'هذا الجهاز يمنع تعديل APN عبر ADB (قيد أمان في النظام). أدخل الـ APN يدوياً: الإعدادات ← الاتصالات ← شبكات الجوال ← أسماء نقاط الوصول. استخدم قالب «فتح شاشة APN».'
  ],
  [
    /Permission Denial|requires android\.permission|SecurityException|not allowed to/i,
    'رفض الجهاز الأمر بسبب الصلاحيات. بعض الأوامر تحتاج Root أو إصدار أندرويد/ROM مختلفاً.'
  ],
  [
    /su: (not found|inaccessible)|inaccessible or not found|su: .*not found/i,
    'صلاحية Root (su) غير متوفرة على هذا الجهاز.'
  ],
  [
    /Unknown command|No shell command implementation|Can't find service|service .* not found/i,
    'هذا الأمر أو الخدمة غير مدعومة في إصدار أندرويد/الـ ROM الحالي.'
  ],
  [
    /FAILED \(remote:|FAILED \(command write failed|Command not allowed/i,
    'رفض الـ Bootloader الأمر (قد يكون مقفلاً، أو الأمر غير مدعوم في هذا الوضع).'
  ],
  [
    /\+CME ERROR:\s*(16|incorrect password)/i,
    'الكود/كلمة السر غير صحيحة. توقّف ولا تكرر المحاولة قبل التأكد من الكود — عدد المحاولات محدود وقد يُقفل الجهاز نهائياً.'
  ],
  [
    /\+CME ERROR:\s*(41|network personalization PUK)/i,
    'الجهاز يطلب PUK للشبكة: عدد المحاولات انتهى. لا تستمر؛ تحتاج كود PUK من مصدر الكود.'
  ],
  [
    /\+CME ERROR:\s*(4|operation not supported)/i,
    'المودم لا يدعم هذا الأمر (AT). جرّب منفذ مودم آخر أو جهازاً/شريحة مختلفة.'
  ],
  [
    /\+CME ERROR:\s*(3|operation not allowed)/i,
    'المودم رفض الأمر (غير مسموح في الحالة الحالية).'
  ],
  [
    /\+CME ERROR:\s*(10|SIM not inserted)/i,
    'لا توجد شريحة (SIM) أو لم تُقرأ. أدخل الشريحة وأعد المحاولة.'
  ],
  [
    /Access is denied|could not open|cannot open|resource busy|تعذر فتح/i,
    'تعذّر فتح منفذ COM: قد يكون مستخدماً من برنامج آخر (أغلق أي أداة صيانة تستخدم نفس المنفذ) أو التعريف غير مثبت.'
  ],
  [
    /الأداة غير موجودة|ENOENT/i,
    'الأداة المطلوبة غير موجودة. ضع adb/fastboot في resources/tools أو حدّد مسارها من الإعدادات.'
  ]
]

export function explain(text: string | undefined): string | undefined {
  if (!text) return undefined
  for (const [re, msg] of RULES) if (re.test(text)) return msg
  return undefined
}
