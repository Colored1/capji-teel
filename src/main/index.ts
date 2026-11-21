import { BrowserWindow, Menu, app, shell } from 'electron'
import { join } from 'node:path'
import { APP_NAME } from '../shared/types'
import { registerIpc } from './ipc'
import { deviceService } from './services/deviceService'
import { engine } from './services/engine'
import { logger } from './services/logger'
import { ensureDefaults, loadBundle } from './services/profileStore'

app.setName(APP_NAME)

// نسخة واحدة فقط من البرنامج
if (!app.requestSingleInstanceLock()) {
  app.quit()
}

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1380,
    height: 880,
    minWidth: 1100,
    minHeight: 700,
    title: APP_NAME, // عنوان النافذة (Title Bar)
    backgroundColor: '#0a0a0e',
    ...(app.isPackaged ? {} : { icon: join(__dirname, '../../build/icon.png') }),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true, // فصل كامل بين الواجهة وNode
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  // نبقي العنوان CAPji teel دائماً
  mainWindow.on('page-title-updated', (e) => e.preventDefault())
  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // منع فتح نوافذ أو التنقل خارج التطبيق
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (e, url) => {
    const dev = process.env['ELECTRON_RENDERER_URL']
    if (!(url.startsWith('file://') || (dev && url.startsWith(dev)))) e.preventDefault()
  })

  if (!app.isPackaged) {
    // F12 يفتح أدوات المطوّر في وضع التطوير فقط
    mainWindow.webContents.on('before-input-event', (_e, input) => {
      if (input.type === 'keyDown' && input.key === 'F12') mainWindow?.webContents.toggleDevTools()
    })
  }

  const devUrl = process.env['ELECTRON_RENDERER_URL']
  if (!app.isPackaged && devUrl) void mainWindow.loadURL(devUrl)
  else void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  }
})

app.whenReady().then(() => {
  app.setAppUserModelId('com.capji.teel')
  Menu.setApplicationMenu(null)

  logger.init(join(app.getPath('userData'), 'logs'))
  logger.info(`${APP_NAME} v${app.getVersion()} — بدء التشغيل`)

  ensureDefaults() // نسخ القوالب الافتراضية إلى مجلد المستخدم (مرة واحدة)
  loadBundle()
  registerIpc()
  createWindow()
  deviceService.start()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  deviceService.stop()
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  deviceService.stop()
  if (engine.isBusy()) logger.warn('تم إغلاق البرنامج أثناء تنفيذ عملية')
})
