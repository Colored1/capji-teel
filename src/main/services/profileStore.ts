import { app } from 'electron'
import {
  copyFileSync,
  constants as fsConstants,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync
} from 'node:fs'
import { join } from 'node:path'
import type {
  ApnEntry,
  Carrier,
  ConnMode,
  InputDef,
  Profile,
  ProfilesBundle,
  Risk,
  SectionId,
  StepDef,
  StepType
} from '../../shared/types'
import { logger } from './logger'
import { bundledDataDir } from './toolPaths'

/* eslint-disable @typescript-eslint/no-explicit-any */

const SECTIONS: SectionId[] = ['4g', 'volte', 'carrier', 'backup']
const STEP_TYPES: StepType[] = ['adb', 'shell', 'fastboot', 'at', 'delay', 'backup']
const INPUT_TYPES = ['text', 'password', 'number', 'select']

export const userDataDir = (): string => join(app.getPath('userData'), 'data')

let current: ProfilesBundle | null = null

// ------------------------------------------------------------
//  نسخ الملفات الافتراضية إلى مجلد المستخدم (دون الكتابة فوق تعديلاته)
// ------------------------------------------------------------
function copyMissing(src: string, dst: string): void {
  if (!existsSync(src)) return
  mkdirSync(dst, { recursive: true })
  for (const name of readdirSync(src)) {
    const s = join(src, name)
    const d = join(dst, name)
    if (statSync(s).isDirectory()) copyMissing(s, d)
    else if (!existsSync(d)) {
      try {
        copyFileSync(s, d, fsConstants.COPYFILE_EXCL)
      } catch {
        /* تجاهل */
      }
    }
  }
}

export function ensureDefaults(): void {
  copyMissing(bundledDataDir(), userDataDir())
}

// ------------------------------------------------------------
//  قراءة وتحقق
// ------------------------------------------------------------
const isStr = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0

function readJson(file: string): any {
  const raw = readFileSync(file, 'utf8').replace(/^﻿/, '') // إزالة BOM (يضيفه المفكرة أحياناً)
  return JSON.parse(raw)
}

function listJson(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.json') && !f.startsWith('_'))
    .sort()
    .map((f) => join(dir, f))
}

function regexProblem(src: unknown): string | null {
  if (src === undefined) return null
  if (typeof src !== 'string') return 'يجب أن يكون نصاً'
  try {
    new RegExp(src.replace(/\{\{[^}]+\}\}/g, 'x'))
    return null
  } catch (e) {
    return `تعبير نمطي غير صالح: ${e instanceof Error ? e.message : String(e)}`
  }
}

function normalizeInput(raw: any, where: string, errors: string[]): InputDef | null {
  if (!raw || !isStr(raw.id) || !/^\w+$/.test(raw.id)) {
    errors.push(`${where}: حقل إدخال بدون id صالح`)
    return null
  }
  const type = INPUT_TYPES.includes(raw.type) ? raw.type : 'text'
  const def: InputDef = {
    id: raw.id,
    label: isStr(raw.label) ? raw.label : raw.id,
    type,
    placeholder: isStr(raw.placeholder) ? raw.placeholder : undefined,
    pattern: isStr(raw.pattern) ? raw.pattern : undefined,
    required: raw.required !== false,
    default: typeof raw.default === 'string' ? raw.default : undefined,
    help: isStr(raw.help) ? raw.help : undefined
  }
  const pr = regexProblem(def.pattern)
  if (pr) {
    errors.push(`${where} → ${raw.id}: ${pr}`)
    return null
  }
  if (type === 'select') {
    const opts = Array.isArray(raw.options) ? raw.options : []
    const options = opts
      .filter((o: any) => o && typeof o.value === 'string')
      .map((o: any) => ({ value: o.value as string, label: isStr(o.label) ? (o.label as string) : (o.value as string) }))
    if (options.length === 0) {
      errors.push(`${where} → ${raw.id}: حقل select بدون options`)
      return null
    }
    def.options = options
    if (def.default === undefined) def.default = options[0].value
  }
  return def
}

