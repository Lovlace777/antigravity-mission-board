# Contributing to Antigravity Mission Board

Thank you for considering contributing! This project is built to stay **fast, local-first, zero-native-dependency, and strictly read-only** on Google Antigravity Desktop 2.0 data.

## Core Principles

1. **100% Read-Only on `~/.gemini/antigravity`:** Never write, modify, or delete any file inside Antigravity's data directory. All Mission Board state belongs in `~/.antigravity-mission-board/overlay.db`.
2. **Zero Native C++ Dependencies:** Keep SQLite powered by Node 22's built-in `node:sqlite` (`DatabaseSync`) so contributors on Windows, macOS, and Linux never need `node-gyp` or C++ toolchains.
3. **Privacy First:** Never commit real Antigravity databases, personal paths, usernames, or private conversation titles. Use `npm run start:demo` (synthetic dataset) for screenshots and demos.

## Local Development Setup

Requires **Node.js 22.5+**:

```bash
git clone https://github.com/Lovlace777/antigravity-mission-board.git
cd antigravity-mission-board
npm run setup
npm run dev:demo   # or `npm run dev` to read local ~/.gemini/antigravity
```

## Project Layout

- `shared/types.ts` — Shared pure TypeScript API & domain contract
- `server/` — Express + TypeScript backend (`node:sqlite`, parsers, lane engine, SSE, Vitest suite)
- `web/` — React 19 + Vite + Tailwind CSS v4 frontend (Kanban, Matrix, Swarm, Command Palette, Drawer)
- `docs/` — Logo and synthetic Demo Mode screenshots

## Before Opening a Pull Request

Make sure all checks pass cleanly:

```bash
npm run typecheck
npm test
npm run build
```

Keep PRs focused, include Vitest coverage for backend parser/engine/API changes, and update both `README.md` and `README.zh-CN.md` if user-facing behavior changes.
