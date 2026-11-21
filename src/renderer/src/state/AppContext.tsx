import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from 'react'
import type {
  AppSettings,
  ConnectionState,
  LogEntry,
  Profile,
  ProfilesBundle,
  RunProgress,
  RunResult,
  StepStatus
} from '@shared/types'

const MAX_LOGS = 3000

export interface Selection {
  carrierId?: string
  apnId?: string
}

export interface ProfileRunState {
  running: boolean
  runId?: string
  steps: Record<string, StepStatus>
  result?: RunResult
}

interface RunOptions {
  inputs: Record<string, string>
  confirmed: boolean
  skipBackup?: boolean
}

interface Ctx {
  conn: ConnectionState | null
  bundle: ProfilesBundle | null
  settings: AppSettings | null
  logs: LogEntry[]
  runs: Record<string, ProfileRunState>
  anyRunning: boolean
  selection: Selection
  setSelection: (s: Selection) => void
  refresh: () => Promise<void>
  selectDevice: (serial: string | null) => Promise<void>
  selectCom: (path: string | null) => Promise<void>
  reloadProfiles: () => Promise<void>
  saveSettings: (patch: Partial<AppSettings>) => Promise<void>
  run: (p: Profile, o: RunOptions) => Promise<void>
  cancel: (profileId: string) => Promise<void>
  clearLogs: () => Promise<void>
  exportLogs: () => Promise<string | null>
}

const AppCtx = createContext<Ctx | null>(null)

export function useApp(): Ctx {
  const v = useContext(AppCtx)
  if (!v) throw new Error('useApp خارج AppProvider')
  return v
}

export function AppProvider({ children }: { children: ReactNode }): JSX.Element {
  const api = window.capji
  const [conn, setConn] = useState<ConnectionState | null>(null)
  const [bundle, setBundle] = useState<ProfilesBundle | null>(null)
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [runs, setRuns] = useState<Record<string, ProfileRunState>>({})
  const [selection, setSelection] = useState<Selection>({})
  const pending = useRef<LogEntry[]>([])
  const timer = useRef<number | null>(null)

  const flush = useCallback(() => {
    timer.current = null
    const batch = pending.current
    pending.current = []
    if (!batch.length) return
    setLogs((prev) => {
      const maxId = prev.length ? prev[prev.length - 1].id : 0
      const fresh = batch.filter((e) => e.id > maxId)
      if (!fresh.length) return prev
      const next = prev.concat(fresh)
      return next.length > MAX_LOGS ? next.slice(next.length - MAX_LOGS) : next
    })
  }, [])

  const onProgress = useCallback((p: RunProgress) => {
    setRuns((r) => {
      const cur: ProfileRunState = r[p.profileId] ?? { running: true, steps: {} }
      const steps = p.stepId === '__start' ? {} : { ...cur.steps, [p.stepId]: p.status }
      return { ...r, [p.profileId]: { ...cur, runId: p.runId, steps } }
    })
  }, [])

  // ----- التحميل الأولي والاشتراك في الأحداث -----
  useEffect(() => {
    let alive = true
    const offs = [
      api.device.onState((s) => alive && setConn(s)),
      api.logs.onEntries((entries) => {
        pending.current.push(...entries)
        if (timer.current === null) timer.current = window.setTimeout(flush, 100)
      }),
      api.run.onProgress(onProgress)
    ]
    api.device.getState().then((s) => alive && setConn((c) => c ?? s)).catch(() => undefined)
    api.profiles.list().then((b) => alive && setBundle(b)).catch(() => undefined)
    api.settings.get().then((s) => alive && setSettings(s)).catch(() => undefined)
    api.logs
      .history()
      .then((h) => {
        if (!alive) return
        setLogs((prev) => {
          const hMax = h.length ? h[h.length - 1].id : 0
          return h.concat(prev.filter((e) => e.id > hMax)).slice(-MAX_LOGS)
        })
      })
      .catch(() => undefined)
    return () => {
      alive = false
      offs.forEach((o) => o())
      if (timer.current !== null) window.clearTimeout(timer.current)
    }
  }, [api, flush, onProgress])

  // ----- اختيار الشركة تلقائياً حسب الشريحة المكتشفة (مرة واحدة) -----
  useEffect(() => {
    if (selection.carrierId || !bundle || bundle.carriers.length === 0) return
    const numeric = conn?.info?.operatorNumeric?.split(',')[0]?.trim()
    const match = numeric ? bundle.carriers.find((c) => c.mcc + c.mnc === numeric) : undefined
    const carrier = match ?? bundle.carriers[0]
    setSelection({ carrierId: carrier.id, apnId: carrier.apns[0]?.id })
  }, [bundle, conn?.info?.operatorNumeric, selection.carrierId])

  const refresh = useCallback(async () => setConn(await api.device.refresh()), [api])
  const selectDevice = useCallback(async (s: string | null) => setConn(await api.device.select(s)), [api])
  const selectCom = useCallback(async (p: string | null) => setConn(await api.device.selectCom(p)), [api])
  const reloadProfiles = useCallback(async () => setBundle(await api.profiles.reload()), [api])
  const saveSettings = useCallback(
    async (patch: Partial<AppSettings>) => setSettings(await api.settings.set(patch)),
    [api]
  )

  const run = useCallback(
    async (p: Profile, o: RunOptions) => {
      setRuns((r) => ({ ...r, [p.id]: { running: true, steps: {} } }))
      const finish = (result: RunResult): void =>
        setRuns((r) => ({ ...r, [p.id]: { ...(r[p.id] ?? { steps: {} }), running: false, result } }))
      try {
        const res = await api.run.start({
          profileId: p.id,
          serial: conn?.selectedSerial ?? undefined,
          comPort: conn?.selectedCom ?? undefined,
          carrierId: selection.carrierId,
          apnId: selection.apnId,
          inputs: o.inputs,
          confirmed: o.confirmed,
          skipBackup: o.skipBackup
        })
        finish(res)
      } catch (e) {
        const now = Date.now()
        finish({
          runId: '',
          profileId: p.id,
          ok: false,
          cancelled: false,
          startedAt: now,
          endedAt: now,
          steps: [],
          error: e instanceof Error ? e.message : String(e)
        })
      }
    },
    [api, conn?.selectedSerial, conn?.selectedCom, selection]
  )

  const cancel = useCallback(
    async (profileId: string) => {
      const id = runs[profileId]?.runId
      if (id) await api.run.cancel(id)
    },
    [api, runs]
  )

  const clearLogs = useCallback(async () => {
    await api.logs.clear()
    setLogs([])
  }, [api])

  const exportLogs = useCallback(async () => {
    const r = await api.logs.export()
    return r.saved ? (r.path ?? null) : null
  }, [api])

  const anyRunning = useMemo(() => Object.values(runs).some((r) => r.running), [runs])

  const value: Ctx = {
    conn,
    bundle,
    settings,
    logs,
    runs,
    anyRunning,
    selection,
    setSelection,
    refresh,
    selectDevice,
    selectCom,
    reloadProfiles,
    saveSettings,
    run,
    cancel,
    clearLogs,
    exportLogs
  }
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}
