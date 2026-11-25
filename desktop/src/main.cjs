'use strict';

const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  nativeTheme,
  screen,
  shell,
} = require('electron');

const APP_NAME = 'Antigravity Mission Board';
const APP_ID = 'com.antigravity.mission-board';
const DESKTOP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '..');
const ASSETS_DIR = path.join(DESKTOP_ROOT, 'assets');
const PRELOAD_PATH = path.join(__dirname, 'preload.cjs');

const COLLAPSED_DEFAULT = { width: 276, height: 56 };
const MAIN_DEFAULT = { width: 1380, height: 860, minWidth: 960, minHeight: 620 };
const SCREEN_MARGIN = 14;

const PKG_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DESKTOP_ROOT, 'package.json'), 'utf8')).version || '2.0.0';
  } catch {
    return '2.0.0';
  }
})();

// ---------------------------------------------------------------------------
// CLI Argument Parsing
// ---------------------------------------------------------------------------
function parseCliArgs(argv) {
  const args = argv.slice(1);
  let demoMode = process.env.DEMO_MODE === '1' || String(process.env.DEMO_MODE || '').toLowerCase() === 'true';
  let host = (process.env.HOST || '127.0.0.1').trim() || '127.0.0.1';
  let port = Number.parseInt(process.env.PORT || '3777', 10);
  let explicitPort = Boolean(process.env.PORT);
  let autoStartLaunch = false;
  let showMainOnStart = false;
  let smokeTest = false;
  let forceElectronNode = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--demo') {
      demoMode = true;
    } else if (arg === '--autostart' || arg === '--hidden') {
      autoStartLaunch = true;
    } else if (arg === '--show-main') {
      showMainOnStart = true;
    } else if (arg === '--smoke-test') {
      smokeTest = true;
    } else if (arg === '--force-electron-node') {
      forceElectronNode = true;
    } else if (arg.startsWith('--port=')) {
      const parsed = Number.parseInt(arg.slice('--port='.length), 10);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) {
        port = parsed;
        explicitPort = true;
      }
    } else if (arg === '--port' && args[i + 1]) {
      const parsed = Number.parseInt(args[i + 1], 10);
      if (Number.isFinite(parsed) && parsed > 0 && parsed <= 65535) {
        port = parsed;
        explicitPort = true;
      }
      i += 1;
    } else if (arg.startsWith('--host=')) {
      const val = arg.slice('--host='.length).trim();
      if (val) host = val;
    }
  }

  if (!Number.isFinite(port) || port <= 0 || port > 65535) {
    port = 3777;
  }

  return {
    demoMode,
    host,
    port,
    explicitPort,
    autoStartLaunch,
    showMainOnStart,
    smokeTest,
    forceElectronNode,
  };
}

const CLI = parseCliArgs(process.argv);

// ---------------------------------------------------------------------------
// State Persistence (~/.antigravity-mission-board/desktop-state.json)
// ---------------------------------------------------------------------------
const STATE_DIR = path.join(os.homedir(), '.antigravity-mission-board');
const STATE_FILE = path.join(STATE_DIR, 'desktop-state.json');

const DEFAULT_PERSISTED_STATE = {
  alwaysOnTop: true,
  widgetVisible: true,
  widgetAnchor: {
    horizontal: 'right',
    vertical: 'top',
    anchorX: null,
    anchorY: null,
  },
  mainBounds: {
    x: null,
    y: null,
    width: MAIN_DEFAULT.width,
    height: MAIN_DEFAULT.height,
    maximized: false,
  },
  theme: 'system',
};

function loadPersistedState() {
  if (CLI.smokeTest) {
    return JSON.parse(JSON.stringify(DEFAULT_PERSISTED_STATE));
  }
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return JSON.parse(JSON.stringify(DEFAULT_PERSISTED_STATE));
    }
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return {
      alwaysOnTop: typeof raw.alwaysOnTop === 'boolean' ? raw.alwaysOnTop : true,
      widgetVisible: typeof raw.widgetVisible === 'boolean' ? raw.widgetVisible : true,
      widgetAnchor: {
        horizontal: raw.widgetAnchor?.horizontal === 'left' ? 'left' : 'right',
        vertical: raw.widgetAnchor?.vertical === 'bottom' ? 'bottom' : 'top',
        anchorX: Number.isFinite(raw.widgetAnchor?.anchorX) ? Math.round(raw.widgetAnchor.anchorX) : null,
        anchorY: Number.isFinite(raw.widgetAnchor?.anchorY) ? Math.round(raw.widgetAnchor.anchorY) : null,
      },
      mainBounds: {
        x: Number.isFinite(raw.mainBounds?.x) ? Math.round(raw.mainBounds.x) : null,
        y: Number.isFinite(raw.mainBounds?.y) ? Math.round(raw.mainBounds.y) : null,
        width: Number.isFinite(raw.mainBounds?.width)
          ? Math.max(MAIN_DEFAULT.minWidth, Math.round(raw.mainBounds.width))
          : MAIN_DEFAULT.width,
        height: Number.isFinite(raw.mainBounds?.height)
          ? Math.max(MAIN_DEFAULT.minHeight, Math.round(raw.mainBounds.height))
          : MAIN_DEFAULT.height,
        maximized: Boolean(raw.mainBounds?.maximized),
      },
      theme: raw.theme === 'light' || raw.theme === 'dark' ? raw.theme : 'system',
    };
  } catch {
    return JSON.parse(JSON.stringify(DEFAULT_PERSISTED_STATE));
  }
}

