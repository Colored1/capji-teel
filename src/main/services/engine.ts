import { randomUUID } from 'node:crypto'
import { EventEmitter } from 'node:events'
import { writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import type {
  ApnEntry,
  Carrier,
  Profile,
  ProfilesBundle,
  RunProgress,
  RunRequest,
  RunResult,
  StepDef,
  StepResult,
  StepStatus
} from '../../shared/types'
import { runAdb } from './adbService'
import { lastBackup, makeRunDir, snapshot } from './backupService'
import { pickAtPort, sendAt } from './comService'
import type { RunOutput } from './commandRunner'
import { deviceService } from './deviceService'
import { explain } from './errors'
import { runFastboot } from './fastbootService'
import { logger } from './logger'
import { getSettings } from './settings'
import { resolveTemplate, wrapSu, type TemplateCtx } from './templateEngine'

interface StepOutcome {
  ok: boolean
  output: string
  error?: string
}

const DEFAULT_INPUT_PATTERN = '^[\\x20-\\x7E]{1,128}$'

function fromRun(r: RunOutput): StepOutcome {
  if (r.spawnError) return { ok: false, output: '', error: r.spawnError }
  if (r.aborted) return { ok: false, output: r.output, error: 'تم الإلغاء' }
  if (r.timedOut) return { ok: false, output: r.output, error: 'انتهت مهلة الأمر' }
  if (r.code !== 0) return { ok: false, output: r.output, error: `رمز الخروج ${r.code}` }
  return { ok: true, output: r.output }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = (): void => {
      clearTimeout(t)
      resolve()
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))

/**
 * محرك تنفيذ القوالب: يتحقق من الاتصال، يطبّق المتغيرات، يأخذ النسخة الاحتياطية
 * عند الحاجة، ينفّذ الخطوات واحدة تلو الأخرى، ويُرجع نتيجة كل خطوة بوضوح.
 * الواجهة لا ترسل أوامر خام أبداً — فقط معرّف القالب والمدخلات.
 */
export class ProfileEngine extends EventEmitter {
  private current: { runId: string; ctl: AbortController } | null = null

  isBusy(): boolean {
    return this.current !== null
  }

  cancel(runId: string): void {
    if (this.current?.runId === runId) this.current.ctl.abort()
  }

  async run(req: RunRequest, bundle: ProfilesBundle): Promise<RunResult> {
    if (this.current) throw new Error('هناك عملية قيد التنفيذ حالياً. انتظر انتهاءها أو ألغِها أولاً.')
    const profile = bundle.profiles.find((p) => p.id === req.profileId)
    if (!profile) throw new Error(`القالب غير موجود: ${req.profileId}`)

    const runId = randomUUID()
    const ctl = new AbortController()
    this.current = { runId, ctl }
    const startedAt = Date.now()
    const results: StepResult[] = []
    const total = profile.steps.length
    let error: string | undefined

    const emit = (stepId: string, status: StepStatus, index: number): void => {
      const p: RunProgress = { runId, profileId: profile.id, stepId, status, index, total }
      this.emit('progress', p)
    }

    emit('__start', 'running', -1)
    logger.info(`━━━━ ${profile.title} ━━━━`)

    try {
      if (profile.risk !== 'low' && !req.confirmed) {
        throw new Error('هذه العملية تحتاج تأكيداً صريحاً من المستخدم قبل التنفيذ.')
      }
      const ctx = this.buildContext(profile, req, bundle)

      // ---------- النسخة الاحتياطية التلقائية ----------
      if (profile.backupFirst && !req.skipBackup) {
        if (profile.requires.includes('adb') && ctx.serial) {
          emit('auto-backup', 'running', -1)
          const maxAge = getSettings().autoBackupMaxAgeMin
          const lb = lastBackup(ctx.serial)
          if (lb && maxAge > 0 && Date.now() - lb.ts < maxAge * 60_000) {
            const mins = Math.max(1, Math.round((Date.now() - lb.ts) / 60_000))
            logger.info(`ℹ توجد نسخة احتياطية حديثة (قبل ${mins} دقيقة) — لن تُؤخذ نسخة جديدة.`)
            emit('auto-backup', 'skipped', -1)
          } else {
            const b = await snapshot(ctx.serial, ctl.signal)
            if (!b.ok) {
              emit('auto-backup', 'fail', -1)
              throw new Error(
                `فشلت النسخة الاحتياطية التلقائية، لذلك أُلغيت العملية حمايةً للجهاز. ${b.error ?? ''}`.trim()
              )
            }
            emit('auto-backup', 'ok', -1)
          }
        } else {
          logger.warn('⚠ لا يمكن أخذ نسخة تلقائية بدون اتصال ADB — تابعت بدون نسخة احتياطية.')
        }
      } else if (profile.backupFirst && req.skipBackup) {
        logger.warn('⚠ تم تخطي النسخة الاحتياطية بطلب المستخدم.')
      }

      // ---------- الخطوات ----------
      let hardFail = false
      for (let i = 0; i < profile.steps.length; i++) {
        const step = profile.steps[i]
        if (hardFail || ctl.signal.aborted) {
          results.push({ stepId: step.id, label: step.label, status: 'skipped', output: '', durationMs: 0 })
          emit(step.id, 'skipped', i)
          continue
        }

        emit(step.id, 'running', i)
        logger.info(`▶ [${i + 1}/${total}] ${step.label}`)
        const t0 = Date.now()
        let outcome: StepOutcome
        try {
          outcome = await this.runStep(step, ctx, ctl.signal)
        } catch (e) {
          outcome = { ok: false, output: '', error: msg(e) }
        }
        const durationMs = Date.now() - t0
        const hint = outcome.ok ? undefined : explain(`${outcome.output}\n${outcome.error ?? ''}`)
        const shown = logger.mask(outcome.output.length > 6000 ? `${outcome.output.slice(0, 6000)}\n…` : outcome.output)

        results.push({
          stepId: step.id,
          label: step.label,
          status: outcome.ok ? 'ok' : 'fail',
          output: shown,
          durationMs,
          error: outcome.error,
          hint
        })
        emit(step.id, outcome.ok ? 'ok' : 'fail', i)

        if (outcome.ok) {
          logger.ok(`✔ ${step.label} (${(durationMs / 1000).toFixed(1)} ث)`)
        } else {
          logger.err(`✘ ${step.label} — ${outcome.error ?? 'فشل'}`)
          if (hint) logger.warn(`💡 ${hint}`)
          if (step.continueOnError) logger.warn('   (خطوة اختيارية — تمت المتابعة)')
          else hardFail = true
        }
      }
    } catch (e) {
      error = msg(e)
      logger.err(`✘ ${error}`)
    } finally {
      this.current = null
      logger.clearSecrets()
    }

    const cancelled = ctl.signal.aborted
    const hard = results.some((r) => {
      const def = profile.steps.find((s) => s.id === r.stepId)
      return r.status === 'fail' && !def?.continueOnError
    })
    const ok = !error && !cancelled && !hard
    if (cancelled) logger.warn('⏹ أُلغيت العملية')
    else if (ok) logger.ok(`━━━━ اكتملت العملية بنجاح: ${profile.title} ━━━━`)
    else logger.err(`━━━━ لم تكتمل العملية: ${profile.title} ━━━━`)

    return { runId, profileId: profile.id, ok, cancelled, startedAt, endedAt: Date.now(), steps: results, error }
  }

  // ------------------------------------------------------------
  //  تجهيز السياق + فحص جاهزية الاتصال
  // ------------------------------------------------------------
  private buildContext(profile: Profile, req: RunRequest, bundle: ProfilesBundle): TemplateCtx {
    const st = deviceService.getState()
    const serial: string | undefined =
      req.serial ?? st.selectedSerial ?? st.adb.devices.find((d) => d.state === 'device')?.serial
    let comPort: string | undefined

    for (const mode of profile.requires) {
      if (mode === 'adb') {
        if (!st.tools.adb.found) throw new Error(st.tools.adb.error ?? 'أداة adb غير متوفرة.')
        const dev = st.adb.devices.find((d) => d.serial === serial)
        if (!dev) {
          throw new Error(
            st.adb.devices.length === 0
              ? 'لا يوجد جهاز متصل عبر ADB. فعّل تصحيح USB ووصّل الكابل ثم اضغط «تحديث الاتصال».'
              : 'الجهاز المحدد غير متصل عبر ADB. اختر جهازاً آخر من لوحة الجهاز.'
          )
        }
        if (dev.state === 'unauthorized') {
          throw new Error('الجهاز غير مصرّح: اقبل نافذة «السماح بتصحيح USB» على شاشة الجهاز ثم أعد المحاولة.')
        }
        if (dev.state !== 'device') {
          throw new Error(`حالة جهاز ADB هي «${dev.state}» وليست جاهزة لتنفيذ الأوامر.`)
        }
      } else if (mode === 'fastboot') {
        if (!st.tools.fastboot.found) throw new Error(st.tools.fastboot.error ?? 'أداة fastboot غير متوفرة.')
        if (!serial || !st.fastboot.devices.some((d) => d.serial === serial)) {
          throw new Error('الجهاز المحدد ليس في وضع Fastboot. أدخله في وضع Bootloader/Fastboot أولاً.')
        }
      } else if (mode === 'com') {
        if (st.com.backend !== 'serialport' && profile.steps.some((s) => s.type === 'at')) {
          throw new Error('إرسال أوامر AT يحتاج مكتبة serialport. نفّذ npm install ثم أعد تشغيل البرنامج.')
        }
        comPort = req.comPort ?? st.selectedCom ?? pickAtPort(st.com.ports)
        if (!comPort) {
          throw new Error('لم يُكتشف منفذ مودم (COM). وصّل الجهاز بوضع المودم/التشخيص واختر المنفذ من لوحة الجهاز.')
        }
        if (!st.com.ports.some((p) => p.path === comPort)) {
          throw new Error(`المنفذ ${comPort} غير موجود حالياً. حدّث الاتصال واختر منفذاً صحيحاً.`)
        }
      }
    }

    // ----- المدخلات -----
    const inputs: Record<string, string> = {}
    for (const def of profile.inputs) {
      const val = (req.inputs?.[def.id] ?? def.default ?? '').trim()
      if (!val) {
        if (def.required) throw new Error(`الحقل «${def.label}» مطلوب.`)
        inputs[def.id] = ''
        continue
      }
      if (def.type === 'select') {
        if (!def.options?.some((o) => o.value === val)) throw new Error(`قيمة غير مسموحة في الحقل «${def.label}».`)
      } else {
        if (def.type === 'number' && !/^-?\d+(\.\d+)?$/.test(val)) {
          throw new Error(`الحقل «${def.label}» يجب أن يكون رقماً.`)
        }
        if (!new RegExp(def.pattern ?? DEFAULT_INPUT_PATTERN).test(val)) {
          throw new Error(`القيمة المدخلة في «${def.label}» غير صالحة.`)
        }
      }
      inputs[def.id] = val
      if (def.type === 'password') logger.addSecret(val)
    }

    // ----- الشركة و APN -----
    let carrier: Carrier | undefined
    let apn: ApnEntry | undefined
    if (profile.needsApn) {
      carrier = bundle.carriers.find((c) => c.id === req.carrierId)
      if (!carrier) throw new Error('اختر شركة الاتصالات (وAPN) من أعلى الصفحة أولاً.')
      apn = carrier.apns.find((a) => a.id === req.apnId)
    }

    const ctx: TemplateCtx = { serial, comPort, carrier, apn, inputs, info: st.info }
    if (JSON.stringify(profile.steps).includes('{{backupDir}}')) {
      ctx.backupDir = makeRunDir(serial ?? 'no-device', 'files')
      logger.info(`📁 مجلد النسخ: ${ctx.backupDir}`)
    }
    return ctx
  }

  // ------------------------------------------------------------
  //  تنفيذ خطوة واحدة + تقييم expect / reject + saveAs
  // ------------------------------------------------------------
  private async runStep(step: StepDef, ctx: TemplateCtx, signal: AbortSignal): Promise<StepOutcome> {
    const base = await this.execStep(step, ctx, signal)
    if (!base.ok) return base

    if (step.expect) {
      const re = new RegExp(resolveTemplate(step.expect, ctx, 'regex'), 'i')
      if (!re.test(base.output)) {
        return { ok: false, output: base.output, error: 'المخرجات لا تحتوي على النتيجة المتوقعة' }
      }
    }
    if (step.reject) {
      const m = new RegExp(resolveTemplate(step.reject, ctx, 'regex'), 'i').exec(base.output)
      if (m) return { ok: false, output: base.output, error: `ظهر في المخرجات ما يدل على الفشل: «${m[0]}»` }
    }

    if (step.saveAs && ctx.backupDir && base.output.trim()) {
      const name = basename(resolveTemplate(step.saveAs, ctx, 'plain')).replace(/[^\w.-]/g, '_') || 'output.txt'
      const file = join(ctx.backupDir, name)
      try {
        writeFileSync(file, base.output, 'utf8')
        logger.ok(`💾 حُفظت المخرجات في: ${file}`)
      } catch (e) {
        return { ok: false, output: base.output, error: `تعذّر حفظ الملف ${name}: ${msg(e)}` }
      }
    }
    return base
  }

  private async execStep(step: StepDef, ctx: TemplateCtx, signal: AbortSignal): Promise<StepOutcome> {
    switch (step.type) {
      case 'adb': {
        const args = (step.args ?? []).map((a) => resolveTemplate(a, ctx, 'plain'))
        return fromRun(
          await runAdb(args, { serial: ctx.serial, timeoutMs: step.timeoutMs, signal, quietOutput: step.quiet })
        )
      }
      case 'shell': {
        let cmd = resolveTemplate(step.command ?? '', ctx, 'shell')
        if (step.su) cmd = wrapSu(cmd)
        return fromRun(
          await runAdb(['shell', cmd], {
            serial: ctx.serial,
            timeoutMs: step.timeoutMs,
            signal,
            quietOutput: step.quiet
          })
        )
      }
      case 'fastboot': {
        const args = (step.args ?? []).map((a) => resolveTemplate(a, ctx, 'plain'))
        return fromRun(await runFastboot(args, { serial: ctx.serial, timeoutMs: step.timeoutMs, signal }))
      }
      case 'at': {
        const port = step.port && step.port !== 'auto' ? resolveTemplate(step.port, ctx, 'plain') : ctx.comPort
        if (!port) return { ok: false, output: '', error: 'لا يوجد منفذ COM لإرسال أمر AT.' }
        const command = resolveTemplate(step.command ?? '', ctx, 'at')
        logger.cmd(`AT@${port} ▸ ${command}`)
        const r = await sendAt(port, command, { baudRate: step.baudRate, timeoutMs: step.timeoutMs, signal })
        if (r.response && !step.quiet) logger.out(r.response)
        return { ok: r.ok, output: r.response, error: r.ok ? undefined : (r.error ?? 'ERROR') }
      }
      case 'delay': {
        await sleep(step.ms ?? 0, signal)
        return { ok: !signal.aborted, output: '', error: signal.aborted ? 'تم الإلغاء' : undefined }
      }
      case 'backup': {
        if (!ctx.serial) return { ok: false, output: '', error: 'لا يوجد جهاز ADB لأخذ نسخة احتياطية.' }
        const b = await snapshot(ctx.serial, signal)
        return {
          ok: b.ok,
          output: b.ok ? `تم حفظ ${b.saved.length} ملف في:\n${b.dir}` : '',
          error: b.error
        }
      }
      default:
        return { ok: false, output: '', error: `نوع خطوة غير مدعوم: ${String((step as StepDef).type)}` }
    }
  }
}

export const engine = new ProfileEngine()
