const {
  app,
  BrowserWindow,
  Menu,
  clipboard,
  shell,
  session,
  nativeTheme,
  ipcMain,
  dialog,
} = require('electron')
const path = require('path')
const fs = require('fs')

const DEFAULT_URL = 'https://xedit.me/'

app.setName('xEdit')

// 去掉 UA 里的 Electron/应用标识（全局生效，含弹窗），
// 否则 Google 等 OAuth 提供方会把窗口当嵌入式浏览器拦截
app.userAgentFallback = app.userAgentFallback
  .replace(/\sxedit-desktop\/[\d.]+/, '')
  .replace(/\sElectron\/[\d.]+/, '')

// 覆盖线上地址：环境变量 XEDIT_URL（调试用），
// 或 ~/Library/Application Support/xEdit/config.json 里写 {"url": "..."}
function resolveAppUrl() {
  if (process.env.XEDIT_URL) return process.env.XEDIT_URL
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

// GitHub OAuth 及其社交登录（Google/Apple）整条链路必须留在窗口内完成：
// 中途任何一步跳到系统浏览器，会话 cookie 就断开，GitHub 会报
// "We could not validate the response from your social login provider"
const OAUTH_HOSTS = new Set([
  'github.com',
  'www.github.com',
  'accounts.google.com',
  'accounts.youtube.com',
  'appleid.apple.com',
])

function isAllowedHost(url) {
  try {
    const host = new URL(url).hostname
    return host === new URL(appUrl).hostname || OAUTH_HOSTS.has(host)
  } catch {
    return false
  }
}

// 第三方登录（GitHub/Google/Apple）的会话 cookie 就存在 persist:xedit 分区里。
// 网页端「退出登录」走 NextAuth，只清 xedit 自己的会话、清不掉这些提供方 cookie，
// 于是再点「GitHub 登录」会静默复用同一个账号。这里单独把提供方 cookie 清掉，
// 让下次登录重新出现账号选择。只动提供方、绝不碰 xedit 自身会话——
// 退出 xEdit（含清空本地镜像）仍由 App 内现成的「退出登录」负责。
const OAUTH_COOKIE_DOMAINS = ['github.com', 'google.com', 'youtube.com', 'apple.com']

async function clearOAuthProviderSessions() {
  const ses = session.fromPartition('persist:xedit')
  const cookies = await ses.cookies.get({})
  const targets = cookies.filter((c) => {
    const host = c.domain.replace(/^\./, '')
    return OAUTH_COOKIE_DOMAINS.some((d) => host === d || host.endsWith('.' + d))
  })
  await Promise.all(
    targets.map((c) => {
      const host = c.domain.replace(/^\./, '')
      const url = `${c.secure ? 'https' : 'http'}://${host}${c.path || '/'}`
      return ses.cookies.remove(url, c.name).catch(() => {})
    })
  )
  await ses.flushStorageData()
  return targets.length
}

async function switchGitHubAccount() {
  if (!mainWindow) return
  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['清除并继续', '取消'],
    defaultId: 0,
    cancelId: 1,
    message: '切换 GitHub 账号',
    detail:
      '将清除本应用记住的 GitHub / Google 第三方登录记录，方便你换一个账号登录。\n\n' +
      '清除后：先在应用内点「退出登录」，再点「登录 → GitHub」，这次会让你重新选择账号。\n\n' +
      '不影响已保存的本地文章，也不影响系统浏览器里的 GitHub 登录。',
  })
  if (response !== 0) return
  const n = await clearOAuthProviderSessions()
  await dialog.showMessageBox(mainWindow, {
    type: 'info',
    buttons: ['知道了'],
    message: n > 0 ? '已清除第三方登录记录' : '未找到第三方登录记录',
    detail:
      n > 0
        ? '下次点「登录 → GitHub」会重新出现账号选择。\n若当前仍显示为已登录，请先在应用内点「退出登录」。'
        : '可能已经是登出状态，直接点「登录 → GitHub」即可选择账号。',
  })
}