let persistedState = loadPersistedState();
let saveTimer = null;

function scheduleSaveState() {
  if (CLI.smokeTest) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      const tmp = `${STATE_FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(persistedState, null, 2), 'utf8');
      fs.renameSync(tmp, STATE_FILE);
    } catch {
      // Non-fatal: ignore persistence write failures
    }
  }, 220);
}

// ---------------------------------------------------------------------------
// Runtime Globals
// ---------------------------------------------------------------------------
let activeHost = CLI.host;
let activePort = CLI.port;
let managedServerChild = null;
let serverLogRing = [];
let tray = null;
let widgetWindow = null;
let mainWindow = null;
let mainWindowReady = false;
let isQuitting = false;
let isResizingWidget = false;
let widgetExpanded = false;
let widgetSize = { ...COLLAPSED_DEFAULT };
let pendingConversationId = null;
let traySummary = { running: 0, attention: 0, initialized: false };
let lastIpcSummaryAt = 0;
let fallbackPollTimer = null;

function pushServerLog(chunk) {
  const lines = String(chunk || '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter(Boolean);
  for (const line of lines) {
    serverLogRing.push(line);
    if (serverLogRing.length > 80) {
      serverLogRing.shift();
    }
  }
}

function getBaseUrl() {
  return `http://${activeHost}:${activePort}`;
}

function getAppIconPath() {
  const ico = path.join(ASSETS_DIR, 'icon.ico');
  const png = path.join(ASSETS_DIR, 'icon.png');
  if (process.platform === 'win32' && fs.existsSync(ico)) return ico;
  if (fs.existsSync(png)) return png;
  return ico;
}

function getTrayIcon() {
  const trayPng = path.join(ASSETS_DIR, 'tray-icon.png');
  const fallbackPng = path.join(ASSETS_DIR, 'icon.png');
  const chosen = fs.existsSync(trayPng) ? trayPng : fallbackPng;
  let img = nativeImage.createFromPath(chosen);
  if (process.platform === 'darwin') {
    img = img.resize({ width: 18, height: 18 });
  }
  return img;
}

// ---------------------------------------------------------------------------
// Embedded Zero-Terminal Local Server Lifecycle
// ---------------------------------------------------------------------------
function isHealthOk(health) {
  return Boolean(health && (health.ok === true || health.status === 'ok'));
}

function httpGetJson(url, timeoutMs = 1200) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        body += chunk;
        if (body.length > 4 * 1024 * 1024) {
          req.destroy();
          resolve(null);
        }
      });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          resolve(null);
          return;
        }
        try {
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.on('error', () => resolve(null));
  });
}

function checkHealth(host, port) {
  return httpGetJson(`http://${host}:${port}/api/health`, 900);
}

function resolveServerPaths() {
  const candidates = [];

  if (app.isPackaged && process.resourcesPath) {
    candidates.push({
      entry: path.join(process.resourcesPath, 'server', 'dist', 'server', 'src', 'index.js'),
      cwd: process.resourcesPath,
    });
  }

  candidates.push({
    entry: path.join(REPO_ROOT, 'server', 'dist', 'server', 'src', 'index.js'),
    cwd: REPO_ROOT,
  });

  for (const candidate of candidates) {
    if (fs.existsSync(candidate.entry)) {
      return candidate;
    }
  }
  return null;
}

function resolveSystemNodeBinary() {
  const candidates = process.platform === 'win32'
    ? ['node.exe', 'node', path.join(process.env.ProgramFiles || 'C:\\Program Files', 'nodejs', 'node.exe')]
    : ['node'];

  for (const bin of candidates) {
    try {
      const probe = spawnSync(bin, ['-e', "import('node:sqlite').then(() => process.exit(0)).catch(() => process.exit(1))"], {
        windowsHide: true,
        stdio: 'ignore',
        timeout: 2500,
      });
      if (probe.status === 0) {
        return bin;
      }
    } catch {
      // Try next candidate
    }
  }
  return null;
}

function canElectronRunAsNodeSqlite() {
  try {
    const probe = spawnSync(
      process.execPath,
      ['-e', "import('node:sqlite').then(() => process.exit(0)).catch(() => process.exit(1))"],
      {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        windowsHide: true,
        stdio: 'ignore',
        timeout: 2500,
      }
    );
    return probe.status === 0;
  } catch {
    return false;
  }
}

