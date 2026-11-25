import type http from 'node:http';
import type { RuntimeMetrics } from '../../shared/types.js';
import { createApp } from './api/createApp.js';
import { resolveConfig } from './config.js';
import { LiveBoardService } from './engine/boardService.js';
import { DemoBoardService } from './engine/demoService.js';
import type { IBoardService } from './engine/types.js';

export interface StartServerOptions {
  port?: number;
  host?: string;
  demoMode?: boolean;
  dataDir?: string;
  overlayDbPath?: string;
  staticDir?: string | null;
  silent?: boolean;
}

export interface MissionBoardServerHandle {
  server: http.Server;
  url: string;
  port: number;
  close: () => Promise<void>;
  setIdleMode: (idle: boolean) => void;
  getRuntimeMetrics: () => RuntimeMetrics;
}

/**
 * Start the Antigravity Mission Board HTTP + SSE server in-process.
 * Used both by the standalone CLI (`index.ts`) and directly inside Electron Main
 * to eliminate spawning a separate `node.exe` process (~50–80 MB RAM saved).
 */
export async function startMissionBoardServer(
  options: StartServerOptions = {},
): Promise<MissionBoardServerHandle> {
  const base = resolveConfig();
  const host = options.host ?? base.host;
  const requestedPort = options.port !== undefined ? options.port : base.port;
  const demoMode = options.demoMode !== undefined ? options.demoMode : base.demoMode;
  const dataDir = options.dataDir ?? base.dataDir;
  const overlayDbPath = options.overlayDbPath ?? base.overlayDbPath;
  const silent = options.silent === true;

  const service: IBoardService = demoMode
    ? new DemoBoardService()
    : new LiveBoardService(dataDir, overlayDbPath);

  const { app, sseBroker, staticDir } = createApp(service, {
    ...(options.staticDir !== undefined ? { staticDir: options.staticDir } : {}),
  });

  const server = await new Promise<http.Server>((resolve, reject) => {
    const srv = app.listen(requestedPort, host);
    const onError = (err: Error) => {
      sseBroker.close();
      service.close();
      reject(err);
    };
    srv.once('error', onError);
    srv.once('listening', () => {
      srv.removeListener('error', onError);
      resolve(srv);
    });
  });

  const addr = server.address();
  const boundPort = typeof addr === 'object' && addr ? addr.port : requestedPort;
  const url = `http://${host}:${boundPort}`;

  if (!silent) {
    const modeLabel = demoMode ? 'DEMO (synthetic dataset)' : 'LIVE (read-only)';
    console.log('');
    console.log(`  Antigravity Mission Board v${base.version}`);
    console.log(`  URL:   ${url}`);
    console.log(`  Mode:  ${modeLabel}`);
    if (!demoMode) {
      console.log(`  Data:  ${dataDir}`);
      console.log(`  Store: ${overlayDbPath}`);
    }
    if (staticDir) {
      console.log(`  UI:    ${staticDir}`);
    } else {
      console.log('  UI:    API-only (run web dev server or `npm run build` for UI)');
    }
    console.log('');
  }

  let closePromise: Promise<void> | null = null;
  const close = (): Promise<void> => {
    if (closePromise) return closePromise;

    closePromise = new Promise<void>((resolve) => {
      sseBroker.close();
      server.closeIdleConnections?.();
      server.close(() => {
        service.close();
        resolve();
      });
      server.closeAllConnections?.();

      setTimeout(() => {
        service.close();
        resolve();
      }, 1500).unref();
    });

    return closePromise;
  };

  const setIdleMode = (idle: boolean): void => {
    sseBroker.setIdleMode(idle);
  };

  const getRuntimeMetrics = (): RuntimeMetrics => {
    const svc = service.getMetrics();
    return {
      memoryRssMb: Math.round((process.memoryUsage().rss / (1024 * 1024)) * 10) / 10,
      pollCount: svc.pollCount,
      cacheHits: svc.cacheHits,
      skippedIdlePolls: svc.skippedIdlePolls,
      sseClients: sseBroker.clientCount,
    };
  };

  return {
    server,
    url,
    port: boundPort,
    close,
    setIdleMode,
    getRuntimeMetrics,
  };
}