// Electron 默认不带右键菜单：文章里的图片右键毫无反应，拷不出来也存不下来。
// 按右键落点拼菜单——图片给拷贝/存图，链接给地址，选中文字和输入区给标准编辑项。
// 图片走 copyImageAt（主进程直接取渲染好的位图），跨域图床也照样能拷进剪贴板。
function contextMenuTemplate(webContents, params) {
  const items = []
  const sep = () => {
    if (items.length) items.push({ type: 'separator' })
  }

  if (params.mediaType === 'image' && params.srcURL) {
    items.push({ label: '拷贝图片', click: () => webContents.copyImageAt(params.x, params.y) })
    items.push({ label: '拷贝图片地址', click: () => clipboard.writeText(params.srcURL) })
    items.push({ label: '图片另存为…', click: () => webContents.downloadURL(params.srcURL) })
  }

  if (params.linkURL) {
    sep()
    items.push({ label: '拷贝链接地址', click: () => clipboard.writeText(params.linkURL) })
    items.push({ label: '在浏览器中打开', click: () => shell.openExternal(params.linkURL) })
  }

  const flags = params.editFlags || {}
  if (params.isEditable || params.selectionText) {
    sep()
    if (params.isEditable) items.push({ role: 'cut', label: '剪切', enabled: flags.canCut })
    items.push({ role: 'copy', label: '拷贝', enabled: flags.canCopy })
    if (params.isEditable) {
      items.push({ role: 'paste', label: '粘贴', enabled: flags.canPaste })
      // xEdit 的粘贴会把富文本转成 Markdown，这一项用于绕开转换、原样贴纯文本
      items.push({ role: 'pasteAndMatchStyle', label: '粘贴为纯文本', enabled: flags.canPaste })
      items.push({ role: 'selectAll', label: '全选' })
    }
  }

  // 空白处右键也得有反应，不然又是"点了没动静"
  if (!items.length) items.push({ role: 'reload', label: '刷新' })

  return items
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
    // 底色跟随系统深浅色，避免创建瞬间闪白/闪黑
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#161616' : '#fafafa',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      partition: 'persist:xedit',
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: false,
    },
  })

  mainWindow.webContents.on('context-menu', (_event, params) => {
    Menu.buildFromTemplate(contextMenuTemplate(mainWindow.webContents, params)).popup({
      window: mainWindow,
    })
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // OAuth 提供方的登录弹窗留在应用内，其余站外链接交给系统浏览器
    if (isAllowedHost(url)) return { action: 'allow' }
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
    // 首个 did-finish-load 是本地启动页，等远端页面加载完再截
    let shotTaken = false
    mainWindow.webContents.on('did-finish-load', () => {
      if (shotTaken || !/^https?:/.test(mainWindow.webContents.getURL())) return
      shotTaken = true
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

  // 先显示本地启动页（秒开），远端页面在后台加载、首帧就绪后自动接管，
  // 避免启动后长时间白屏等网络
  mainWindow
    .loadFile(path.join(__dirname, 'splash.html'))
    .catch(() => {})
    .then(() => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.loadURL(appUrl)
    })
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
        { label: '切换 GitHub 账号…', click: switchGitHubAccount },
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

  // 桌面端跳过登录页：preload 询问后在未登录且本地库为空时播种欢迎文档（见 preload.js）。
  // 登录态由主进程读会话 cookie 判断——cookie 是 httpOnly，页面侧读不到；
  // 已登录时绝不播种，避免本地文档在下次同步时被误传到云端账号
  ipcMain.handle('xedit:should-seed-welcome', async (event, origin) => {
    try {
      if (origin !== new URL(appUrl).origin) return false
      const cookies = await session.fromPartition('persist:xedit').cookies.get({ url: appUrl })
      return !cookies.some((c) => c.name.includes('session-token'))
    } catch {
      return false
    }
  })

  app.whenReady().then(() => {
    appUrl = resolveAppUrl()
    // 启动页显示期间提前完成 DNS/TLS 握手，远端首屏更快
    try {
      session.fromPartition('persist:xedit').preconnect({ url: appUrl, numSockets: 2 })
    } catch {}
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
