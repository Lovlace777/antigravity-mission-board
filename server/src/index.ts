import { createApp } from './api/createApp.js';
import { resolveConfig } from './config.js';
import { LiveBoardService } from './engine/boardService.js';
import { DemoBoardService } from './engine/demoService.js';
import type { IBoardService } from './engine/types.js';

function main(): void {
  const config = resolveConfig();

  const service: IBoardService = config.demoMode
    ? new DemoBoardService()
    : new LiveBoardService(config.dataDir, config.overlayDbPath);

  const { app, sseBroker, staticDir } = createApp(service);

  const server = app.listen(config.port, config.host, () => {
    const modeLabel = config.demoMode ? 'DEMO (synthetic dataset)' : 'LIVE (read-only)';
    console.log('');
    console.log(`  Antigravity Mission Board v${config.version}`);
    console.log(`  URL:   http://${config.host}:${config.port}`);
    console.log(`  Mode:  ${modeLabel}`);
    if (!config.demoMode) {
      console.log(`  Data:  ${config.dataDir}`);
      console.log(`  Store: ${config.overlayDbPath}`);
    }
    if (staticDir) {
      console.log(`  UI:    ${staticDir}`);
    } else {
      console.log('  UI:    API-only (run web dev server or `npm run build` for UI)');
    }
    console.log('');
  });

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`Port ${config.port} on ${config.host} is already in use.`);
    } else {
      console.error('Server error:', err.message);
    }
    sseBroker.close();
    service.close();
    process.exit(1);
  });

  let shuttingDown = false;
  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;

    console.log(`\nReceived ${signal}, shutting down...`);
    sseBroker.close();

    // Immediately terminate idle & keep-alive connections so Electron tray Quit exits cleanly
    server.closeIdleConnections?.();
    server.close(() => {
      service.close();
      process.exit(0);
    });
    server.closeAllConnections?.();

    // Safety fallback if any socket still refuses to close
    setTimeout(() => {
      service.close();
      process.exit(0);
    }, 1500).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGBREAK', () => shutdown('SIGBREAK'));
  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      shutdown('IPC');
    }
  });
}

main();
