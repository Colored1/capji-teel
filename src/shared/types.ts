// ============================================================
//  CAPji teel — الأنواع المشتركة بين Main و Preload و Renderer
// ============================================================

export const APP_NAME = 'CAPji teel'

// ---------- الاتصال والأجهزة ----------
export type ConnMode = 'adb' | 'fastboot' | 'com'

export type AdbState =
  | 'device'
  | 'unauthorized'
  | 'offline'
  | 'recovery'
  | 'sideload'
  | 'bootloader'
  | 'unknown'

export interface AdbDevice {
  serial: string
  state: AdbState
  model?: string
  product?: string
  deviceName?: string
  detail?: string
}

export interface FastbootDevice {
  serial: string
  mode: string
}

export type ComKind = 'modem' | 'diag' | 'edl' | 'bootrom' | 'other'

export interface ComPortInfo {
  path: string
  friendlyName?: string
  manufacturer?: string
  vendorId?: string
  productId?: string
  kind: ComKind
}

export interface ToolStatus {
  found: boolean
  path?: string
  version?: string
  error?: string
}

export interface DeviceInfo {
  source: 'adb' | 'fastboot'
  serial: string
  manufacturer?: string
  brand?: string
  model?: string
  codename?: string
  androidVersion?: string
  sdk?: string
  buildId?: string
  securityPatch?: string
  platform?: string
  hardware?: string
  baseband?: string
  simState?: string
  operatorName?: string
  operatorNumeric?: string
  networkType?: string
  bootloaderLocked?: string
  /** حقول إضافية (مثلاً متغيرات fastboot) */
  extra?: Record<string, string>
}

export interface ConnectionState {
  tools: { adb: ToolStatus; fastboot: ToolStatus }
  adb: { devices: AdbDevice[]; error?: string }
  fastboot: { devices: FastbootDevice[]; error?: string }
  com: { ports: ComPortInfo[]; error?: string; backend: 'serialport' | 'powershell' | 'none' }
  selectedSerial: string | null
  selectedCom: string | null
  info: DeviceInfo | null
  updatedAt: number
}

// ---------- السجل ----------
export type LogLevel = 'info' | 'cmd' | 'out' | 'err' | 'ok' | 'warn'

export interface LogEntry {
  id: number
  ts: number
  level: LogLevel
  text: string
}

// ---------- القوالب (Profiles) ----------
export type SectionId = '4g' | 'volte' | 'carrier' | 'backup'
export type Risk = 'low' | 'medium' | 'high'

export interface InputDef {
  id: string
  label: string
  type: 'text' | 'password' | 'number' | 'select'
  placeholder?: string
  /** تعبير نمطي (Regex) يجب أن تطابقه القيمة */
  pattern?: string
  required?: boolean
  options?: { value: string; label: string }[]
  default?: string
  help?: string
}

export type StepType = 'adb' | 'shell' | 'fastboot' | 'at' | 'delay' | 'backup'

export interface StepDef {
  id: string
  label: string
  type: StepType
  /** adb / fastboot: وسائط الأمر بدون كلمة adb نفسها */
  args?: string[]
  /** shell: أمر يُنفَّذ داخل الجهاز — at: أمر AT */
  command?: string
  /** shell: تنفيذ بصلاحية Root عبر su */
  su?: boolean
  /** at: اسم المنفذ (COMx) أو auto */
  port?: string
  baudRate?: number
  /** delay: مدة الانتظار بالمللي ثانية */
  ms?: number
  /** تعبير نمطي: يجب أن يظهر في المخرجات لتُعتبر الخطوة ناجحة */
  expect?: string
  /** تعبير نمطي: إذا ظهر في المخرجات تُعتبر الخطوة فاشلة */
  reject?: string
  continueOnError?: boolean
  timeoutMs?: number
  backupKind?: 'snapshot'
  /** حفظ مخرجات الخطوة في ملف داخل مجلد النسخ الاحتياطي */
  saveAs?: string
  /** إخفاء المخرجات من السجل (للبيانات الخاصة كجهات الاتصال) */
  quiet?: boolean
}

export interface Profile {
  id: string
  section: SectionId
  title: string
  description?: string
  risk: Risk
  requires: ConnMode[]
  needsApn: boolean
  inputs: InputDef[]
  backupFirst: boolean
  warnings: string[]
  steps: StepDef[]
  /** اسم الملف الذي جاء منه القالب (للتشخيص) */
  source?: string
}

export interface ApnEntry {
  id: string
  label: string
  name: string
  apn: string
  type: string
  protocol: string
  roamingProtocol: string
  authType: string
  user: string
  password: string
  mmsc: string
  verified: boolean
  note?: string
}

export interface Carrier {
  id: string
  name: string
  nameAr?: string
  mcc: string
  mnc: string
  apns: ApnEntry[]
}

export interface ProfilesBundle {
  profiles: Profile[]
  carriers: Carrier[]
  errors: string[]
  dataDir: string
}

// ---------- التنفيذ ----------
export interface RunRequest {
  profileId: string
  serial?: string
  comPort?: string
  carrierId?: string
  apnId?: string
  inputs?: Record<string, string>
  confirmed: boolean
  skipBackup?: boolean
}

export type StepStatus = 'running' | 'ok' | 'fail' | 'skipped'

export interface StepResult {
  stepId: string
  label: string
  status: Exclude<StepStatus, 'running'>
  output: string
  durationMs: number
  error?: string
  hint?: string
}

export interface RunResult {
  runId: string
  profileId: string
  ok: boolean
  cancelled: boolean
  startedAt: number
  endedAt: number
  steps: StepResult[]
  error?: string
}

export interface RunProgress {
  runId: string
  profileId: string
  /** معرّف الخطوة، أو __start عند بداية التشغيل، أو auto-backup للنسخ الاحتياطي التلقائي */
  stepId: string
  status: StepStatus
  index: number
  total: number
}

// ---------- الإعدادات ----------
export interface AppSettings {
  adbPath: string
  fastbootPath: string
  pollIntervalMs: number
  /** عمر النسخة الاحتياطية (بالدقائق) الذي يُعتبر حديثاً فلا تُؤخذ نسخة جديدة تلقائياً */
  autoBackupMaxAgeMin: number
}

export interface AppInfo {
  name: string
  version: string
  platform: string
  dataDir: string
  backupsDir: string
  logsDir: string
}

// ---------- واجهة API المكشوفة للواجهة عبر preload ----------
export interface CapjiApi {
  app: {
    info(): Promise<AppInfo>
    openDataFolder(): Promise<void>
    openBackupsFolder(): Promise<void>
  }
  device: {
    getState(): Promise<ConnectionState>
    refresh(): Promise<ConnectionState>
    select(serial: string | null): Promise<ConnectionState>
    selectCom(path: string | null): Promise<ConnectionState>
    onState(cb: (s: ConnectionState) => void): () => void
  }
  profiles: {
    list(): Promise<ProfilesBundle>
    reload(): Promise<ProfilesBundle>
  }
  run: {
    start(req: RunRequest): Promise<RunResult>
    cancel(runId: string): Promise<void>
    onProgress(cb: (p: RunProgress) => void): () => void
  }
  logs: {
    history(): Promise<LogEntry[]>
    clear(): Promise<void>
    export(): Promise<{ saved: boolean; path?: string }>
    onEntries(cb: (e: LogEntry[]) => void): () => void
  }
  settings: {
    get(): Promise<AppSettings>
    set(patch: Partial<AppSettings>): Promise<AppSettings>
  }
}
