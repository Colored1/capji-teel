# CAPji teel — أداة صيانة وبرمجة الجوالات

تطبيق سطح مكتب (Windows) مبني بـ **Electron + React + TypeScript + Tailwind CSS**، يؤتمت مهام الصيانة الشائعة (4G/APN، VoLTE، فحص وفك قفل الشبكة بالكود الرسمي، النسخ الاحتياطي) عبر **ADB / Fastboot / منافذ COM**، مع سجل عمليات مباشر.

> تنبيه صريح: الكود كُتب بدون تجربته على أجهزة حقيقية. الأوامر تعتمد على طراز الجهاز وإصدار أندرويد، وما ينجح أو يفشل يظهر بوضوح في السجل. جرّب أولاً على جهاز غير مهم.

---

## 1) التشغيل (خطوة بخطوة)

1. ثبّت **Node.js LTS** من nodejs.org.
2. حمّل **Platform-Tools** من https://developer.android.com/tools/releases/platform-tools وضع هذه الملفات داخل `resources/tools/`:
   `adb.exe` و `fastboot.exe` و `AdbWinApi.dll` و `AdbWinUsbApi.dll`
3. افتح مجلد المشروع في الطرفية (CMD أو PowerShell) ونفّذ:
   ```
   npm install
   npm run dev
   ```
4. لبناء ملف تثبيت `.exe`:
   ```
   npm run dist
   ```
   النتيجة في مجلد `dist/`.

على الجوال: فعّل **خيارات المطور ← تصحيح USB**، ووصّله بالكابل، واقبل نافذة السماح.

---

## 2) هيكلية المشروع

```
CAPji-teel/
├─ resources/
│  ├─ data/                  ← ملفات الإعدادات القابلة للتعديل (JSON)
│  │  ├─ apn/yemen.json      ← شركات الاتصالات و APN
│  │  └─ profiles/           ← قوالب العمليات (4g / volte / carrier / backup)
│  └─ tools/                 ← adb.exe و fastboot.exe
├─ src/
│  ├─ shared/                ← الأنواع وقنوات IPC (مشتركة)
│  ├─ main/                  ← الخلفية (Main Process) — كل تنفيذ الأوامر هنا
│  │  ├─ index.ts            ← النافذة (العنوان CAPji teel) والأمان
│  │  ├─ ipc.ts              ← قنوات الاتصال مع الواجهة
│  │  └─ services/
│  │     ├─ commandRunner    ← تشغيل الأوامر بأمان + بث المخرجات للسجل
│  │     ├─ adbService / fastbootService / comService (AT)
│  │     ├─ deviceService    ← فحص دوري للأجهزة والمنافذ
│  │     ├─ profileStore     ← قراءة والتحقق من JSON
│  │     ├─ templateEngine   ← استبدال المتغيرات {{...}} بأمان
│  │     ├─ engine           ← محرك تنفيذ القوالب خطوة بخطوة
│  │     ├─ backupService    ← النسخ الاحتياطي
│  │     └─ errors / logger / settings / toolPaths
│  ├─ preload/index.ts       ← الجسر الآمن (contextBridge)
│  └─ renderer/              ← الواجهة (React + Tailwind، عربي RTL داكن)
└─ electron-builder.yml
```

**الفصل بين الواجهة والتنفيذ:** الواجهة لا ترسل أوامر خام أبداً؛ ترسل فقط *معرّف القالب + المدخلات*، والـ Main يبحث عن القالب في ملفات JSON وينفّذه. إعدادات الأمان: `contextIsolation` و `sandbox` مفعّلان، و `nodeIntegration` معطّل.

---

## 3) كيف أضيف أمراً أو ملفاً جديداً (بدون تعديل الواجهة)

1. من داخل البرنامج: **الإعدادات ← فتح مجلد القوالب**.
2. افتح أحد ملفات `profiles/*.json` (أو أنشئ ملفاً جديداً) وأضف عنصراً في `profiles`:

```json
{
  "id": "my-new-profile",
  "section": "4g",
  "title": "اسم العملية",
  "description": "شرح قصير",
  "risk": "medium",
  "backupFirst": true,
  "warnings": ["تحذير يظهر قبل التنفيذ"],
  "steps": [
    { "id": "s1", "label": "الخطوة الأولى", "type": "shell", "command": "settings get global mobile_data" }
  ]
}
```
3. احفظ، ثم **الإعدادات ← إعادة تحميل القوالب**. يظهر القالب تلقائياً في قسمه.

### الحقول
| الحقل | المعنى |
|---|---|
| `section` | `4g` أو `volte` أو `carrier` أو `backup` |
| `risk` | `low` تنفيذ مباشر، `medium` نافذة تأكيد، `high` تأكيد + كتابة كلمة «تأكيد» |
| `backupFirst` | نسخة احتياطية تلقائية قبل التنفيذ |
| `requires` | `["adb"]` أو `["fastboot"]` أو `["com"]` (يُستنتج تلقائياً من الخطوات) |
| `inputs` | حقول إدخال: `text` / `password` / `number` / `select` |
| `warnings` | تحذيرات تظهر في نافذة التأكيد |

### أنواع الخطوات `type`
- `shell`: أمر داخل الجهاز (`adb shell ...`). `"su": true` للتنفيذ كـ Root.
- `adb`: `"args": ["pull", "/sdcard/x", "{{backupDir}}"]`
- `fastboot`: `"args": ["getvar", "all"]`
- `at`: أمر AT عبر COM مثل `AT+CPIN?`
- `delay`: `"ms": 3000`
- `backup`: نسخة إعدادات الجهاز

خيارات الخطوة: `expect` (نمط يجب ظهوره ليُعتبر النجاح)، `reject` (نمط يعني الفشل)، `continueOnError`، `timeoutMs`، `saveAs` (حفظ المخرجات في ملف)، `quiet` (إخفاء المخرجات من السجل).

### المتغيرات
`{{serial}}` `{{input.اسم_الحقل}}` `{{carrier.mcc}}` `{{carrier.mnc}}` `{{carrier.mccmnc}}` `{{apn.apn}}` `{{apn.name}}` `{{apn.user}}` `{{backupDir}}` `{{timestamp}}`

في أوامر `shell` اكتب المتغير داخل علامتي اقتباس مفردتين: `'{{apn.name}}'`.

### إضافة شركة أو APN
عدّل `apn/yemen.json` (أو أضف ملفاً جديداً في نفس المجلد). قيم الـ APN المعلّمة `verified: false` غير موثّقة من مصدر رسمي — راجعها مع الشركة. الموثّق فقط: سبأفون `internet`.

---

## 4) ما يوفّره كل قسم

- **لوحة الجهاز:** حالة ADB/Fastboot/COM، معلومات الجهاز، تصنيف منافذ COM (مودم / Diag / EDL 9008 / BootROM).
- **الشبكة و4G:** وضع الشبكة، إضافة APN عبر ADB أو عبر المودم (AT)، تحديث الراديو.
- **VoLTE:** فحص IMS، تفعيل عبر Carrier Config (أندرويد 11+ غالباً)، طريقة Root، فحص المودم.
- **الشرائح والقفل:** فحص حالة القفل، **فك الشبكة بالكود الرسمي NCK** بأمر 3GPP القياسي مع فحص مسبق ولا يُسجَّل الكود، اختيار الشبكة يدوياً/تلقائياً.
- **النسخ الاحتياطي:** نسخة إعدادات وAPN، ملفات المستخدم، جهات الاتصال والرسائل، `adb backup`، أقسام EFS/NV (Root).
- **سجل العمليات:** مباشر، بحث، نسخ، تصدير، وملف يومي في مجلد البيانات.

## 5) حدود يجب معرفتها
- أوامر AT تحتاج مكتبة `serialport` (تُثبَّت مع `npm install`) ومنفذ مودم ظاهر بتعريف صحيح.
- إضافة APN دون Root تنجح على بعض الأجهزة فقط؛ عند الرفض افتح شاشة APN في الجهاز يدوياً (القالب يفتحها).
- لا يتضمن المشروع تجاوز FRP ولا تغيير IMEI.
- النسخة تحتاج أيقونة: ضع `build/icon.ico` قبل `npm run dist`.
