import type { Response } from 'express';
import type { BoardResponse, SseEvent } from '../../../shared/types.js';
import { detectNotifications } from '../engine/classifier.js';
import type { IBoardService } from '../engine/types.js';

const HEARTBEAT_INTERVAL_MS = 25_000;
const ACTIVE_RUNNING_POLL_MS = 2_000;
const IDLE_BACKOFF_POLL_MS = 6_000;

/**
 * Low-CPU Server-Sent Events broker:
 * - Zero-client sleep: stops all background timers when `clients.size === 0`.
 * - Idle mode (`setIdleMode(true)`): pauses polling completely during OS suspend/lock/hidden widget.
 * - Adaptive backoff: polls every 2s while agents are actively running, backs off to 6s when idle.
 */
export class SseBroker {
  private readonly clients = new Set<Response>();
  private readonly service: IBoardService;
  private lastBoard: BoardResponse | null = null;
  private pollTimeout: ReturnType<typeof setTimeout> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private basePollIntervalMs: number;
  private idleMode = false;
  private closed = false;

  constructor(service: IBoardService) {
    this.service = service;
    this.basePollIntervalMs = service.getSettings().pollIntervalMs;
  }

  addClient(res: Response): void {
    if (this.closed) {
      res.status(503).end();
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    this.clients.add(res);

    this.sendToClient(res, {
      type: 'connected',
      mode: this.service.mode,
      timestamp: new Date().toISOString(),
    });

    try {
      const board = this.service.getBoard();
      this.lastBoard = board;
      this.sendToClient(res, { type: 'board_update', board });
    } catch {
      // Keep stream open even if an initial snapshot fails transiently
    }

    this.ensureTimersRunning();

    res.on('close', () => {
      this.clients.delete(res);
      if (this.clients.size === 0) {
        this.stopTimers();
      }
    });
  }

  /**
   * Pause/resume background polling when host OS sleeps, locks screen, or hides widget.
   */
  setIdleMode(idle: boolean): void {
    const next = Boolean(idle);
    if (next === this.idleMode) return;
    this.idleMode = next;

    if (this.idleMode) {
      this.stopTimers();
    } else if (this.clients.size > 0 && !this.closed) {
      // Immediate catch-up sync upon wake, then resume adaptive polling
      this.checkAndBroadcast(true);
      this.ensureTimersRunning();
    }
  }

  isIdleMode(): boolean {
    return this.idleMode;
  }

  /**
   * Trigger an immediate board check (e.g., after overlay or settings mutation)
   * and push `board_update` to all subscribers if changed.
   */
  notifyMutation(): void {
    if (this.clients.size === 0 || this.closed) return;
    this.checkAndBroadcast(false);
  }

  /**
   * Update base polling preference when `settings.pollIntervalMs` changes.
   */
  updatePollInterval(pollIntervalMs: number): void {
    const safeMs = Math.max(1000, Math.min(60_000, Math.round(pollIntervalMs)));
    if (safeMs === this.basePollIntervalMs) return;
    this.basePollIntervalMs = safeMs;
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
      this.scheduleNextPoll();
    }
  }

  getActivePollIntervalMs(): number {
    const runningCount = this.lastBoard?.stats.runningCount ?? 0;
    if (runningCount > 0) {
      return Math.min(ACTIVE_RUNNING_POLL_MS, this.basePollIntervalMs);
    }
    return Math.max(IDLE_BACKOFF_POLL_MS, this.basePollIntervalMs);
  }

  private ensureTimersRunning(): void {
    if (this.closed || this.idleMode || this.clients.size === 0) return;

    if (!this.pollTimeout) {
      this.scheduleNextPoll();
    }

    if (!this.heartbeatTimer) {
      this.heartbeatTimer = setInterval(() => {
        this.broadcast({
          type: 'heartbeat',
          timestamp: new Date().toISOString(),
        });
      }, HEARTBEAT_INTERVAL_MS);
      this.heartbeatTimer.unref?.();
    }
  }

  private scheduleNextPoll(): void {
    if (this.closed || this.idleMode || this.clients.size === 0) return;

    const delayMs = this.getActivePollIntervalMs();
    this.pollTimeout = setTimeout(() => {
      this.pollTimeout = null;
      this.checkAndBroadcast(true);
      this.scheduleNextPoll();
    }, delayMs);
    this.pollTimeout.unref?.();
  }

  private stopTimers(): void {
    if (this.pollTimeout) {
      clearTimeout(this.pollTimeout);
      this.pollTimeout = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private checkAndBroadcast(emitNotifications: boolean): void {
    if (this.clients.size === 0 || this.closed) return;

    let nextBoard: BoardResponse;
    try {
      nextBoard = this.service.getBoard();
    } catch {
      return;
    }

    const prevBoard = this.lastBoard;
    if (prevBoard && prevBoard.snapshotHash === nextBoard.snapshotHash) {
      return;
    }

    this.lastBoard = nextBoard;
    this.broadcast({ type: 'board_update', board: nextBoard });

    if (emitNotifications && prevBoard) {
      const notifications = detectNotifications(prevBoard, nextBoard);
      for (const notification of notifications) {
        this.broadcast({ type: 'notification', notification });
      }
    }
  }

  private sendToClient(res: Response, event: SseEvent): void {
    if (res.writableEnded || res.destroyed) return;
    try {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    } catch {
      this.clients.delete(res);
    }
  }

  private broadcast(event: SseEvent): void {
    for (const client of this.clients) {
      this.sendToClient(client, event);
    }
  }

  get clientCount(): number {
    return this.clients.size;
  }

  close(): void {
    this.closed = true;
    this.stopTimers();
    for (const client of this.clients) {
      try {
        client.end();
      } catch {
        // ignore
      }
    }
    this.clients.clear();
  }
}