function isPortListening(host, port) {
  return new Promise((resolve) => {
    const net = require('node:net');
    const socket = net.createConnection({ host, port });
    socket.setTimeout(400);
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      socket.destroy();
      resolve(false);
    });
    socket.once('error', () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function findFreeLocalPort(host, startPort) {
  for (let p = startPort; p < startPort + 40; p += 1) {
    const inUse = await isPortListening(host, p);
    if (!inUse) return p;
  }
  return startPort;
}

async function spawnServerWithRuntime({ binary, env, entry, cwd, demoMode, host, port }) {
  const args = [entry, ...(demoMode ? ['--demo'] : [])];

  const child = spawn(binary, args, {
    cwd,
    env: {
      ...env,
      HOST: host,
      PORT: String(port),
      ...(demoMode ? { DEMO_MODE: '1' } : {}),
    },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  });

  let exited = false;
  let exitCode = null;
  let spawnErr = null;

  child.stdout?.on('data', pushServerLog);
  child.stderr?.on('data', pushServerLog);
  child.on('error', (err) => {
    spawnErr = err;
    exited = true;
    pushServerLog(`[spawn-error] ${err.message}`);
  });
  child.on('exit', (code) => {
    exited = true;
    exitCode = code;
    if (managedServerChild === child) {
      managedServerChild = null;
    }
  });

  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (exited) {
      return {
        ok: false,
        reason: spawnErr ? spawnErr.message : `Server exited early with code ${exitCode}`,
      };
    }
    const health = await checkHealth(host, port);
    if (isHealthOk(health)) {
      managedServerChild = child;
      return { ok: true, health, child };
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  try {
    child.kill();
  } catch {
    // ignore
  }
  return { ok: false, reason: 'Timed out waiting for local server /api/health' };
}

async function ensureLocalServer() {
  const existing = await checkHealth(activeHost, activePort);
  if (isHealthOk(existing)) {
    const existingIsDemo = existing.mode === 'demo';
    if (CLI.demoMode && !existingIsDemo && !CLI.explicitPort) {
      // Never expose live user data when --demo was explicitly requested!
      activePort = await findFreeLocalPort(activeHost, activePort + 1);
    } else if (!CLI.demoMode && existingIsDemo && !CLI.explicitPort) {
      // Don't accidentally attach live app to a stray demo server
      activePort = await findFreeLocalPort(activeHost, activePort + 1);
    } else {
      return { spawned: false, health: existing };
    }
  }

  const serverPaths = resolveServerPaths();
  if (!serverPaths) {
    throw new Error(
      'Built server bundle was not found (server/dist/server/src/index.js). Please run `npm run build` from the repository root first.'
    );
  }

  // Build ordered runtime candidates: prefer system Node (>=22.5 with node:sqlite),
  // fall back to Electron's bundled Node via ELECTRON_RUN_AS_NODE=1.
  const runtimes = [];
  if (!CLI.forceElectronNode) {
    const systemNode = resolveSystemNodeBinary();
    if (systemNode) {
      const cleanEnv = { ...process.env };
      delete cleanEnv.ELECTRON_RUN_AS_NODE;
      runtimes.push({ label: `system:${systemNode}`, binary: systemNode, env: cleanEnv });
    }
  }
  if (canElectronRunAsNodeSqlite()) {
    runtimes.push({
      label: 'electron-node',
      binary: process.execPath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    });
  }

  if (runtimes.length === 0) {
    throw new Error(
      'No compatible Node.js runtime with `node:sqlite` support was found. Install Node.js >= 22.5.0.'
    );
  }

  let lastReason = 'Unknown startup error';
  for (const rt of runtimes) {
    const result = await spawnServerWithRuntime({
      binary: rt.binary,
      env: rt.env,
      entry: serverPaths.entry,
      cwd: serverPaths.cwd,
      demoMode: CLI.demoMode,
      host: activeHost,
      port: activePort,
    });
    if (result.ok) {
      return { spawned: true, runtime: rt.label, health: result.health };
    }
    lastReason = `${rt.label}: ${result.reason}`;
  }

  const tail = serverLogRing.slice(-8).join('\n');
  throw new Error(`Failed to start local Mission Board server (${lastReason}).${tail ? `\n\n${tail}` : ''}`);
}

function stopManagedServer() {
  const child = managedServerChild;
  managedServerChild = null;
  if (!child || child.exitCode !== null || child.killed) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const timer = setTimeout(() => {
      try {
        if (process.platform === 'win32' && child.pid) {
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], {
            windowsHide: true,
            stdio: 'ignore',
            timeout: 2000,
          });
        } else {
          child.kill('SIGKILL');
        }
      } catch {
        // ignore
      }
      finish();
    }, 2000);

    child.once('exit', () => {
      clearTimeout(timer);
      finish();
    });

    try {
      // Prefer graceful Node IPC shutdown (exits cleanly in ~10ms on Windows even with live SSE)
      if (typeof child.send === 'function' && child.connected) {
        child.send('shutdown');
      } else {
        child.kill('SIGTERM');
      }
    } catch {
      try {
        child.kill('SIGTERM');
      } catch {
        clearTimeout(timer);
        finish();
      }
    }
  });
}

// ---------------------------------------------------------------------------
// Login Item (Launch at Login)
// ---------------------------------------------------------------------------
function getLoginItemOptions() {
  if (app.isPackaged) {
    return {
      args: ['--autostart'],
    };
  }
  return {
    path: process.execPath,
    args: [DESKTOP_ROOT, '--autostart'],
  };
}

function getAutoStartEnabled() {
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return false;
  }
  try {
    const opts = getLoginItemOptions();
    const settings = app.isPackaged
      ? app.getLoginItemSettings()
      : app.getLoginItemSettings(opts);
    return Boolean(settings.openAtLogin);
  } catch {
    return false;
  }
}

