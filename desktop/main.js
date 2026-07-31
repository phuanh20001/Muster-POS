const {
  app,
  BrowserWindow,
  Tray,
  Menu,
  nativeImage,
} = require('electron')
const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')
const net = require('net')
const http = require('http')

const POS_URL = 'http://127.0.0.1:3000/pos'
const DB_WAIT_MS = 30000
const HTTP_WAIT_MS = 120000
const POLL_INTERVAL_MS = 1000

let mainWindow = null
let splashWindow = null
let tray = null
let serverProc = null
let tunnelProc = null
let logStream = null
let isQuitting = false
let servicesStarted = false
let managedServices = false

function getRepoRoot() {
  if (process.env.DREAMYCAFE_ROOT) return process.env.DREAMYCAFE_ROOT
  if (!app.isPackaged) return path.join(__dirname, '..')
  return 'C:\\DreamyCafe'
}

function loadEnvFile(repoRoot) {
  const env = { ...process.env }
  const envPath = path.join(repoRoot, '.env')
  if (!fs.existsSync(envPath)) return env
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let val = trimmed.slice(eq + 1).trim()
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    env[key] = val
  }
  return env
}

function parseDatabaseHostPort(databaseUrl) {
  if (!databaseUrl) return { host: 'localhost', port: 5432 }
  try {
    const u = new URL(databaseUrl.replace(/^postgresql:/, 'http:'))
    return {
      host: u.hostname || 'localhost',
      port: parseInt(u.port || '5432', 10),
    }
  } catch {
    return { host: 'localhost', port: 5432 }
  }
}

function checkTcp(host, port, timeoutMs) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    const finish = (ok) => {
      socket.destroy()
      resolve(ok)
    }
    socket.setTimeout(timeoutMs)
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.once('timeout', () => finish(false))
    socket.connect(port, host)
  })
}

