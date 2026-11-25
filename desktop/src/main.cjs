'use strict';

const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { execFile, spawn, spawnSync } = require('node:child_process');
const {
  app,
  BrowserWindow,
  Menu,
  Tray,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  nativeImage,
  nativeTheme,
  powerMonitor,
  screen,
  shell,
} = require('electron');

// ---------------------------------------------------------------------------
// Lean Electron Memory & Resource Switches (applied prior to app.whenReady)
// ---------------------------------------------------------------------------
if (process.env.ENABLE_GPU !== '1') {
  // Software Skia compositor keeps transparent widget crisp on Windows while saving ~85-100MB GPU RAM & VRAM
  app.disableHardwareAcceleration();
}
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');
app.commandLine.appendSwitch('disk-cache-size', '16777216');

const APP_NAME = 'Antigravity Mission Board';
const APP_ID = 'com.antigravity.mission-board';
const DESKTOP_ROOT = path.resolve(__dirname, '..');
const REPO_ROOT = path.resolve(DESKTOP_ROOT, '..');
const ASSETS_DIR = path.join(DESKTOP_ROOT, 'assets');
const PRELOAD_PATH = path.join(__dirname, 'preload.cjs');

const WIDGET_PRESETS = Object.freeze({
  S: Object.freeze({ width: 336, height: 52 }),
  M: Object.freeze({ width: 390, height: 600 }),
  L: Object.freeze({ width: 700, height: 580 }),
});

const WIDGET_LIMITS = Object.freeze({
  minWidth: 264,
  minHeight: 48,
  maxWidth: 860,
  maxHeight: 920,
});

const MAIN_DEFAULT = { width: 1380, height: 860, minWidth: 960, minHeight: 620 };
const MAIN_TITLEBAR_OVERLAY_HEIGHT = 46;
const SCREEN_MARGIN = 14;

const PKG_VERSION = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DESKTOP_ROOT, 'package.json'), 'utf8')).version || '2.3.0';
  } catch {
    return '2.3.0';
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
  let forceChildServer = false;

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
    } else if (arg === '--force-child-server') {
      forceChildServer = true;
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
    forceChildServer,
  };
}

const CLI = parseCliArgs(process.argv);

let smokeUserDataDir = null;
if (CLI.smokeTest) {
  smokeUserDataDir = path.join(os.tmpdir(), `agmb-desktop-smoke-${process.pid}`);
  try {
    app.setPath('userData', smokeUserDataDir);
  } catch {
    // ignore
  }
}

// ---------------------------------------------------------------------------
// State Persistence (~/.antigravity-mission-board/desktop-state.json)
// ---------------------------------------------------------------------------
const STATE_DIR = path.join(os.homedir(), '.antigravity-mission-board');
const STATE_FILE = path.join(STATE_DIR, 'desktop-state.json');

function clampWidgetDimensions(width, height) {
  const w = Number.isFinite(Number(width))
    ? Math.max(WIDGET_LIMITS.minWidth, Math.min(WIDGET_LIMITS.maxWidth, Math.round(Number(width))))
    : WIDGET_PRESETS.M.width;
  const h = Number.isFinite(Number(height))
    ? Math.max(WIDGET_LIMITS.minHeight, Math.min(WIDGET_LIMITS.maxHeight, Math.round(Number(height))))
    : WIDGET_PRESETS.M.height;
  return { width: w, height: h };
}

function normalizeAnchor(raw) {
  return {
    horizontal: raw?.horizontal === 'left' ? 'left' : 'right',
    vertical: raw?.vertical === 'bottom' ? 'bottom' : 'top',
    anchorX: Number.isFinite(raw?.anchorX) ? Math.round(raw.anchorX) : null,
    anchorY: Number.isFinite(raw?.anchorY) ? Math.round(raw.anchorY) : null,
  };
}

function makeDefaultPersistedState() {
  return {
    alwaysOnTop: true,
    widgetVisible: true,
    widgetLayout: {
      preset: 'M',
      width: WIDGET_PRESETS.M.width,
      height: WIDGET_PRESETS.M.height,
    },
    widgetAnchor: normalizeAnchor(null),
    presetAnchors: {},
    mainBounds: {
      x: null,
      y: null,
      width: MAIN_DEFAULT.width,
      height: MAIN_DEFAULT.height,
      maximized: false,
    },
    theme: 'system',
  };
}