function normalizeStep(raw: any, index: number, where: string, errors: string[]): StepDef | null {
  const w = `${where} → الخطوة ${index + 1}`
  if (!raw || typeof raw !== 'object') {
    errors.push(`${w}: خطوة غير صالحة`)
    return null
  }
  const type = raw.type as StepType
  if (!STEP_TYPES.includes(type)) {
    errors.push(`${w}: النوع type يجب أن يكون واحداً من ${STEP_TYPES.join(' | ')}`)
    return null
  }
  const step: StepDef = {
    id: isStr(raw.id) ? raw.id : `s${index + 1}`,
    label: isStr(raw.label) ? raw.label : isStr(raw.id) ? raw.id : `خطوة ${index + 1}`,
    type,
    continueOnError: raw.continueOnError === true,
    quiet: raw.quiet === true
  }
  if (typeof raw.timeoutMs === 'number' && raw.timeoutMs > 0) step.timeoutMs = Math.min(raw.timeoutMs, 7_200_000)
  if (isStr(raw.saveAs)) step.saveAs = raw.saveAs

  for (const f of ['expect', 'reject'] as const) {
    const p = regexProblem(raw[f])
    if (p) {
      errors.push(`${w}: الحقل ${f}: ${p}`)
      return null
    }
    if (typeof raw[f] === 'string') step[f] = raw[f]
  }

  switch (type) {
    case 'adb':
    case 'fastboot':
      if (!Array.isArray(raw.args) || raw.args.length === 0 || !raw.args.every((a: unknown) => typeof a === 'string')) {
        errors.push(`${w}: الحقل args يجب أن يكون مصفوفة نصوص غير فارغة`)
        return null
      }
      step.args = raw.args
      break
    case 'shell':
      if (!isStr(raw.command)) {
        errors.push(`${w}: الحقل command مطلوب`)
        return null
      }
      step.command = raw.command
      step.su = raw.su === true
      break
    case 'at':
      if (!isStr(raw.command) || !/^AT/i.test(raw.command.trim())) {
        errors.push(`${w}: أمر AT يجب أن يبدأ بـ AT`)
        return null
      }
      step.command = raw.command.trim()
      if (isStr(raw.port)) step.port = raw.port
      if (typeof raw.baudRate === 'number') step.baudRate = raw.baudRate
      break
    case 'delay':
      if (typeof raw.ms !== 'number' || raw.ms < 0 || raw.ms > 60_000) {
        errors.push(`${w}: الحقل ms يجب أن يكون رقماً بين 0 و 60000`)
        return null
      }
      step.ms = raw.ms
      break
    case 'backup':
      step.backupKind = 'snapshot'
      break
  }
  return step
}

function inferRequires(steps: StepDef[]): ConnMode[] {
  const s = new Set<ConnMode>()
  for (const st of steps) {
    if (st.type === 'adb' || st.type === 'shell' || st.type === 'backup') s.add('adb')
    if (st.type === 'fastboot') s.add('fastboot')
    if (st.type === 'at') s.add('com')
  }
  return [...s]
}

function normalizeProfile(raw: any, file: string, errors: string[]): Profile | null {
  const where = `${file} → ${isStr(raw?.id) ? raw.id : '(بدون id)'}`
  if (!raw || typeof raw !== 'object') {
    errors.push(`${file}: عنصر قالب غير صالح`)
    return null
  }
  if (!isStr(raw.id) || !/^[\w.-]+$/.test(raw.id)) {
    errors.push(`${where}: الحقل id مطلوب (أحرف إنجليزية وأرقام و - _ فقط)`)
    return null
  }
  if (!SECTIONS.includes(raw.section)) {
    errors.push(`${where}: الحقل section يجب أن يكون واحداً من ${SECTIONS.join(' | ')}`)
    return null
  }
  if (!isStr(raw.title)) {
    errors.push(`${where}: الحقل title مطلوب`)
    return null
  }
  if (!Array.isArray(raw.steps) || raw.steps.length === 0) {
    errors.push(`${where}: يجب أن يحتوي القالب على خطوة واحدة على الأقل (steps)`)
    return null
  }

  const steps: StepDef[] = []
  const ids = new Set<string>()
  for (let i = 0; i < raw.steps.length; i++) {
    const s = normalizeStep(raw.steps[i], i, where, errors)
    if (!s) return null
    if (ids.has(s.id)) {
      errors.push(`${where}: معرّف الخطوة مكرر: ${s.id}`)
      return null
    }
    ids.add(s.id)
    steps.push(s)
  }

  const inputs: InputDef[] = []
  if (Array.isArray(raw.inputs)) {
    for (const r of raw.inputs) {
      const d = normalizeInput(r, where, errors)
      if (!d) return null
      inputs.push(d)
    }
  }

  const requires: ConnMode[] = Array.isArray(raw.requires)
    ? raw.requires.filter((m: unknown): m is ConnMode => m === 'adb' || m === 'fastboot' || m === 'com')
    : inferRequires(steps)

  const dump = JSON.stringify(raw.steps)
  const risk: Risk = raw.risk === 'high' || raw.risk === 'medium' ? raw.risk : 'low'

  return {
    id: raw.id,
    section: raw.section,
    title: raw.title,
    description: isStr(raw.description) ? raw.description : undefined,
    risk,
    requires: requires.length ? requires : inferRequires(steps),
    needsApn: raw.needsApn === true || dump.includes('{{apn.') || dump.includes('{{carrier.'),
    inputs,
    backupFirst: raw.backupFirst === true,
    warnings: Array.isArray(raw.warnings) ? raw.warnings.filter(isStr) : [],
    steps,
    source: file
  }
}