async function waitForPostgres(env) {
  const { host, port } = parseDatabaseHostPort(env.DATABASE_URL)
  const deadline = Date.now() + DB_WAIT_MS
  while (Date.now() < deadline) {
    if (await checkTcp(host, port, 2000)) return true
    await sleep(POLL_INTERVAL_MS)
  }
  return false
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function openLogStream(repoRoot) {
  const logsDir = path.join(repoRoot, 'logs')
  fs.mkdirSync(logsDir, { recursive: true })
  return fs.createWriteStream(path.join(logsDir, 'desktop.log'), { flags: 'a' })
}

function logLine(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`
  if (logStream) logStream.write(line)
}

function pipeChildLogs(proc, label) {
  proc.stdout?.on('data', (chunk) => {
    logStream?.write(`[${label}] ${chunk}`)
  })
  proc.stderr?.on('data', (chunk) => {
    logStream?.write(`[${label}] ${chunk}`)
  })
  proc.on('exit', (code) => {
    logLine(`${label} exited with code ${code}`)
  })
}

function killProcess(proc) {
  if (!proc || proc.killed) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], { shell: true, stdio: 'ignore' })
  } else {
    proc.kill('SIGTERM')
  }
}

function killChildren() {
  killProcess(serverProc)
  killProcess(tunnelProc)
  serverProc = null
  tunnelProc = null
  servicesStarted = false
}

function spawnServer(repoRoot, env) {
  if (serverProc) return
  logLine('Starting npm run start')
  serverProc = spawn('npm run start', [], {
    cwd: repoRoot,
    shell: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  pipeChildLogs(serverProc, 'server')
}

function spawnTunnel(repoRoot, env) {
  if (tunnelProc) return
  logLine('Starting cloudflared tunnel')
  tunnelProc = spawn('cloudflared tunnel run dreamycafe', [], {
    cwd: repoRoot,
    shell: true,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  pipeChildLogs(tunnelProc, 'tunnel')
}

function pollHttp(url, timeoutMs) {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + timeoutMs

    function attempt() {
      const req = http.get(url, (res) => {
        res.resume()
        if (res.statusCode >= 200 && res.statusCode < 400) resolve()
        else schedule()
      })
      req.on('error', schedule)
      req.setTimeout(3000, () => {
        req.destroy()
        schedule()
      })
    }

    function schedule() {
      if (Date.now() >= deadline) reject(new Error('Server did not respond in time'))
      else setTimeout(attempt, POLL_INTERVAL_MS)
    }

    attempt()
  })
}

async function isServerAlreadyRunning() {
  try {
    await pollHttp(POS_URL, 30000)
    return true
  } catch {
    return false
  }
}

async function setSplashMessage(text, isError = false) {
  if (!splashWindow || splashWindow.isDestroyed()) return
  const spinner = isError ? 'hidden' : ''
  await splashWindow.webContents.executeJavaScript(`
    document.getElementById('status').textContent = ${JSON.stringify(text)};
    document.getElementById('status').className = 'status' + (${isError} ? ' error' : '');
    document.getElementById('spinner').className = 'spinner' + (${isError} ? ' hidden' : '');
  `).catch(() => {})
}

function getTrayIcon() {
  const iconPath = path.join(getRepoRoot(), 'public', 'icon.svg')
  if (fs.existsSync(iconPath)) {
    const img = nativeImage.createFromPath(iconPath)
    if (!img.isEmpty()) return img.resize({ width: 16, height: 16 })
  }
  return nativeImage.createEmpty()
}

function createTray() {
  if (tray) return
  tray = new Tray(getTrayIcon())
  tray.setToolTip('DreamyCafe')
  tray.setContextMenu(Menu.buildFromTemplate([
    {
      label: 'Open POS',
      click: () => showMainWindow(),
    },
    {
      label: managedServices ? 'Quit DreamyCafe' : 'Close POS window',
      click: () => {
        isQuitting = true
        if (managedServices) killChildren()
        app.quit()
      },
    },
  ]))
  tray.on('double-click', () => showMainWindow())
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 400,
    height: 280,
    resizable: false,
    maximizable: false,
    minimizable: false,
    frame: true,
    title: 'DreamyCafe',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  })
  splashWindow.loadFile(path.join(__dirname, 'splash.html'))
}

function isAllowedNavigation(urlString) {
  try {
    const u = new URL(urlString)
    return u.hostname === '127.0.0.1' || u.hostname === 'localhost'
  } catch {
    return false
  }
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow()
    return
  }
  mainWindow.setFullScreen(true)
  mainWindow.show()
  mainWindow.focus()
}

function createMainWindow() {
  if (mainWindow && !mainWindow.isDestroyed()) {
    showMainWindow()
    return
  }

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    title: 'DreamyCafe POS',
    frame: false,
    fullscreen: true,
    kiosk: true,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  mainWindow.loadURL(POS_URL)

  mainWindow.once('ready-to-show', () => {
    mainWindow.setFullScreen(true)
    mainWindow.show()
  })

  mainWindow.on('leave-full-screen', () => {
    if (!isQuitting && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.setFullScreen(true)
    }
  })

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isAllowedNavigation(url)) event.preventDefault()
  })

  mainWindow.webContents.on('will-redirect', (event, url) => {
    if (!isAllowedNavigation(url)) event.preventDefault()
  })

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function bootstrap() {
  const repoRoot = getRepoRoot()
  logStream = openLogStream(repoRoot)
  logLine(`DreamyCafe desktop starting (packaged=${app.isPackaged}, root=${repoRoot})`)

  createSplashWindow()
  await setSplashMessage('Checking project…')

  if (!fs.existsSync(path.join(repoRoot, 'package.json'))) {
    await setSplashMessage(
      `Project not found at ${repoRoot}. Set DREAMYCAFE_ROOT to your DreamyCafe folder.`,
      true,
    )
    return
  }

  if (!fs.existsSync(path.join(repoRoot, '.next'))) {
    await setSplashMessage('Production build missing. Run start-pos.bat or npm run build first.', true)
    return
  }

  const env = loadEnvFile(repoRoot)

  await setSplashMessage('Waiting for PostgreSQL…')
  const dbOk = await waitForPostgres(env)
  if (!dbOk) {
    await setSplashMessage(
      'PostgreSQL is not reachable. Start the database service and try again.',
      true,
    )
    return
  }

  await setSplashMessage('Checking POS server…')
  const alreadyRunning = await isServerAlreadyRunning()

  if (!alreadyRunning) {
    await setSplashMessage('Starting server and tunnel…')
    spawnServer(repoRoot, env)
    spawnTunnel(repoRoot, env)
    servicesStarted = true
    managedServices = true
  } else {
    logLine('Shell-only mode: server already running (Windows services)')
    await setSplashMessage('Connecting to POS server…')
  }

  await setSplashMessage('Waiting for POS server…')
  try {
    await pollHttp(POS_URL, HTTP_WAIT_MS)
  } catch {
    await setSplashMessage('Server did not start in time. Check logs/desktop.log', true)
    return
  }

  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
    splashWindow = null
  }

  createTray()
  createMainWindow()
}

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      showMainWindow()
    } else if (!servicesStarted) {
      bootstrap()
    }
  })

  app.whenReady().then(bootstrap)

  app.on('before-quit', () => {
    isQuitting = true
    if (managedServices) killChildren()
    logStream?.end()
  })

  app.on('window-all-closed', () => {
    // Keep running in tray on Windows
  })
}