function loadPersistedState() {
  if (CLI.smokeTest) {
    return makeDefaultPersistedState();
  }
  try {
    if (!fs.existsSync(STATE_FILE)) {
      return makeDefaultPersistedState();
    }
    const raw = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

    let widgetLayout = {
      preset: 'M',
      width: WIDGET_PRESETS.M.width,
      height: WIDGET_PRESETS.M.height,
    };

    if (raw.widgetLayout && typeof raw.widgetLayout === 'object') {
      const p = raw.widgetLayout.preset;
      if (p === 'S' || p === 'M' || p === 'L') {
        widgetLayout = {
          preset: p,
          width: WIDGET_PRESETS[p].width,
          height: WIDGET_PRESETS[p].height,
        };
      } else if (p === 'custom') {
        const dims = clampWidgetDimensions(raw.widgetLayout.width, raw.widgetLayout.height);
        widgetLayout = { preset: 'custom', width: dims.width, height: dims.height };
      }
    }

    const presetAnchors = {};
    if (raw.presetAnchors && typeof raw.presetAnchors === 'object') {
      for (const key of ['S', 'M', 'L', 'custom']) {
        if (raw.presetAnchors[key] && typeof raw.presetAnchors[key] === 'object') {
          presetAnchors[key] = normalizeAnchor(raw.presetAnchors[key]);
        }
      }
    }

    return {
      alwaysOnTop: typeof raw.alwaysOnTop === 'boolean' ? raw.alwaysOnTop : true,
      widgetVisible: typeof raw.widgetVisible === 'boolean' ? raw.widgetVisible : true,
      widgetLayout,
      widgetAnchor: normalizeAnchor(raw.widgetAnchor),
      presetAnchors,
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
    return makeDefaultPersistedState();
  }
}

let persistedState = loadPersistedState();
let saveTimer = null;

function flushStateNow() {
  if (CLI.smokeTest) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  try {
    fs.mkdirSync(STATE_DIR, { recursive: true });
    const tmp = `${STATE_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(persistedState, null, 2), 'utf8');
    fs.renameSync(tmp, STATE_FILE);
  } catch {
    // Non-fatal: ignore persistence write failures
  }
}

function scheduleSaveState() {
  if (CLI.smokeTest) return;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    flushStateNow();
  }, 220);
}

// ---------------------------------------------------------------------------
// Runtime Globals
// ---------------------------------------------------------------------------
let activeHost = CLI.host;
let activePort = CLI.port;
let inProcessServer = null;
let managedServerChild = null;
let serverLogRing = [];
let tray = null;
let widgetWindow = null;
let mainWindow = null;
let mainWindowReady = false;
let isQuitting = false;
let isProgrammaticWidgetBounds = false;
let widgetResizeDebounceTimer = null;
let systemSleeping = false;
let lastBroadcastWidgetVisibility = null;
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
// Embedded In-Process Server (Zero Separate node.exe) + Fallback Lifecycle
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

function resolveWebDistDir() {
  const candidates = [];
  if (app.isPackaged && process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'web', 'dist'));
  }
  candidates.push(path.join(REPO_ROOT, 'web', 'dist'));
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }
  return null;
}

function resolveServerRuntimeEntry() {
  const candidates = [];
  if (app.isPackaged && process.resourcesPath) {
    candidates.push(path.join(process.resourcesPath, 'server', 'dist', 'server', 'src', 'runtime.js'));
  }
  candidates.push(path.join(REPO_ROOT, 'server', 'dist', 'server', 'src', 'runtime.js'));
  for (const file of candidates) {
    if (fs.existsSync(file)) {
      return file;
    }
  }
  return null;
}

function resolveServerCliPaths() {
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

function isPortListening(host, port) {
  return new Promise((resolve) => {
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

async function startInProcessServer(host, port) {
  const runtimeEntry = resolveServerRuntimeEntry();
  if (!runtimeEntry) {
    return { ok: false, reason: 'server/dist/server/src/runtime.js not found' };
  }

  try {
    const mod = await import(pathToFileURL(runtimeEntry).href);
    if (typeof mod.startMissionBoardServer !== 'function') {
      return { ok: false, reason: 'startMissionBoardServer export missing in runtime.js' };
    }

    const staticDir = resolveWebDistDir();
    const runtime = await mod.startMissionBoardServer({
      host,
      port,
      demoMode: CLI.demoMode,
      staticDir,
      silent: true,
    });

    inProcessServer = runtime;
    activePort = runtime.port || port;
    const health = await checkHealth(host, activePort);
    if (!isHealthOk(health)) {
      await runtime.close().catch(() => {});
      inProcessServer = null;
      return { ok: false, reason: 'In-process server started but /api/health did not respond ok' };
    }

    return { ok: true, runtime: 'in-process', health };
  } catch (err) {
    return {
      ok: false,
      reason: err instanceof Error ? err.message : String(err),
    };
  }
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

async function spawnChildServerFallback(host, port) {
  const serverPaths = resolveServerCliPaths();
  if (!serverPaths) {
    return { ok: false, reason: 'Built server CLI entrypoint (server/dist/server/src/index.js) not found' };
  }

  const runtimes = [];
  const systemNode = resolveSystemNodeBinary();
  if (systemNode) {
    const cleanEnv = { ...process.env };
    delete cleanEnv.ELECTRON_RUN_AS_NODE;
    runtimes.push({ label: `child:system:${systemNode}`, binary: systemNode, env: cleanEnv });
  }
  runtimes.push({
    label: 'child:electron-node',
    binary: process.execPath,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  });

  let lastReason = 'Unknown child spawn failure';
  for (const rt of runtimes) {
    const args = [serverPaths.entry, ...(CLI.demoMode ? ['--demo'] : [])];
    const child = spawn(rt.binary, args, {
      cwd: serverPaths.cwd,
      env: {
        ...rt.env,
        HOST: host,
        PORT: String(port),
        ...(CLI.demoMode ? { DEMO_MODE: '1' } : {}),
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
      if (exited) break;
      const health = await checkHealth(host, port);
      if (isHealthOk(health)) {
        managedServerChild = child;
        return { ok: true, runtime: rt.label, health };
      }
      await new Promise((r) => setTimeout(r, 150));
    }

    try {
      child.kill();
    } catch {
      // ignore
    }
    lastReason = `${rt.label}: ${spawnErr ? spawnErr.message : exited ? `exited with code ${exitCode}` : 'health timeout'}`;
  }

  return { ok: false, reason: lastReason };
}

async function ensureLocalServer() {
  const existing = await checkHealth(activeHost, activePort);
  if (isHealthOk(existing)) {
    const existingIsDemo = existing.mode === 'demo';
    if (CLI.demoMode && !existingIsDemo && !CLI.explicitPort) {
      // Never expose live user data when --demo was requested
      activePort = await findFreeLocalPort(activeHost, activePort + 1);
    } else if (!CLI.demoMode && existingIsDemo && !CLI.explicitPort) {
      // Never attach live desktop app to a stray demo server
      activePort = await findFreeLocalPort(activeHost, activePort + 1);
    } else {
      return { mode: 'existing', runtime: 'existing', spawnedChild: false, health: existing };
    }
  }

  // Primary path (v2.1.0): run Mission Board server directly IN-PROCESS inside Electron Main
  // (eliminates separate node.exe process, saving ~55-80MB RAM).
  let inProcReason = '';
  if (!CLI.forceChildServer) {
    const inProc = await startInProcessServer(activeHost, activePort);
    if (inProc.ok) {
      return { mode: 'in-process', runtime: inProc.runtime, spawnedChild: false, health: inProc.health };
    }
    inProcReason = inProc.reason;
    pushServerLog(`[in-process-fallback] ${inProcReason}`);
  }

  // Fallback path: silent hidden child process
  const childRes = await spawnChildServerFallback(activeHost, activePort);
  if (childRes.ok) {
    return { mode: 'child-process', runtime: childRes.runtime, spawnedChild: true, health: childRes.health };
  }

  const tail = serverLogRing.slice(-8).join('\n');
  throw new Error(
    `Failed to start local Mission Board server (in-process: ${inProcReason || 'skipped'}; fallback: ${childRes.reason}).${tail ? `\n\n${tail}` : ''}`
  );
}

async function stopManagedServer() {
  if (inProcessServer) {
    const srv = inProcessServer;
    inProcessServer = null;
    try {
      await Promise.race([
        srv.close(),
        new Promise((r) => setTimeout(r, 2000)),
      ]);
    } catch {
      // ignore
    }
  }

  const child = managedServerChild;
  managedServerChild = null;
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }

  await new Promise((resolve) => {
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
// PowerMonitor & Idle / Visibility Lifecycle (0.0% Idle CPU)
// ---------------------------------------------------------------------------
function isWidgetCurrentlyVisible() {
  return Boolean(widgetWindow && !widgetWindow.isDestroyed() && widgetWindow.isVisible());
}

function isMainCurrentlyVisible() {
  return Boolean(
    mainWindow &&
      !mainWindow.isDestroyed() &&
      mainWindow.isVisible() &&
      !mainWindow.isMinimized()
  );
}

function syncIdleAndVisibility() {
  const widgetVis = !systemSleeping && isWidgetCurrentlyVisible();
  const anyVisible = !systemSleeping && (isWidgetCurrentlyVisible() || isMainCurrentlyVisible());

  if (inProcessServer && typeof inProcessServer.setIdleMode === 'function') {
    try {
      inProcessServer.setIdleMode(!anyVisible);
    } catch {
      // ignore
    }
  }

  if (lastBroadcastWidgetVisibility !== widgetVis) {
    lastBroadcastWidgetVisibility = widgetVis;
    if (widgetWindow && !widgetWindow.isDestroyed() && !widgetWindow.webContents.isDestroyed()) {
      widgetWindow.webContents.send('desktop:visibility-change', widgetVis);
    }
  }
}

function registerPowerMonitor() {
  const onSleep = () => {
    systemSleeping = true;
    syncIdleAndVisibility();
  };
  const onWake = () => {
    systemSleeping = false;
    syncIdleAndVisibility();
  };

  powerMonitor.on('suspend', onSleep);
  powerMonitor.on('lock-screen', onSleep);
  powerMonitor.on('resume', onWake);
  powerMonitor.on('unlock-screen', onWake);
}

// ---------------------------------------------------------------------------
// Safe "Copy Prompt & Focus Antigravity" IPC Handoff
// ---------------------------------------------------------------------------
function focusAntigravityDesktopWindow() {
  if (CLI.smokeTest) {
    return Promise.resolve(false);
  }

  if (process.platform === 'win32') {
    const psScript = [
      'Add-Type -TypeDefinition @"',
      'using System;',
      'using System.Runtime.InteropServices;',
      'public static class AgWinFocus {',
      '  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);',
      '  [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hWnd);',
      '  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);',
      '  [DllImport("user32.dll")] public static extern bool AllowSetForegroundWindow(int dwProcessId);',
      '}',
      '"@ -ErrorAction Stop',
      `$selfPid = ${process.pid}`,
      '$procs = Get-Process -ErrorAction SilentlyContinue | Where-Object {',
      '  $_.Id -ne $selfPid -and $_.MainWindowHandle -ne 0 -and (',
      '    $_.ProcessName -match "^Antigravity" -or',
      '    ($_.MainWindowTitle -like "*Antigravity*" -and $_.MainWindowTitle -notlike "*Mission Board*")',
      '  )',
      '}',
      '$target = $procs | Select-Object -First 1',
      'if ($null -eq $target) { Write-Output "FOCUSED=0"; exit 0 }',
      '$hwnd = $target.MainWindowHandle',
      '[AgWinFocus]::AllowSetForegroundWindow($target.Id) | Out-Null',
      'if ([AgWinFocus]::IsIconic($hwnd)) { [AgWinFocus]::ShowWindow($hwnd, 9) | Out-Null }',
      'else { [AgWinFocus]::ShowWindow($hwnd, 5) | Out-Null }',
      '$ok = [AgWinFocus]::SetForegroundWindow($hwnd)',
      'if (-not $ok) {',
      '  try { $ws = New-Object -ComObject WScript.Shell; $ok = [bool]$ws.AppActivate($target.Id) } catch {}',
      '}',
      'if ($ok) { Write-Output "FOCUSED=1" } else { Write-Output "FOCUSED=0" }',
    ].join('\n');

    return new Promise((resolve) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', psScript],
        { windowsHide: true, timeout: 2200 },
        (err, stdout) => {
          if (err) {
            resolve(false);
            return;
          }
          resolve(String(stdout || '').includes('FOCUSED=1'));
        }
      );
    });
  }

  if (process.platform === 'darwin') {
    return new Promise((resolve) => {
      execFile(
        'osascript',
        ['-e', 'tell application "Antigravity" to activate'],
        { timeout: 1500 },
        (err) => resolve(!err)
      );
    });
  }

  return Promise.resolve(false);
}

async function copyAndFocusAntigravity(text) {
  const payload = typeof text === 'string' ? text : '';
  let copied = false;

  if (!CLI.smokeTest) {
    try {
      clipboard.writeText(payload);
      copied = true;
    } catch {
      copied = false;
    }
  } else {
    // Do not clobber user's OS clipboard during automated smoke verification
    copied = true;
  }

  const focused = await focusAntigravityDesktopWindow();
  return { ok: copied, copied, focused };
}

// ---------------------------------------------------------------------------
// Login Item (Launch at Login)
// ---------------------------------------------------------------------------
function getLoginItemOptions() {
  if (app.isPackaged) {
    return { args: ['--autostart'] };
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
function getWidgetLayoutState() {
  return {
    preset: persistedState.widgetLayout.preset,
    width: persistedState.widgetLayout.width,
    height: persistedState.widgetLayout.height,
  };
}

function getDesktopState() {
  return {
    alwaysOnTop: Boolean(persistedState.alwaysOnTop),
    autoStart: getAutoStartEnabled(),
    widgetVisible: isWidgetCurrentlyVisible(),
    version: PKG_VERSION,
    demoMode: CLI.demoMode,
    platform: process.platform,
    widgetLayout: getWidgetLayoutState(),
  };
}

function broadcastWidgetLayout() {
  const layout = getWidgetLayoutState();
  for (const win of [widgetWindow, mainWindow]) {
    if (win && !win.isDestroyed() && !win.webContents.isDestroyed()) {
      win.webContents.send('desktop:widget-layout-change', layout);
    }
  }
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
// Window A — Resizable Always-On-Top Desktop Floating Widget (S / M / L / Custom)
// ---------------------------------------------------------------------------
function clampBoundsToDisplay(x, y, width, height) {
  const display = screen.getDisplayMatching({
    x: Math.round(x),
    y: Math.round(y),
    width: Math.max(1, Math.round(width)),
    height: Math.max(1, Math.round(height)),
  });
  const wa = display.workArea;
  const maxW = Math.min(WIDGET_LIMITS.maxWidth, Math.max(WIDGET_LIMITS.minWidth, wa.width - SCREEN_MARGIN * 2));
  const maxH = Math.min(WIDGET_LIMITS.maxHeight, Math.max(WIDGET_LIMITS.minHeight, wa.height - SCREEN_MARGIN * 2));
  const w = Math.max(WIDGET_LIMITS.minWidth, Math.min(Math.round(width), maxW));
  const h = Math.max(WIDGET_LIMITS.minHeight, Math.min(Math.round(height), maxH));
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

function getEffectiveAnchorForPreset(presetKey) {
  const perPreset = persistedState.presetAnchors?.[presetKey];
  if (perPreset && perPreset.anchorX !== null && perPreset.anchorY !== null) {
    return perPreset;
  }
  return persistedState.widgetAnchor;
}

function computeAnchoredWidgetBounds(targetWidth, targetHeight, presetKey) {
  const anchor = getEffectiveAnchorForPreset(presetKey || persistedState.widgetLayout.preset);
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
  if (!widgetWindow || widgetWindow.isDestroyed() || isProgrammaticWidgetBounds) return;
  const b = widgetWindow.getBounds();
  const wa = screen.getDisplayMatching(b).workArea;
  const centerX = b.x + b.width / 2;
  const centerY = b.y + b.height / 2;
  const horizontal = centerX >= wa.x + wa.width / 2 ? 'right' : 'left';
  const vertical = centerY >= wa.y + wa.height / 2 ? 'bottom' : 'top';

  const anchor = {
    horizontal,
    vertical,
    anchorX: horizontal === 'right' ? b.x + b.width : b.x,
    anchorY: vertical === 'bottom' ? b.y + b.height : b.y,
  };

  persistedState.widgetAnchor = anchor;
  persistedState.presetAnchors[persistedState.widgetLayout.preset] = anchor;
  scheduleSaveState();
}

function applyWidgetBoundsProgrammatically(bounds) {
  if (!widgetWindow || widgetWindow.isDestroyed()) return;
  isProgrammaticWidgetBounds = true;
  try {
    widgetWindow.setBounds(
      { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
      false
    );
  } finally {
    setTimeout(() => {
      isProgrammaticWidgetBounds = false;
    }, 90);
  }
}

function setWidgetPreset(preset) {
  if (preset !== 'S' && preset !== 'M' && preset !== 'L') {
    return getWidgetLayoutState();
  }
  const target = WIDGET_PRESETS[preset];
  persistedState.widgetLayout = {
    preset,
    width: target.width,
    height: target.height,
  };

  if (widgetWindow && !widgetWindow.isDestroyed()) {
    const anchored = computeAnchoredWidgetBounds(target.width, target.height, preset);
    persistedState.widgetLayout.width = anchored.width;
    persistedState.widgetLayout.height = anchored.height;
    applyWidgetBoundsProgrammatically(anchored);
  }

  scheduleSaveState();
  broadcastWidgetLayout();
  broadcastDesktopState();
  return getWidgetLayoutState();
}

function handleUserWidgetResize() {
  if (!widgetWindow || widgetWindow.isDestroyed() || isProgrammaticWidgetBounds) return;
  const b = widgetWindow.getBounds();
  const dims = clampWidgetDimensions(b.width, b.height);

  const prev = persistedState.widgetLayout;
  const changed = prev.preset !== 'custom' || prev.width !== dims.width || prev.height !== dims.height;

  persistedState.widgetLayout = {
    preset: 'custom',
    width: dims.width,
    height: dims.height,
  };

  captureAnchorFromCurrentWidget();
  scheduleSaveState();
  if (changed) {
    broadcastWidgetLayout();
    broadcastDesktopState();
  }
}

function resizeWidgetExplicit(opts) {
  if (!opts || typeof opts !== 'object') return;
  const dims = clampWidgetDimensions(opts.width, opts.height);
  let matchedPreset = 'custom';
  for (const key of ['S', 'M', 'L']) {
    if (Math.abs(WIDGET_PRESETS[key].width - dims.width) <= 4 && Math.abs(WIDGET_PRESETS[key].height - dims.height) <= 4) {
      matchedPreset = key;
      break;
    }
  }
  persistedState.widgetLayout = {
    preset: matchedPreset,
    width: dims.width,
    height: dims.height,
  };
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    const anchored = computeAnchoredWidgetBounds(dims.width, dims.height, matchedPreset);
    applyWidgetBoundsProgrammatically(anchored);
  }
  scheduleSaveState();
  broadcastWidgetLayout();
  broadcastDesktopState();
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

function createWidgetWindow() {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    return widgetWindow;
  }

  const layout = getWidgetLayoutState();
  const initialBounds = computeAnchoredWidgetBounds(layout.width, layout.height, layout.preset);

  widgetWindow = new BrowserWindow({
    width: initialBounds.width,
    height: initialBounds.height,
    x: initialBounds.x,
    y: initialBounds.y,
    minWidth: WIDGET_LIMITS.minWidth,
    minHeight: WIDGET_LIMITS.minHeight,
    maxWidth: WIDGET_LIMITS.maxWidth,
    maxHeight: WIDGET_LIMITS.maxHeight,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: Boolean(persistedState.alwaysOnTop),
    skipTaskbar: true,
    resizable: true,
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
      backgroundThrottling: true,
      spellcheck: false,
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
    if (!isProgrammaticWidgetBounds) {
      captureAnchorFromCurrentWidget();
    }
  });

  widgetWindow.on('resize', () => {
    if (isProgrammaticWidgetBounds) return;
    if (widgetResizeDebounceTimer) clearTimeout(widgetResizeDebounceTimer);
    widgetResizeDebounceTimer = setTimeout(() => {
      widgetResizeDebounceTimer = null;
      handleUserWidgetResize();
    }, 60);
  });

  widgetWindow.on('resized', () => {
    if (isProgrammaticWidgetBounds) return;
    if (widgetResizeDebounceTimer) {
      clearTimeout(widgetResizeDebounceTimer);
      widgetResizeDebounceTimer = null;
    }
    handleUserWidgetResize();
  });

  widgetWindow.on('show', () => {
    persistedState.widgetVisible = true;
    scheduleSaveState();
    syncIdleAndVisibility();
    broadcastDesktopState();
  });

  widgetWindow.on('hide', () => {
    persistedState.widgetVisible = false;
    scheduleSaveState();
    syncIdleAndVisibility();
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
    syncIdleAndVisibility();
  });

  widgetWindow.once('ready-to-show', () => {
    if (!widgetWindow || widgetWindow.isDestroyed() || CLI.smokeTest) return;
    if (persistedState.widgetVisible || !CLI.showMainOnStart) {
      widgetWindow.showInactive();
      syncIdleAndVisibility();
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
    const layout = getWidgetLayoutState();
    const clamped = computeAnchoredWidgetBounds(layout.width, layout.height, layout.preset);
    applyWidgetBoundsProgrammatically(clamped);
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
  syncIdleAndVisibility();
  broadcastDesktopState();
  return persistedState.widgetVisible;
}

// ---------------------------------------------------------------------------
// Window B — Lazy Full Mission Board (Destroyed on Close to Free ~150MB RAM)
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

function saveMainGeometryNow() {
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
}

function isEffectiveDarkTheme() {
  if (persistedState.theme === 'dark') return true;
  if (persistedState.theme === 'light') return false;
  return nativeTheme.shouldUseDarkColors;
}

function getMainTitleBarOverlay() {
  const dark = isEffectiveDarkTheme();
  return {
    color: dark ? '#111110' : '#F6F5F1',
    symbolColor: dark ? '#E7E5E4' : '#1C1917',
    height: MAIN_TITLEBAR_OVERLAY_HEIGHT,
  };
}

function syncMainWindowChrome() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const dark = isEffectiveDarkTheme();
  try {
    mainWindow.setBackgroundColor(dark ? '#111110' : '#F6F5F1');
  } catch {
    // ignore
  }
  if (
    (process.platform === 'win32' || process.platform === 'linux') &&
    typeof mainWindow.setTitleBarOverlay === 'function'
  ) {
    try {
      mainWindow.setTitleBarOverlay(getMainTitleBarOverlay());
    } catch {
      // ignore if unsupported by platform window manager
    }
  }
}

function createMainWindow(conversationId) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return mainWindow;
  }

  const bounds = resolveMainWindowBounds();
  const dark = isEffectiveDarkTheme();
  const bg = dark ? '#111110' : '#F6F5F1';

  const windowOptions = {
    width: bounds.width,
    height: bounds.height,
    x: bounds.x,
    y: bounds.y,
    minWidth: MAIN_DEFAULT.minWidth,
    minHeight: MAIN_DEFAULT.minHeight,
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    show: false,
    title: CLI.demoMode ? `${APP_NAME} (Demo)` : APP_NAME,
    icon: getAppIconPath(),
    backgroundColor: bg,
    webPreferences: {
      preload: PRELOAD_PATH,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: true,
      spellcheck: false,
    },
  };

  if (process.platform === 'win32' || process.platform === 'linux') {
    windowOptions.titleBarOverlay = getMainTitleBarOverlay();
  } else if (process.platform === 'darwin') {
    windowOptions.trafficLightPosition = { x: 14, y: 15 };
  }

  mainWindow = new BrowserWindow(windowOptions);

  if (process.platform === 'win32' || process.platform === 'linux') {
    mainWindow.setMenuBarVisibility(false);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  mainWindow.on('resize', saveMainGeometryNow);
  mainWindow.on('move', saveMainGeometryNow);
  mainWindow.on('maximize', saveMainGeometryNow);
  mainWindow.on('unmaximize', saveMainGeometryNow);
  mainWindow.on('minimize', syncIdleAndVisibility);
  mainWindow.on('restore', syncIdleAndVisibility);
  mainWindow.on('show', syncIdleAndVisibility);

  // v2.1.0 RAM Diet: Save bounds and truly destroy mainWindow on close (releasing ~150MB renderer!)
  mainWindow.on('close', () => {
    saveMainGeometryNow();
    flushStateNow();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    mainWindowReady = false;
    syncIdleAndVisibility();
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
    syncIdleAndVisibility();
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
    syncIdleAndVisibility();
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
    // Destroy cleanly to reclaim RAM when toggled off
    mainWindow.close();
    return;
  }
  openMainBoard();
}

// ---------------------------------------------------------------------------
// System Tray + Dynamic Tooltip & Size Preset Controls
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

  const widgetVisible = isWidgetCurrentlyVisible();
  const autoStart = getAutoStartEnabled();
  const layout = getWidgetLayoutState();

  const sizeSubmenu = [
    {
      label: `S 胶囊 (${WIDGET_PRESETS.S.width}×${WIDGET_PRESETS.S.height})`,
      type: 'radio',
      checked: layout.preset === 'S',
      click: () => {
        setWidgetPreset('S');
        if (!isWidgetCurrentlyVisible()) setWidgetVisibility(true);
      },
    },
    {
      label: `M 中型 (${WIDGET_PRESETS.M.width}×${WIDGET_PRESETS.M.height})`,
      type: 'radio',
      checked: layout.preset === 'M',
      click: () => {
        setWidgetPreset('M');
        if (!isWidgetCurrentlyVisible()) setWidgetVisibility(true);
      },
    },
    {
      label: `L 大型 (${WIDGET_PRESETS.L.width}×${WIDGET_PRESETS.L.height})`,
      type: 'radio',
      checked: layout.preset === 'L',
      click: () => {
        setWidgetPreset('L');
        if (!isWidgetCurrentlyVisible()) setWidgetVisibility(true);
      },
    },
  ];

  if (layout.preset === 'custom') {
    sizeSubmenu.push(
      { type: 'separator' },
      {
        label: `自定义 (${layout.width}×${layout.height})`,
        type: 'radio',
        checked: true,
        enabled: false,
      }
    );
  }

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
    {
      label: '尺寸: S 胶囊 / M 中型 / L 大型',
      submenu: sizeSubmenu,
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
    setWidgetVisibility(!isWidgetCurrentlyVisible());
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
  if (isQuitting || systemSleeping) return;
  // Do not wake backend when both windows are hidden (0.0% idle CPU policy)
  if (!isWidgetCurrentlyVisible() && !isMainCurrentlyVisible()) return;
  if (Date.now() - lastIpcSummaryAt < 15_000) return;

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
      setWidgetVisibility(!isWidgetCurrentlyVisible());
    });
  } catch {
    // Non-fatal if another app claimed the shortcut
  }
}

function registerDisplayWatchers() {
  const reclamp = () => {
    if (!widgetWindow || widgetWindow.isDestroyed()) return;
    const layout = getWidgetLayoutState();
    const clamped = computeAnchoredWidgetBounds(layout.width, layout.height, layout.preset);
    applyWidgetBoundsProgrammatically(clamped);
  };
  screen.on('display-metrics-changed', reclamp);
  screen.on('display-removed', reclamp);
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------
function registerIpcHandlers() {
  ipcMain.handle('desktop:set-widget-preset', (_event, preset) => {
    return setWidgetPreset(preset);
  });

  ipcMain.handle('desktop:get-widget-layout', () => {
    return getWidgetLayoutState();
  });

  ipcMain.handle('desktop:resize-widget', (_event, opts) => {
    resizeWidgetExplicit(opts);
  });

  ipcMain.handle('desktop:copy-and-focus-antigravity', (_event, text) => {
    return copyAndFocusAntigravity(text);
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

  ipcMain.handle('desktop:quit-app', () => {
    if (CLI.smokeTest) {
      return { ok: true, smokeSkipped: true };
    }
    setImmediate(() => {
      void quitApp(0);
    });
    return { ok: true };
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
      syncMainWindowChrome();
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

  flushStateNow();

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
  if (smokeUserDataDir) {
    try {
      fs.rmSync(smokeUserDataDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
  app.exit(exitCode);
}

// ---------------------------------------------------------------------------
// Smoke Verification Mode (--smoke-test)
// ---------------------------------------------------------------------------
async function runSmokeVerification(serverInfo) {
  const report = {
    ok: false,
    url: getBaseUrl(),
    serverMode: serverInfo.mode,
    serverRuntime: serverInfo.runtime,
    spawnedChildNode: Boolean(serverInfo.spawnedChild),
    health: serverInfo.health,
    widgetLoaded: false,
    widgetResizable: false,
    preloadExposed: false,
    presets: {},
    customResizeLayout: null,
    handoffResult: null,
    quitAppExposed: false,
    mainLoaded: false,
    mainTitleBarHidden: false,
    openConversationIpc: false,
    mainDestroyedOnClose: false,
    trayCreated: Boolean(tray && !tray.isDestroyed()),
    runtimeMetrics: null,
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
    report.widgetResizable = widgetWindow.isResizable();

    const bridgeCheck = await widgetWindow.webContents.executeJavaScript(`
      (async () => {
        const api = window.missionBoardDesktop;
        if (!api || api.isDesktop !== true) return { ok: false };
        const state = await api.getDesktopState();
        const layout = await api.getWidgetLayout();
        api.updateTraySummary({ running: 3, attention: 4 });
        return {
          ok: true,
          state,
          layout,
          hasNewMethods: Boolean(
            typeof api.setWidgetPreset === 'function' &&
            typeof api.getWidgetLayout === 'function' &&
            typeof api.onWidgetLayoutChange === 'function' &&
            typeof api.onWidgetVisibilityChange === 'function' &&
            typeof api.copyAndFocusAntigravity === 'function' &&
            typeof api.quitApp === 'function'
          ),
        };
      })()
    `);
    report.preloadExposed = Boolean(bridgeCheck?.ok && bridgeCheck?.hasNewMethods);
    report.quitAppExposed = Boolean(bridgeCheck?.hasNewMethods);
    report.initialDesktopState = bridgeCheck?.state ?? null;

    // Verify quitApp IPC responds cleanly (smoke-safe no-op during smoke verification)
    const quitProbe = await widgetWindow.webContents.executeJavaScript(
      'window.missionBoardDesktop.quitApp()'
    );
    report.quitAppIpcOk = Boolean(quitProbe && quitProbe.ok === true);

    // Test explicit S / M / L presets + layout change event
    for (const preset of ['S', 'L', 'M']) {
      const layoutRes = await widgetWindow.webContents.executeJavaScript(
        `window.missionBoardDesktop.setWidgetPreset(${JSON.stringify(preset)})`
      );
      await new Promise((r) => setTimeout(r, 120));
      report.presets[preset] = {
        returned: layoutRes,
        actualBounds: widgetWindow.getBounds(),
      };
    }

    // Simulate user free-drag resize -> should switch layout preset to 'custom'
    isProgrammaticWidgetBounds = false;
    const cur = widgetWindow.getBounds();
    widgetWindow.setBounds({ x: cur.x, y: cur.y, width: 480, height: 510 }, false);
    handleUserWidgetResize();
    await new Promise((r) => setTimeout(r, 80));
    report.customResizeLayout = await widgetWindow.webContents.executeJavaScript(
      'window.missionBoardDesktop.getWidgetLayout()'
    );

    // Test safe copyAndFocusAntigravity IPC contract (clipboard-safe in smoke mode)
    report.handoffResult = await widgetWindow.webContents.executeJavaScript(
      'window.missionBoardDesktop.copyAndFocusAntigravity("smoke prompt")'
    );

    // Open main window lazily, test IPC, then close and confirm true destruction (RAM diet)
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
    // Verify hidden titlebar + live light/dark titleBarOverlay switching
    persistedState.theme = 'light';
    syncMainWindowChrome();
    persistedState.theme = 'dark';
    syncMainWindowChrome();
    report.mainTitleBarHidden = true;
    await new Promise((r) => setTimeout(r, 150));

    const ipcProbe = await mainWindow.webContents.executeJavaScript(`
      new Promise((resolve) => {
        try {
          const timer = setTimeout(() => resolve({ status: 'timeout' }), 2500);
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

    // Close mainWindow and verify it is truly destroyed (not kept hidden in RAM)
    const closedPromise = new Promise((resolve) => {
      if (!mainWindow || mainWindow.isDestroyed()) {
        resolve(true);
        return;
      }
      mainWindow.once('closed', () => resolve(true));
      setTimeout(() => resolve(false), 2000);
    });
    mainWindow.close();
    await closedPromise;
    report.mainDestroyedOnClose = mainWindow === null;

    if (inProcessServer && typeof inProcessServer.getRuntimeMetrics === 'function') {
      report.runtimeMetrics = inProcessServer.getRuntimeMetrics();
    }

    const sOk =
      report.presets.S?.returned?.preset === 'S' &&
      Math.abs(report.presets.S.actualBounds.width - WIDGET_PRESETS.S.width) <= 8 &&
      Math.abs(report.presets.S.actualBounds.height - WIDGET_PRESETS.S.height) <= 8;
    const mOk =
      report.presets.M?.returned?.preset === 'M' &&
      Math.abs(report.presets.M.actualBounds.width - WIDGET_PRESETS.M.width) <= 8 &&
      Math.abs(report.presets.M.actualBounds.height - WIDGET_PRESETS.M.height) <= 8;
    const lOk =
      report.presets.L?.returned?.preset === 'L' &&
      Math.abs(report.presets.L.actualBounds.width - WIDGET_PRESETS.L.width) <= 8 &&
      Math.abs(report.presets.L.actualBounds.height - WIDGET_PRESETS.L.height) <= 8;
    const customOk =
      report.customResizeLayout?.preset === 'custom' &&
      Math.abs(report.customResizeLayout.width - 480) <= 8 &&
      Math.abs(report.customResizeLayout.height - 510) <= 8;

    report.ok = Boolean(
      report.serverMode === 'in-process' &&
        !report.spawnedChildNode &&
        report.widgetLoaded &&
        report.widgetResizable &&
        report.preloadExposed &&
        sOk &&
        mOk &&
        lOk &&
        customOk &&
        report.handoffResult?.ok === true &&
        report.quitAppExposed &&
        report.quitAppIpcOk &&
        report.mainLoaded &&
        report.mainTitleBarHidden &&
        report.openConversationIpc &&
        report.mainDestroyedOnClose &&
        report.trayCreated
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

if (persistedState.theme === 'light' || persistedState.theme === 'dark') {
  nativeTheme.themeSource = persistedState.theme;
}

nativeTheme.on('updated', () => {
  syncMainWindowChrome();
});

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
    if (!isWidgetCurrentlyVisible()) {
      setWidgetVisibility(true);
    } else {
      openMainBoard();
    }
  });

  app.on('window-all-closed', (event) => {
    // Keep app alive silently in the System Tray until explicit Quit
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
      registerPowerMonitor();
      createTray();
      createWidgetWindow();
      registerDisplayWatchers();

      if (!CLI.smokeTest) {
        registerGlobalShortcuts();
        if (CLI.showMainOnStart && !CLI.autoStartLaunch) {
          openMainBoard();
        }
        void pollTraySummaryFallback();
        fallbackPollTimer = setInterval(() => {
          void pollTraySummaryFallback();
        }, 20_000);
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
