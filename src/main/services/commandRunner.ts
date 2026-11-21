import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { tmpdir } from 'node:os'
import { basename } from 'node:path'
import { logger } from './logger'

export interface RunOptions {
  /** المهلة القصوى بالمللي ثانية (الافتراضي 60 ثانية) */
  timeoutMs?: number
  /** لا تسجّل الأمر ولا المخرجات (للفحص الدوري الصامت) */
  quiet?: boolean
  /** سجّل الأمر لكن لا تسجّل المخرجات (بيانات خاصة) */
  quietOutput?: boolean
  /** مستوى تسجيل stderr (fastboot يكتب معلوماته العادية فيه) */
  stderrLevel?: 'err' | 'out'
  signal?: AbortSignal
  /** نص يظهر في السجل بدل الأمر الحقيقي */
  display?: string
  maxBuffer?: number
  /** مجلد التشغيل (الافتراضي: مجلد مؤقت صالح) */
  cwd?: string
}

export interface RunOutput {
  code: number | null
  stdout: string
  stderr: string
  /** stdout + stderr بترتيب وصولهما */
  output: string
  timedOut: boolean
  aborted: boolean
  /** يُملأ إذا تعذّر تشغيل الملف التنفيذي نفسه */
  spawnError?: string
  durationMs: number
}

/** أسطر ضوضاء يطبعها adb على بعض أجهزة ويندوز ولا علاقة لها بنتيجة الأمر */
const NOISE = /^(The directory name is invalid\.?|Could Not Find .*AdbWinApi\.dll\.dat)\s*$/i

export function failure(message: string): RunOutput {
  return {
    code: null,
    stdout: '',
    stderr: '',
    output: '',
    timedOut: false,
    aborted: false,
    spawnError: message,
    durationMs: 0
  }
}

function quoteArg(a: string): string {
  return a === '' || /[\s"'`$&|;<>()]/.test(a) ? `'${a.replace(/'/g, `'\\''`)}'` : a
}

/**
 * تشغيل أمر محلي بأمان: بدون shell (shell:false) فلا يمكن حقن أوامر عبر الوسائط،
 * مع بثّ المخرجات سطراً بسطر إلى السجل المباشر، ودعم المهلة والإلغاء.
 */
export function runCommand(bin: string, args: string[], opts: RunOptions = {}): Promise<RunOutput> {
  return new Promise<RunOutput>((resolve) => {
    const started = Date.now()
    if (opts.signal?.aborted) {
      resolve({ ...failure(''), spawnError: undefined, aborted: true })
      return
    }

    const timeoutMs = opts.timeoutMs ?? 60_000
    const maxBuffer = opts.maxBuffer ?? 4_000_000
    const errLevel = opts.stderrLevel ?? 'err'
    let stdout = ''
    let stderr = ''
    let output = ''
    let timedOut = false
    let aborted = false
    let finished = false
    let spawnError: string | undefined

    if (!opts.quiet) {
      const shown =
        opts.display ?? [basename(bin).replace(/\.exe$/i, ''), ...args].map(quoteArg).join(' ')
      logger.cmd(`$ ${shown}`)
    }

    let child: ChildProcessWithoutNullStreams
    try {
      child = spawn(bin, args, { windowsHide: true, shell: false, cwd: opts.cwd ?? tmpdir() })
    } catch (e) {
      const msg = `تعذّر تشغيل الأمر: ${e instanceof Error ? e.message : String(e)}`
      if (!opts.quiet) logger.err(msg)
      resolve(failure(msg))
      return
    }

    const makeSink = (level: 'out' | 'err', logLevel: 'out' | 'err') => {
      let partial = ''
      const emit = (line: string): void => {
        if (NOISE.test(line.trim())) return
        if (line.trim() === '') return
        if (stdout.length + stderr.length < maxBuffer) {
          output += `${line}\n`
          if (level === 'out') stdout += `${line}\n`
          else stderr += `${line}\n`
        }
        if (opts.quiet || opts.quietOutput) return
        logger.log(logLevel, line)
      }
      return {
        push(chunk: string): void {
          partial += chunk
          const parts = partial.split(/\r\n|\n|\r/)
          partial = parts.pop() ?? ''
          parts.forEach(emit)
        },
        flush(): void {
          if (partial) emit(partial)
          partial = ''
        }
      }
    }
    // ملاحظة: stderr الخاص بـ fastboot يُسجَّل كمخرجات عادية، لكنه يبقى في stderr/output
    const outSink = makeSink('out', 'out')
    const errSink = makeSink('err', errLevel)

    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    child.stdout.on('data', (c: string) => outSink.push(c))
    child.stderr.on('data', (c: string) => errSink.push(c))

    const kill = (): void => {
      try {
        child.kill()
      } catch {
        /* العملية انتهت أصلاً */
      }
      setTimeout(() => {
        try {
          child.kill('SIGKILL')
        } catch {
          /* لا شيء */
        }
      }, 2000).unref()
    }

    const timer = setTimeout(() => {
      timedOut = true
      kill()
    }, timeoutMs)
    const onAbort = (): void => {
      aborted = true
      kill()
    }
    opts.signal?.addEventListener('abort', onAbort, { once: true })

    const done = (code: number | null): void => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      outSink.flush()
      errSink.flush()
      if (!opts.quiet) {
        if (spawnError) logger.err(spawnError)
        else if (timedOut) logger.err(`✗ انتهت المهلة (${Math.round(timeoutMs / 1000)} ثانية) وتم إيقاف الأمر`)
        else if (aborted) logger.warn('⏹ تم إلغاء الأمر')
      }
      resolve({
        code,
        stdout,
        stderr,
        output,
        timedOut,
        aborted,
        spawnError,
        durationMs: Date.now() - started
      })
    }

    child.on('error', (e: NodeJS.ErrnoException) => {
      spawnError =
        e.code === 'ENOENT'
          ? `الأداة غير موجودة أو لا يمكن تشغيلها: ${bin}`
          : `تعذّر تشغيل الأمر: ${e.message}`
      done(null)
    })
    child.on('close', (code) => done(code))
  })
}