function setAutoStartEnabled(enabled) {
  if (CLI.smokeTest) {
    return Boolean(enabled);
  }
  if (process.platform !== 'win32' && process.platform !== 'darwin') {
    return false;
  }
  try {
    const opts = getLoginItemOptions();
    app.setLoginItemSettings({
      openAtLogin: Boolean(enabled),
      ...opts,
    });
    return getAutoStartEnabled();
  } catch {
    return getAutoStartEnabled();
  }
}

// ---------------------------------------------------------------------------
// Desktop State & Broadcast
// ---------------------------------------------------------------------------
function getDesktopState() {
  const visible = Boolean(widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible());
  return {
    alwaysOnTop: Boolean(persistedState.alwaysOnTop),
    autoStart: getAutoStartEnabled(),
    widgetVisible: visible,
    version: PKG_VERSION,
    demoMode: CLI.demoMode,
    platform: process.platform,
  };
}

function broadcastDesktopState() {
  const snapshot = getDesktopState();
  for (const win of [widgetWindow, mainWindow]) {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('desktop:state-change', snapshot);
    }
  }
  refreshTrayMenu();
}

// ---------------------------------------------------------------------------
// Window A — Always-On-Top Desktop Floating Widget
// ---------------------------------------------------------------------------
function clampBoundsToDisplay(x, y, width, height) {
  const display = screen.getDisplayMatching({
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  });
  const wa = display.workArea;
  const maxW = Math.max(180, wa.width - SCREEN_MARGIN * 2);
  const maxH = Math.max(44, wa.height - SCREEN_MARGIN * 2);
  const w = Math.min(Math.round(width), maxW);
  const h = Math.min(Math.round(height), maxH);
  const minX = wa.x + 8;
  const maxX = Math.max(minX, wa.x + wa.width - w - 8);
  const minY = wa.y + 8;
  const maxY = Math.max(minY, wa.y + wa.height - h - 8);
  return {
    x: Math.max(minX, Math.min(maxX, Math.round(x))),
    y: Math.max(minY, Math.min(maxY, Math.round(y))),
    width: w,
    height: h,
    workArea: wa,
  };
}

function computeAnchoredWidgetBounds(targetWidth, targetHeight) {
  const anchor = persistedState.widgetAnchor;
  const primaryWa = screen.getPrimaryDisplay().workArea;

  if (anchor.anchorX === null || anchor.anchorY === null) {
    const defaultX = primaryWa.x + primaryWa.width - targetWidth - SCREEN_MARGIN;
    const defaultY = primaryWa.y + SCREEN_MARGIN;
    const clamped = clampBoundsToDisplay(defaultX, defaultY, targetWidth, targetHeight);
    persistedState.widgetAnchor = {
      horizontal: 'right',
      vertical: 'top',
      anchorX: clamped.x + clamped.width,
      anchorY: clamped.y,
    };
    return clamped;
  }

  const desiredX = anchor.horizontal === 'right'
    ? anchor.anchorX - targetWidth
    : anchor.anchorX;
  const desiredY = anchor.vertical === 'bottom'
    ? anchor.anchorY - targetHeight
    : anchor.anchorY;

  return clampBoundsToDisplay(desiredX, desiredY, targetWidth, targetHeight);
}

function captureAnchorFromCurrentWidget() {
  if (!widgetWindow || widgetWindow.isDestroyed() || isResizingWidget) return;
  const b = widgetWindow.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  const centerX = b.x + b.width / 2;
  const centerY = b.y + b.height / 2;
  const horizontal = centerX >= wa.x + wa.width / 2 ? 'right' : 'left';
  const vertical = centerY >= wa.y + wa.height / 2 ? 'bottom' : 'top';

  persistedState.widgetAnchor = {
    horizontal,
    vertical,
    anchorX: horizontal === 'right' ? b.x + b.width : b.x,
    anchorY: vertical === 'bottom' ? b.y + b.height : b.y,
  };
  scheduleSaveState();
}

function applyWidgetAlwaysOnTop(enabled) {
  persistedState.alwaysOnTop = Boolean(enabled);
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    if (persistedState.alwaysOnTop) {
      widgetWindow.setAlwaysOnTop(true, 'floating');
      if (process.platform === 'darwin') {
        widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
      }
    } else {
      widgetWindow.setAlwaysOnTop(false);
    }
  }
  scheduleSaveState();
  broadcastDesktopState();
  return persistedState.alwaysOnTop;
}

