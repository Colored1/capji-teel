import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { CH } from '../shared/ipc'
import type {
  CapjiApi,
  ConnectionState,
  LogEntry,
  RunProgress
} from '../shared/types'

/**
 * الجسر الآمن: الواجهة لا ترى Node ولا ipcRenderer مباشرة،
 * فقط هذه الدوال المحددة. كل نداء يُرجع النتيجة أو يرمي خطأ بنص واضح.
 */
async function call<T>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as
    | { ok: true; data: T }
    | { ok: false; error: string }
  if (res && res.ok) return res.data
  throw new Error((res && 'error' in res && res.error) || 'خطأ غير معروف')
}

function on<T>(channel: string, cb: (v: T) => void): () => void {
  const handler = (_e: IpcRendererEvent, v: T): void => cb(v)
  ipcRenderer.on(channel, handler)
  return () => ipcRenderer.removeListener(channel, handler)
}

const api: CapjiApi = {
  app: {
    info: () => call(CH.appInfo),
    openDataFolder: () => call(CH.openDataFolder),
    openBackupsFolder: () => call(CH.openBackupsFolder)
  },
  device: {
    getState: () => call(CH.deviceGet),
    refresh: () => call(CH.deviceRefresh),
    select: (serial) => call(CH.deviceSelect, serial),
    selectCom: (path) => call(CH.deviceSelectCom, path),
    onState: (cb) => on<ConnectionState>(CH.deviceStateEvent, cb)
  },
  profiles: {
    list: () => call(CH.profilesList),
    reload: () => call(CH.profilesReload)
  },
  run: {
    start: (req) => call(CH.runStart, req),
    cancel: (runId) => call(CH.runCancel, runId),
    onProgress: (cb) => on<RunProgress>(CH.runProgressEvent, cb)
  },
  logs: {
    history: () => call(CH.logHistory),
    clear: () => call(CH.logClear),
    export: () => call(CH.logExport),
    onEntries: (cb) => on<LogEntry[]>(CH.logEntriesEvent, cb)
  },
  settings: {
    get: () => call(CH.settingsGet),
    set: (patch) => call(CH.settingsSet, patch)
  }
}

contextBridge.exposeInMainWorld('capji', api)
