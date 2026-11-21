import { EventEmitter } from 'node:events'
import type {
  AdbDevice,
  ConnectionState,
  DeviceInfo,
  FastbootDevice
} from '../../shared/types'
import { getProps, listAdbDevices } from './adbService'
import { listComPorts } from './comService'
import { fastbootVars, listFastbootDevices } from './fastbootService'
import { getSettings } from './settings'
import { resolveTool } from './toolPaths'

function emptyState(): ConnectionState {
  return {
    tools: { adb: { found: false }, fastboot: { found: false } },
    adb: { devices: [] },
    fastboot: { devices: [] },
    com: { ports: [], backend: 'none' },
    selectedSerial: null,
    selectedCom: null,
    info: null,
    updatedAt: 0
  }
}

async function readAdbInfo(serial: string): Promise<DeviceInfo> {
  const p = await getProps(serial)
  const g = (...keys: string[]): string | undefined => {
    for (const k of keys) if (p[k]) return p[k]
    return undefined
  }
  return {
    source: 'adb',
    serial,
    manufacturer: g('ro.product.manufacturer', 'ro.product.vendor.manufacturer'),
    brand: g('ro.product.brand', 'ro.product.vendor.brand'),
    model: g('ro.product.model', 'ro.product.vendor.model'),
    codename: g('ro.product.device', 'ro.product.vendor.device'),
    androidVersion: g('ro.build.version.release'),
    sdk: g('ro.build.version.sdk'),
    buildId: g('ro.build.display.id'),
    securityPatch: g('ro.build.version.security_patch'),
    platform: g('ro.board.platform'),
    hardware: g('ro.hardware'),
    baseband: g('gsm.version.baseband'),
    simState: g('gsm.sim.state'),
    operatorName: g('gsm.operator.alpha'),
    operatorNumeric: g('gsm.operator.numeric'),
    networkType: g('gsm.network.type'),
    bootloaderLocked: g('ro.boot.flash.locked')
  }
}

async function readFastbootInfo(serial: string): Promise<DeviceInfo> {
  const v = await fastbootVars(serial)
  return {
    source: 'fastboot',
    serial,
    model: v['product'],
    codename: v['variant'],
    bootloaderLocked: v['unlocked'] === 'yes' ? '0' : v['unlocked'] === 'no' ? '1' : undefined,
    extra: v
  }
}

/**
 * خدمة الأجهزة: تفحص ADB / Fastboot / COM دورياً، تحتفظ بالجهاز المحدد،
 * وتبثّ الحالة للواجهة عند أي تغيير فقط.
 */
class DeviceService extends EventEmitter {
  private state: ConnectionState = emptyState()
  private timer: NodeJS.Timeout | null = null
  private stopped = true
  private chain: Promise<void> = Promise.resolve()
  private infoKey = ''
  private lastSig = ''

  start(): void {
    if (!this.stopped) return
    this.stopped = false
    void this.loop()
  }

  stop(): void {
    this.stopped = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
  }

  getState(): ConnectionState {
    return this.state
  }

  async refresh(): Promise<ConnectionState> {
    await this.tick(true)
    return this.state
  }

  async select(serial: string | null): Promise<ConnectionState> {
    this.state = { ...this.state, selectedSerial: serial }
    this.infoKey = ''
    await this.tick(true)
    return this.state
  }

  async selectCom(path: string | null): Promise<ConnectionState> {
    this.state = { ...this.state, selectedCom: path }
    await this.tick(true)
    return this.state
  }

  private async loop(): Promise<void> {
    if (this.stopped) return
    try {
      await this.tick(false)
    } catch {
      /* لا نوقف الحلقة بسبب خطأ عابر */
    }
    if (this.stopped) return
    this.timer = setTimeout(() => void this.loop(), getSettings().pollIntervalMs)
  }

  /** تنفيذ الفحص بالتتابع (لا يتداخل فحصان أبداً) */
  private tick(force: boolean): Promise<void> {
    const run = (): Promise<void> => this.poll(force)
    this.chain = this.chain.then(run, run)
    return this.chain
  }

  private async poll(force: boolean): Promise<void> {
    const [adbTool, fbTool] = await Promise.all([resolveTool('adb'), resolveTool('fastboot')])

    const [adbRes, fbRes, comRes] = await Promise.all([
      adbTool.found
        ? listAdbDevices()
        : Promise.resolve({ devices: [] as AdbDevice[], error: adbTool.error }),
      fbTool.found
        ? listFastbootDevices()
        : Promise.resolve({ devices: [] as FastbootDevice[], error: fbTool.error }),
      listComPorts(force)
    ])

    // ----- اختيار الجهاز -----
    const all = [...adbRes.devices.map((d) => d.serial), ...fbRes.devices.map((d) => d.serial)]
    let sel = this.state.selectedSerial
    if (sel && !all.includes(sel)) sel = null
    if (!sel && all.length > 0) sel = adbRes.devices.find((d) => d.state === 'device')?.serial ?? all[0]

    let selCom = this.state.selectedCom
    if (selCom && !comRes.ports.some((p) => p.path === selCom)) selCom = null

    // ----- معلومات الجهاز -----
    let info = this.state.info
    const adbDev = adbRes.devices.find((d) => d.serial === sel)
    const fbDev = fbRes.devices.find((d) => d.serial === sel)
    if (!sel) {
      info = null
      this.infoKey = ''
    } else {
      const key = `${sel}|${adbDev?.state ?? ''}|${fbDev ? 'fb' : ''}`
      if (force || key !== this.infoKey || info?.serial !== sel) {
        this.infoKey = key
        if (adbDev?.state === 'device') {
          info = await readAdbInfo(sel)
          if (!info.model) this.infoKey = '' // لم تُقرأ الخصائص بعد: نعيد المحاولة في الدورة التالية
        } else if (fbDev) {
          info = await readFastbootInfo(sel)
        } else {
          info = { source: 'adb', serial: sel, model: adbDev?.model }
        }
      }
    }

    const next: ConnectionState = {
      tools: {
        adb: { found: adbTool.found, path: adbTool.path, version: adbTool.version, error: adbTool.error },
        fastboot: {
          found: fbTool.found,
          path: fbTool.path,
          version: fbTool.version,
          error: fbTool.error
        }
      },
      adb: { devices: adbRes.devices, error: adbRes.error },
      fastboot: { devices: fbRes.devices, error: fbRes.error },
      com: { ports: comRes.ports, error: comRes.error, backend: comRes.backend },
      selectedSerial: sel,
      selectedCom: selCom,
      info,
      updatedAt: Date.now()
    }

    const sig = JSON.stringify({ ...next, updatedAt: 0 })
    this.state = next
    if (sig !== this.lastSig) {
      this.lastSig = sig
      this.emit('state', next)
    }
  }
}

export const deviceService = new DeviceService()