function applyWidgetBounds(bounds) {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  isResizingWidget = true;
  try {
    // Windows high-DPI workaround: unlock resizability during programmatic resize
    widgetWindow.setResizable(true);
    widgetWindow.setMinimumSize(140, 40);
    widgetWindow.setMaximumSize(700, 960);
    widgetWindow.setBounds(
      { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      false
    );
    widgetWindow.setContentSize(bounds.width, bounds.height);
    widgetWindow.setResizable(false);
  } finally {
    setTimeout(() => {
      isResizingWidget = false;
    }, 60);
  }
}

function resizeWidgetWindow(opts) {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  const rawW = Number(opts?.width);
  const rawH = Number(opts?.height);
  const expanded = Boolean(opts?.expanded);

  const targetW = Number.isFinite(rawW)
    ? Math.max(180, Math.min(560, Math.round(rawW)))
    : expanded ? 392 : COLLAPSED_DEFAULT.width;
  const targetH = Number.isFinite(rawH)
    ? Math.max(44, Math.min(820, Math.round(rawH)))
    : expanded ? 540 : COLLAPSED_DEFAULT.height;

  widgetExpanded = expanded;
  widgetSize = { width: targetW, height: targetH };

  const targetBounds = computeAnchoredWidgetBounds(targetW, targetH);
  applyWidgetBounds(targetBounds);
}

function createWidgetWindow() {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    return widgetWindow;
  }

  const initialBounds = computeAnchoredWidgetBounds(widgetSize.width, widgetSize.height);

  widgetWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: Boolean(persistedState.alwaysOnTop),
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    hasShadow: false,
    roundedCorners: false,
    show: false,
    title: `${APP_NAME} Widget`,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  if (persistedState.alwaysOnTop) {
    widgetWindow.setAlwaysOnTop(true, 'floating');
    if (process.platform === 'darwin') {
      widgetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    }
  }

  widgetWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  widgetWindow.on('moved', () => {
    if (!isResizingWidget) {
      captureAnchorFromCurrentWidget();
    }
  });

  widgetWindow.on('show', () => {
    persistedState.widgetVisible = true;
    scheduleSaveState();
    broadcastDesktopState();
  });

  widgetWindow.on('hide', () => {
    persistedState.widgetVisible = false;
    scheduleSaveState();
    broadcastDesktopState();
  });

  widgetWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      widgetWindow.hide();
    }
  });

  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });

  widgetWindow.once('ready-to-show', () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    if (CLI.smokeTest) {
      // Keep smoke test non-intrusive while still exercising full renderer lifecycle
      return;
    }
    if (persistedState.widgetVisible || !CLI.showMainOnStart) {
      widgetWindow.showInactive();
    }
  });

  widgetWindow.loadURL(`${getBaseUrl()}/?mode=widget`);
  return widgetWindow;
}

function setWidgetVisibility(visible) {
  if (!widgetWindow || widgetWindow.isDestroyed()) {
    if (!visible) return false;
    createWidgetWindow();
  }
  if (visible) {
    const clamped = computeAnchoredWidgetBounds(widgetSize.width, widgetSize.height);
    applyWidgetBounds(clamped);
    widgetWindow.show();
    if (persistedState.alwaysOnTop) {
      widgetWindow.setAlwaysOnTop(true, 'floating');
    }
    widgetWindow.focus();
  } else if (widgetWindow && !widgetWindow.isDestroyed()) {
    widgetWindow.hide();
  }
  persistedState.widgetVisible = Boolean(visible);
  scheduleSaveState();
  broadcastDesktopState();
  return persistedState.widgetVisible;
}

// ---------------------------------------------------------------------------
// Window B — Full Mission Board Window
// ---------------------------------------------------------------------------
function resolveMainWindowBounds() {
  const saved = persistedState.mainBounds;
  const primaryWa = screen.getPrimaryDisplay().workArea;
  const width = Math.min(Math.max(MAIN_DEFAULT.minWidth, saved.width || MAIN_DEFAULT.width), primaryWa.width);
  const height = Math.min(Math.max(MAIN_DEFAULT.minHeight, saved.height || MAIN_DEFAULT.height), primaryWa.height);

  if (saved.x === null || saved.y === null) {
    return {
      x: Math.round(primaryWa.x + (primaryWa.width - width) / 2),
      y: Math.round(primaryWa.y + (primaryWa.height - height) / 2),
      width,
      height,
      maximized: Boolean(saved.maximized),
    };
  }

  const display = screen.getDisplayMatching({ x: saved.x, y: saved.y, width, height });
  const wa = display.workArea;
  const clampedW = Math.min(width, wa.width);
  const clampedH = Math.min(height, wa.height);
  const x = Math.max(wa.x, Math.min(wa.x + wa.width - clampedW, saved.x));
  const y = Math.max(wa.y, Math.min(wa.y + wa.height - clampedH, saved.y));

  return { x, y, width: clampedW, height: clampedH, maximized: Boolean(saved.maximized) };
}

function createMainWindow(conversationId) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  const bounds = resolveMainWindowBounds();
  const bg = nativeTheme.shouldUseDarkColors ? '#111110' : '#F6F5F1';

  mainWindow = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: MAIN_DEFAULT.minWidth,
    minHeight: MAIN_DEFAULT.minHeight,
    autoHideMenuBar: true,
    show: false,
    title: CLI.demoMode ? `${APP_NAME} (Demo)` : APP_NAME,
    icon: getAppIconPath(),
    backgroundColor: bg,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  const saveMainGeometry = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (mainWindow.isMinimized()) return;
    const maximized = mainWindow.isMaximized();
    if (!maximized) {
      const b = mainWindow.getBounds();
      persistedState.mainBounds = {
        x: b.x,
        y: b.y,
        width: b.width,
        height: b.height,
        maximized: false,
      };
    } else {
      persistedState.mainBounds.maximized = true;
    }
    scheduleSaveState();
  };

  mainWindow.on('resize', saveMainGeometry);
  mainWindow.on('move', saveMainGeometry);
  mainWindow.on('maximize', saveMainGeometry);
  mainWindow.on('unmaximize', saveMainGeometry);

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    mainWindowReady = false;
  });

  mainWindowReady = false;
  mainWindow.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    if (isMainFrame && !isInPlace) {
      mainWindowReady = false;
    }
  });

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindowReady = true;
    if (pendingConversationId && mainWindow && !mainWindow.isDestroyed()) {
      const targetId = pendingConversationId;
      pendingConversationId = null;
      mainWindow.webContents.send('desktop:open-conversation', targetId);
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (!mainWindow || mainWindow.isDestroyed() || CLI.smokeTest) return;
    if (bounds.maximized) {
      mainWindow.maximize();
    }
    mainWindow.show();
    mainWindow.focus();
  });

  if (conversationId) {
    pendingConversationId = conversationId;
  }

  const hash = conversationId ? `#conv=${encodeURIComponent(conversationId)}` : '';
  mainWindow.loadURL(`${getBaseUrl()}/${hash}`);
  return mainWindow;
}

