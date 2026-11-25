import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import type { DispatchCapabilities } from '../../../shared/types.js';

let cachedCapabilities: DispatchCapabilities | null = null;
let cachedAgyExecutable: string | null = null;

/**
 * Locate documented `agy` CLI executable in system PATH without spawning a subprocess.
 */
export function findAgyCliPath(envPath = process.env.PATH ?? ''): string | null {
  if (!envPath) return null;
  const dirs = envPath.split(path.delimiter).filter(Boolean);
  const candidates =
    process.platform === 'win32' ? ['agy.exe', 'agy.cmd', 'agy.bat'] : ['agy'];

  for (const dir of dirs) {
    for (const bin of candidates) {
      const fullPath = path.join(dir, bin);
      try {
        fs.accessSync(fullPath, fs.constants.X_OK);
        const st = fs.statSync(fullPath);
        if (st.isFile()) return fullPath;
      } catch {
        // continue scanning PATH
      }
    }
  }
  return null;
}

/**
 * Check whether the documented `antigravity://` OS URI protocol is registered on Windows.
 */
function checkProtocolSchemeRegistered(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    execFileSync('reg.exe', ['query', 'HKCR\\antigravity'], {
      stdio: 'ignore',
      windowsHide: true,
      timeout: 1200,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect available official dispatch capabilities once and cache the result.
 * Strictly relies only on documented public interfaces (`agy` CLI & OS URI registration).
 */
export function detectDispatchCapabilities(forceRefresh = false): DispatchCapabilities {
  if (cachedCapabilities && !forceRefresh) {
    return cachedCapabilities;
  }

  cachedAgyExecutable = findAgyCliPath();
  const agyCliAvailable = cachedAgyExecutable !== null;
  const protocolSchemeAvailable = checkProtocolSchemeRegistered();

  cachedCapabilities = {
    agyCliAvailable,
    protocolSchemeAvailable,
    mode: agyCliAvailable ? 'agy_cli' : 'handoff',
  };

  return cachedCapabilities;
}

/**
 * Dispatch a follow-up prompt using the officially documented Antigravity CLI headless flags:
 * `agy --conversation <conversation_id> --prompt <prompt>`
 * Returns true if the process was launched cleanly, false to gracefully fall back to handoff.
 */
export function launchAgyCliDispatch(
  conversationId: string,
  prompt: string,
  workspacePath?: string,
): boolean {
  const agyBin = cachedAgyExecutable ?? findAgyCliPath();
  if (!agyBin) return false;

  let cwd: string | undefined;
  if (workspacePath) {
    try {
      if (fs.statSync(workspacePath).isDirectory()) {
        cwd = workspacePath;
      }
    } catch {
      cwd = undefined;
    }
  }

  try {
    const child = spawn(agyBin, ['--conversation', conversationId, '--prompt', prompt], {
      cwd,
      detached: true,
      windowsHide: true,
      stdio: 'ignore',
    });
    child.on('error', () => {
      // Ignore asynchronous spawn errors after detached handoff
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}
