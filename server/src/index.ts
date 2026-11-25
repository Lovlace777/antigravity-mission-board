import { startMissionBoardServer } from './runtime.js';

async function main(): Promise<void> {
  let handle: Awaited<ReturnType<typeof startMissionBoardServer>>;
  try {
    handle = await startMissionBoardServer();
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === 'EADDRINUSE') {
      console.error('Port is already in use. Set PORT=<port> or stop the existing server.');
    } else {
      console.error('Failed to start server:', e.message);
    }
    process.exit(1);
    return;
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`\nReceived ${signal}, shutting down...`);
    await handle.close();
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGBREAK', () => void shutdown('SIGBREAK'));
  process.on('message', (msg) => {
    if (msg === 'shutdown') {
      void shutdown('IPC');
    }
  });
}

void main();
