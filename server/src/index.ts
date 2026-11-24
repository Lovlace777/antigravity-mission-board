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
    console.log('  Antigravity Mission Board');
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

  const shutdown = (signal: string) => {
    console.log(`\nReceived ${signal}, shutting down...`);
    sseBroker.close();
    server.close(() => {
      service.close();
      process.exit(0);
    });
    // Force exit if lingering keep-alive sockets delay shutdown
    setTimeout(() => {
      service.close();
      process.exit(0);
    }, 3000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main();
