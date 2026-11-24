import os from 'node:os';
import path from 'node:path';

export interface ServerConfig {
  host: string;
  port: number;
  demoMode: boolean;
  dataDir: string;
  overlayDbPath: string;
  version: string;
  defaultPollIntervalMs: number;
  defaultStaleAfterHours: number;
}

export const APP_VERSION = '0.1.0';

export function resolveConfig(argv: string[] = process.argv, env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const demoFlag = argv.includes('--demo');
  const demoEnv = env.DEMO_MODE === '1' || env.DEMO_MODE?.toLowerCase() === 'true';
  const demoMode = demoFlag || demoEnv;

  const host = env.HOST?.trim() || '127.0.0.1';
  const rawPort = Number.parseInt(env.PORT ?? '3777', 10);
  const port = Number.isFinite(rawPort) && rawPort > 0 && rawPort <= 65535 ? rawPort : 3777;

  const dataDir = env.ANTIGRAVITY_DATA_DIR?.trim()
    ? path.resolve(env.ANTIGRAVITY_DATA_DIR.trim())
    : path.join(os.homedir(), '.gemini', 'antigravity');

  const overlayDbPath = env.OVERLAY_DB_PATH?.trim()
    ? path.resolve(env.OVERLAY_DB_PATH.trim())
    : path.join(os.homedir(), '.antigravity-mission-board', 'overlay.db');

  return {
    host,
    port,
    demoMode,
    dataDir,
    overlayDbPath,
    version: APP_VERSION,
    defaultPollIntervalMs: 3000,
    defaultStaleAfterHours: 72,
  };
}