function normalizeCarrier(raw: any, file: string, errors: string[]): Carrier | null {
  const where = `${file} → ${isStr(raw?.id) ? raw.id : '(شركة بدون id)'}`
  if (!raw || !isStr(raw.id) || !isStr(raw.name) || !/^\d{3}$/.test(String(raw.mcc)) || !/^\d{2,3}$/.test(String(raw.mnc))) {
    errors.push(`${where}: الشركة تحتاج id و name و mcc (3 أرقام) و mnc (رقمان أو 3)`)
    return null
  }
  const apns: ApnEntry[] = []
  for (const a of Array.isArray(raw.apns) ? raw.apns : []) {
    if (!a || !isStr(a.id) || !isStr(a.apn)) {
      errors.push(`${where}: نقطة وصول تحتاج id و apn`)
      continue
    }
    const str = (v: unknown, d: string): string => (typeof v === 'string' ? v : d)
    apns.push({
      id: a.id,
      label: str(a.label, a.id),
      name: str(a.name, a.apn),
      apn: a.apn,
      type: str(a.type, 'default,supl'),
      protocol: str(a.protocol, 'IP'),
      roamingProtocol: str(a.roamingProtocol, 'IP'),
      authType: /^-?\d$/.test(String(a.authType ?? '0')) ? String(a.authType ?? '0') : '0',
      user: str(a.user, ''),
      password: str(a.password, ''),
      mmsc: str(a.mmsc, ''),
      verified: a.verified === true,
      note: isStr(a.note) ? a.note : undefined
    })
  }
  return {
    id: raw.id,
    name: raw.name,
    nameAr: isStr(raw.nameAr) ? raw.nameAr : undefined,
    mcc: String(raw.mcc),
    mnc: String(raw.mnc),
    apns
  }
}

export function loadBundle(): ProfilesBundle {
  const dataDir = userDataDir()
  const errors: string[] = []
  const carriers: Carrier[] = []
  const profiles: Profile[] = []
  const carrierIds = new Set<string>()
  const profileIds = new Set<string>()

  for (const file of listJson(join(dataDir, 'apn'))) {
    const name = `apn/${file.split(/[\\/]/).pop()}`
    try {
      const json = readJson(file)
      const list = Array.isArray(json) ? json : json?.carriers
      for (const raw of Array.isArray(list) ? list : []) {
        const c = normalizeCarrier(raw, name, errors)
        if (!c) continue
        if (carrierIds.has(c.id)) {
          errors.push(`${name}: معرّف الشركة مكرر: ${c.id}`)
          continue
        }
        carrierIds.add(c.id)
        carriers.push(c)
      }
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  for (const file of listJson(join(dataDir, 'profiles'))) {
    const name = `profiles/${file.split(/[\\/]/).pop()}`
    try {
      const json = readJson(file)
      const list = Array.isArray(json) ? json : json?.profiles
      for (const raw of Array.isArray(list) ? list : []) {
        const p = normalizeProfile(raw, name, errors)
        if (!p) continue
        if (profileIds.has(p.id)) {
          errors.push(`${name}: معرّف القالب مكرر: ${p.id}`)
          continue
        }
        profileIds.add(p.id)
        profiles.push(p)
      }
    } catch (e) {
      errors.push(`${name}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }

  for (const e of errors) logger.warn(`ملف إعدادات: ${e}`)
  logger.info(`تم تحميل ${profiles.length} قالباً و ${carriers.length} شركة اتصالات`)
  current = { profiles, carriers, errors, dataDir }
  return current
}

export function getBundle(): ProfilesBundle {
  return current ?? loadBundle()
}