function openMainBoard(conversationId) {
  const cleanId = typeof conversationId === 'string' && conversationId.trim() ? conversationId.trim() : null;

  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow(cleanId);
    return;
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }
  if (!CLI.smokeTest) {
    mainWindow.show();
    mainWindow.focus();
  }

  if (cleanId) {
    if (!mainWindowReady) {
      pendingConversationId = cleanId;
    } else {
      mainWindow.webContents.send('desktop:open-conversation', cleanId);
    }
  }
}

function toggleMainBoard() {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && mainWindow.isFocused()) {
    mainWindow.hide();
    return;
  }
  openMainBoard();
}

// ---------------------------------------------------------------------------
// System Tray + Dynamic Tooltip & Menu
// ---------------------------------------------------------------------------
function formatTraySummaryText() {
  const { running, attention, initialized } = traySummary;
  if (!initialized) {
    return CLI.demoMode ? `${APP_NAME} (Demo)` : APP_NAME;
  }
  const suffix = CLI.demoMode ? ' [Demo]' : '';
  if (running === 0 && attention === 0) {
    return `${APP_NAME}${suffix} — 一切正常`;
  }
  return `${APP_NAME}${suffix} — ${running} 运行中 · ${attention} 待关注`;
}

function formatMenuStatusHeader() {
  const { running, attention, initialized } = traySummary;
  const tag = CLI.demoMode ? ' · Demo' : '';
  if (!initialized) {
    return `Mission Board v${PKG_VERSION}${tag}`;
  }
  if (running === 0 && attention === 0) {
    return `● 一切正常 (All Clear)${tag}`;
  }
  return `● ${running} 运行中 · ${attention} 待关注${tag}`;
}

function refreshTrayMenu() {
  if (!tray || tray.isDestroyed()) return;

  tray.setToolTip(formatTraySummaryText());

  const widgetVisible = Boolean(widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible());
  const autoStart = getAutoStartEnabled();

  const menu = Menu.buildFromTemplate([
    {
      label: formatMenuStatusHeader(),
      enabled: false,
    },
    { type: 'separator' },
    {
      label: '打开完整看板 (Open Mission Board)',
      accelerator: 'CommandOrControl+Shift+M',
      click: () => openMainBoard(),
    },
    {
      label: widgetVisible
        ? '隐藏桌面浮窗 (Hide Floating Widget)'
        : '显示桌面浮窗 (Show Floating Widget)',
      accelerator: 'CommandOrControl+Shift+W',
      click: () => setWidgetVisibility(!widgetVisible),
    },
    { type: 'separator' },
    {
      label: '浮窗置顶 (Always on Top)',
      type: 'checkbox',
      checked: Boolean(persistedState.alwaysOnTop),
      click: (item) => applyWidgetAlwaysOnTop(item.checked),
    },
    {
      label: '开机自动启动 (Launch at Login)',
      type: 'checkbox',
      checked: autoStart,
      enabled: process.platform === 'win32' || process.platform === 'darwin',
      click: (item) => {
        setAutoStartEnabled(item.checked);
        broadcastDesktopState();
      },
    },
    {
      label: '在浏览器中打开 (Open in Browser)',
      click: () => shell.openExternal(getBaseUrl()),
    },
    { type: 'separator' },
    {
      label: '退出 (Quit)',
      click: () => {
        void quitApp();
      },
    },
  ]);

  tray.setContextMenu(menu);
}

function createTray() {
  if (tray && !tray.isDestroyed()) return tray;

  tray = new Tray(getTrayIcon());
  tray.setToolTip(formatTraySummaryText());

  tray.on('click', () => {
    const visible = Boolean(widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible());
    setWidgetVisibility(!visible);
  });

  tray.on('double-click', () => {
    openMainBoard();
  });

  refreshTrayMenu();
  return tray;
}

function updateTraySummary(running, attention, fromIpc = true) {
  const nextRunning = Math.max(0, Number.parseInt(String(running ?? 0), 10) || 0);
  const nextAttention = Math.max(0, Number.parseInt(String(attention ?? 0), 10) || 0);
  if (fromIpc) {
    lastIpcSummaryAt = Date.now();
  }
  const changed =
    !traySummary.initialized ||
    traySummary.running !== nextRunning ||
    traySummary.attention !== nextAttention;

  traySummary = { running: nextRunning, attention: nextAttention, initialized: true };
  if (changed) {
    refreshTrayMenu();
  }
}

