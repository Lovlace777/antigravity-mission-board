#!/usr/bin/env node
'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

const desktopDir = path.resolve(__dirname, '..');

let electronBinary;
try {
  electronBinary = require('electron');
} catch (err) {
  console.error(
    '[desktop] Electron is not installed yet. Run `npm run setup:desktop` (or `npm --prefix desktop install`) first.'
  );
  process.exit(1);
}

if (typeof electronBinary !== 'string') {
  console.error('[desktop] Failed to resolve Electron executable path.');
  process.exit(1);
}

const rawArgs = process.argv.slice(2);
const detached = rawArgs.includes('--detached');
const forwardArgs = rawArgs.filter((arg) => arg !== '--detached');

// Critical: unset ELECTRON_RUN_AS_NODE so launching from VS Code / Antigravity
// integrated terminals always boots Electron in full GUI mode.
const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electronBinary, [desktopDir, ...forwardArgs], {
  cwd: desktopDir,
  env,
  detached,
  stdio: detached ? 'ignore' : 'inherit',
  windowsHide: false,
});

if (detached) {
  child.unref();
  process.exit(0);
}

child.on('error', (err) => {
  console.error('[desktop] Failed to launch Electron:', err.message);
  process.exit(1);
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(0);
  }
  process.exit(code ?? 0);
});
