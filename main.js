const { app, BrowserWindow, Menu, shell } = require('electron')
const path = require('path')
const fs = require('fs')

const DEFAULT_URL = 'https://xedit.me/'

app.setName('xEdit')

// ~/Library/Application Support/xEdit/config.json 里写 {"url": "..."} 可覆盖线上地址
function resolveAppUrl() {
  try {
    const cfg = JSON.parse(
      fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8')
    )
    if (cfg.url) return cfg.url
  } catch {}
  return DEFAULT_URL
}

const statePath = () => path.join(app.getPath('userData'), 'window-state.json')

function readWindowState() {
  try {
    return JSON.parse(fs.readFileSync(statePath(), 'utf8'))
  } catch {
    return { width: 1360, height: 860 }
  }
}

let mainWindow = null
let appUrl = DEFAULT_URL

// GitHub OAuth 需要在窗口内完成，其余站外链接一律交给系统浏览器
function isAllowedHost(url) {
  try {
    const host = new URL(url).hostname
    const appHost = new URL(appUrl).hostname
    return host === appHost || host === 'github.com' || host === 'www.github.com'
  } catch {
    return false
  }
}

function createWindow() {
  const state = readWindowState()
  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 960,
    minHeight: 600,
    backgroundColor: '#fbfbfa',
    webPreferences: {
      partition: 'persist:xedit',
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  // 去掉 UA 里的 Electron 标识，避免 OAuth 把窗口当嵌入式浏览器拦截
  mainWindow.webContents.userAgent = mainWindow.webContents.userAgent
    .replace(/\sxedit-desktop\/[\d.]+/, '')
    .replace(/\sElectron\/[\d.]+/, '')

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedHost(url)) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  mainWindow.webContents.on('did-fail-load', (event, code, desc, url, isMainFrame) => {
    if (!isMainFrame || code === -3) return
    console.log(`[xedit] load failed: ${code} ${desc} ${url}`)
    mainWindow.loadFile(path.join(__dirname, 'error.html'), {
      query: { back: appUrl },
    })
  })

  mainWindow.webContents.on('did-finish-load', () => {
    console.log('[xedit] loaded:', mainWindow.webContents.getURL())
  })

  if (process.env.XEDIT_SHOT) {
    mainWindow.webContents.once('did-finish-load', () => {
      setTimeout(async () => {
        const img = await mainWindow.webContents.capturePage()
        fs.writeFileSync(process.env.XEDIT_SHOT, img.toPNG())
        console.log('[xedit] screenshot saved:', process.env.XEDIT_SHOT)
      }, 4000)
    })
  }

  mainWindow.on('close', () => {
    try {
      fs.writeFileSync(statePath(), JSON.stringify(mainWindow.getNormalBounds()))
    } catch {}
  })
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.loadURL(appUrl)
}

function buildMenu() {
  const nav = (p) => () => {
    if (!mainWindow) createWindow()
    mainWindow.loadURL(new URL(p, appUrl).toString())
  }
  const template = [
    { role: 'appMenu' },
    {
      label: '文件',
      submenu: [
        { label: '新建文章', accelerator: 'CmdOrCtrl+N', click: nav('/edit') },
        { label: '回到工作台', accelerator: 'Shift+CmdOrCtrl+H', click: nav('/') },
        { type: 'separator' },
        { role: 'close', label: '关闭窗口' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '拷贝' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '显示',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '进入/退出全屏' },
      ],
    },
    { role: 'windowMenu', label: '窗口' },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(() => {
    appUrl = resolveAppUrl()
    const dockIcon = path.join(__dirname, 'build', 'dock.png')
    if (app.dock && fs.existsSync(dockIcon)) app.dock.setIcon(dockIcon)
    buildMenu()
    createWindow()
  })

  app.on('activate', () => {
    if (!mainWindow) createWindow()
  })

  app.on('window-all-closed', () => {
    // macOS 惯例：关窗不退出
  })
}