async function pollTraySummaryFallback() {
  if (isQuitting) return;
  // Skip fallback polling if renderer has pushed fresh stats within the last 12s
  if (Date.now() - lastIpcSummaryAt < 12_000) return;

  const board = await httpGetJson(`${getBaseUrl()}/api/board`, 1500);
  if (board && board.stats) {
    updateTraySummary(board.stats.runningCount, board.stats.attentionCount, false);
  }
}

// ---------------------------------------------------------------------------
// Global Shortcuts & Display Re-clamping
// ---------------------------------------------------------------------------
function registerGlobalShortcuts() {
  try {
    globalShortcut.register('CommandOrControl+Shift+M', () => {
      toggleMainBoard();
    });
  } catch {
    // Non-fatal if another app claimed the shortcut
  }

  try {
    globalShortcut.register('CommandOrControl+Shift+W', () => {
      const visible = Boolean(widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible());
      setWidgetVisibility(!visible);
    });
  } catch {
    // Non-fatal if another app claimed the shortcut
  }
}

function registerDisplayWatchers() {
  const reclamp = () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    const clamped = computeAnchoredWidgetBounds(widgetSize.width, widgetSize.height);
    applyWidgetBounds(clamped);
  };
  screen.on('display-metrics-changed', reclamp);
  screen.on('display-removed', reclamp);
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------
function registerIpcHandlers() {
  ipcMain.handle('desktop:resize-widget', (_event, opts) => {
    resizeWidgetWindow(opts);
  });

  ipcMain.handle('desktop:open-main-board', (_event, conversationId) => {
    openMainBoard(conversationId);
  });

  ipcMain.handle('desktop:hide-widget', () => {
    setWidgetVisibility(false);
  });

  ipcMain.handle('desktop:show-widget', () => {
    setWidgetVisibility(true);
  });

  ipcMain.handle('desktop:set-widget-visible', (_event, value) => {
    return setWidgetVisibility(Boolean(value));
  });

  ipcMain.handle('desktop:get-state', () => {
    return getDesktopState();
  });

  ipcMain.handle('desktop:set-always-on-top', (_event, value) => {
    return applyWidgetAlwaysOnTop(Boolean(value));
  });

  ipcMain.handle('desktop:set-auto-start', (_event, value) => {
    const next = setAutoStartEnabled(Boolean(value));
    broadcastDesktopState();
    return next;
  });

  ipcMain.on('desktop:tray-summary', (_event, summary) => {
    if (!summary || typeof summary !== 'object') return;
    updateTraySummary(summary.running, summary.attention, true);
  });

  ipcMain.on('desktop:set-theme', (_event, theme) => {
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
      nativeTheme.themeSource = theme;
      persistedState.theme = theme;
      scheduleSaveState();
    }
  });
}

// ---------------------------------------------------------------------------
// Clean Shutdown
// ---------------------------------------------------------------------------
async function quitApp(exitCode = 0) {
  if (isQuitting) return;
  isQuitting = true;

  if (fallbackPollTimer) {
    clearInterval(fallbackPollTimer);
    fallbackPollTimer = null;
  }

  try {
    globalShortcut.unregisterAll();
  } catch {
    // ignore
  }

  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }

  for (const win of [widgetWindow, mainWindow]) {
    if (win && !win.isDestroyed()) {
      win.destroy();
    }
  }

  await stopManagedServer();
  app.exit(exitCode);
}

