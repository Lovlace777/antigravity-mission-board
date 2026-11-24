import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..', '..');
const isDemo = process.argv.includes('--demo');
const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const serverScript = isDemo ? 'dev:demo' : 'dev';
const serverProc = spawn(npmCmd, ['--prefix', 'server', 'run', serverScript], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

const webProc = spawn(npmCmd, ['--prefix', 'web', 'run', 'dev'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

function shutdown(signal) {
  for (const child of [serverProc, webProc]) {
    if (!child.killed) {
      try {
        child.kill(signal);
      } catch {
        // ignore
      }
    }
  }
}

process.on('SIGINT', () => {
  shutdown('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
  process.exit(0);
});

serverProc.on('exit', (code) => {
  if (code && code !== 0) {
    shutdown('SIGTERM');
    process.exit(code);
  }
});

webProc.on('exit', (code) => {
  if (code && code !== 0) {
    shutdown('SIGTERM');
    process.exit(code);
  }
});