// ---------------------------------------------------------------------------
// Smoke Verification Mode (--smoke-test)
// ---------------------------------------------------------------------------
async function runSmokeVerification(serverInfo) {
  const report = {
    ok: false,
    url: getBaseUrl(),
    serverSpawned: Boolean(serverInfo.spawned),
    serverRuntime: serverInfo.runtime || 'existing',
    health: serverInfo.health,
    widgetLoaded: false,
    preloadExposed: false,
    collapsedBounds: null,
    expandedBounds: null,
    recollapsedBounds: null,
    mainLoaded: false,
    openConversationIpc: false,
    trayCreated: Boolean(tray && !tray.isDestroyed()),
    errors: [],
  };

  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('widgetWindow load timeout')), 12_000);
      widgetWindow.webContents.once('did-finish-load', () => {
        clearTimeout(timeout);
        resolve();
      });
      widgetWindow.webContents.once('did-fail-load', (_e, code, desc) => {
        clearTimeout(timeout);
        reject(new Error(`widgetWindow failed to load (${code}): ${desc}`));
      });
    });
    report.widgetLoaded = true;

    const bridgeCheck = await widgetWindow.webContents.executeJavaScript(`
      (async () => {
        const api = window.missionBoardDesktop;
        if (!api || api.isDesktop !== true) return { ok: false };
        const state = await api.getDesktopState();
        api.updateTraySummary({ running: 3, attention: 4 });
        return { ok: true, state };
      })()
    `);
    report.preloadExposed = Boolean(bridgeCheck && bridgeCheck.ok);
    report.initialDesktopState = bridgeCheck?.state ?? null;

    report.collapsedBounds = widgetWindow.getBounds();
    await widgetWindow.webContents.executeJavaScript(
      'window.missionBoardDesktop.resizeWidget({ width: 392, height: 540, expanded: true })'
    );
    await new Promise((r) => setTimeout(r, 120));
    report.expandedBounds = widgetWindow.getBounds();

    await widgetWindow.webContents.executeJavaScript(
      'window.missionBoardDesktop.resizeWidget({ width: 276, height: 56, expanded: false })'
    );
    await new Promise((r) => setTimeout(r, 120));
    report.recollapsedBounds = widgetWindow.getBounds();

    // Open main window and verify IPC delivery
    openMainBoard('demo-smoke-conv-1');
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('mainWindow load timeout')), 12_000);
      mainWindow.webContents.once('did-finish-load', () => {
        clearTimeout(timeout);
        resolve();
      });
      mainWindow.webContents.once('did-fail-load', (_e, code, desc) => {
        clearTimeout(timeout);
        reject(new Error(`mainWindow failed to load (${code}): ${desc}`));
      });
    });
    report.mainLoaded = true;
    // Allow initial pendingConversationId message to flush before testing a second IPC dispatch
    await new Promise((r) => setTimeout(r, 150));

    // Register listeners in mainWindow and verify both openConversation & stateChange IPC
    const ipcProbe = await mainWindow.webContents.executeJavaScript(`
      new Promise((resolve) => {
        try {
          const timer = setTimeout(() => resolve({ status: 'timeout', hasApi: Boolean(window.missionBoardDesktop) }), 2500);
          let gotConv = null;
          let gotState = false;
          const finishIfDone = () => {
            if (gotConv === 'demo-ipc-check-42' && gotState) {
              clearTimeout(timer);
              try { unsubConv(); } catch {}
              try { unsubState(); } catch {}
              resolve({ status: 'received', id: gotConv, stateChanged: gotState });
            }
          };
          const unsubConv = window.missionBoardDesktop.onOpenConversation((id) => {
            if (id === 'demo-ipc-check-42') {
              gotConv = id;
              finishIfDone();
            }
          });
          const unsubState = window.missionBoardDesktop.onDesktopStateChange(() => {
            gotState = true;
            finishIfDone();
          });
          window.missionBoardDesktop.openMainBoard('demo-ipc-check-42');
          window.missionBoardDesktop.setAlwaysOnTop(false).then(() => window.missionBoardDesktop.setAlwaysOnTop(true));
        } catch (err) {
          resolve({ status: 'error', error: String(err) });
        }
      })
    `);
    report.ipcProbe = ipcProbe;
    report.openConversationIpc = ipcProbe?.id === 'demo-ipc-check-42' && ipcProbe?.stateChanged === true;

    const resizedUp =
      report.expandedBounds.width >= 380 && report.expandedBounds.height >= 500;
    const resizedBack =
      report.recollapsedBounds.width <= 290 && report.recollapsedBounds.height <= 70;

    report.ok = Boolean(
      report.widgetLoaded &&
        report.preloadExposed &&
        report.mainLoaded &&
        report.openConversationIpc &&
        report.trayCreated &&
        resizedUp &&
        resizedBack
    );
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err));
  }

  console.log('SMOKE_REPORT=' + JSON.stringify(report));
  await quitApp(report.ok ? 0 : 1);
}

// ---------------------------------------------------------------------------
// App Lifecycle Boot
// ---------------------------------------------------------------------------
if (process.platform === 'win32') {
  app.setAppUserModelId(APP_ID);
}

// Apply persisted nativeTheme preference
if (persistedState.theme === 'light' || persistedState.theme === 'dark') {
  nativeTheme.themeSource = persistedState.theme;
}

const hasSingleInstanceLock = CLI.smokeTest ? true : app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, commandLine) => {
    const wantsMain = commandLine.includes('--show-main');
    if (wantsMain) {
      openMainBoard();
      return;
    }
    const widgetVisible = Boolean(widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible());
    if (!widgetVisible) {
      setWidgetVisibility(true);
    } else {
      openMainBoard();
    }
  });

  app.on('window-all-closed', (event) => {
    // Keep app running silently in the System Tray until explicit Quit
    event.preventDefault();
  });

  app.on('before-quit', () => {
    if (!isQuitting) {
      void quitApp(0);
    }
  });

  app.on('will-quit', () => {
    try {
      globalShortcut.unregisterAll();
    } catch {
      // ignore
    }
  });

  process.on('SIGINT', () => {
    void quitApp(0);
  });
  process.on('SIGTERM', () => {
    void quitApp(0);
  });

  app.whenReady().then(async () => {
    try {
      const serverInfo = await ensureLocalServer();
      registerIpcHandlers();
      createTray();
      createWidgetWindow();
      registerDisplayWatchers();

      if (!CLI.smokeTest) {
        registerGlobalShortcuts();
        if (CLI.showMainOnStart && !CLI.autoStartLaunch) {
          openMainBoard();
        }
        // Populate initial tray tooltip promptly and maintain background fallback poll
        void pollTraySummaryFallback();
        fallbackPollTimer = setInterval(() => {
          void pollTraySummaryFallback();
        }, 15_000);
      } else {
        await runSmokeVerification(serverInfo);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (CLI.smokeTest) {
        console.error('SMOKE_ERROR=' + message);
        await quitApp(1);
        return;
      }
      dialog.showErrorBox(APP_NAME, message);
      await quitApp(1);
    }
  });
}
