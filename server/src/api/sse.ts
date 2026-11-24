import type { Response } from 'express';
import type { BoardResponse, SseEvent } from '../../../shared/types.js';
import { detectNotifications } from '../engine/classifier.js';
import type { IBoardService } from '../engine/types.js';

const HEARTBEAT_INTERVAL_MS = 20_000;

/**
 * Manages Server-Sent Event (SSE) subscribers, snapshot diffing, heartbeat frames,
 * and semantic notification transitions.
 */
export class SseBroker {
  private readonly clients = new Set<Response>();
  private readonly service: IBoardService;
  private lastBoard: BoardResponse | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private currentPollIntervalMs: number;

  constructor(service: IBoardService) {
    this.service = service;
    this.currentPollIntervalMs = service.getSettings().pollIntervalMs;
  }

  addClient(res: Response): void {
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
   * Trigger an immediate board check (e.g., after overlay or settings mutation)
   * and push `board_update` to all subscribers if changed.
   */
  notifyMutation(): void {
    if (this.clients.size === 0) return;
    this.checkAndBroadcast(false);
  }

  /**
   * Update polling frequency when `settings.pollIntervalMs` changes.
   */
  updatePollInterval(pollIntervalMs: number): void {
    const safeMs = Math.max(1000, Math.min(60_000, Math.round(pollIntervalMs)));
    if (safeMs === this.currentPollIntervalMs) return;
    this.currentPollIntervalMs = safeMs;
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = setInterval(() => this.checkAndBroadcast(true), this.currentPollIntervalMs);
      this.pollTimer.unref?.();
    }
  }

  private ensureTimersRunning(): void {
    if (!this.pollTimer) {
      this.pollTimer = setInterval(() => this.checkAndBroadcast(true), this.currentPollIntervalMs);
      this.pollTimer.unref?.();
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

  private stopTimers(): void {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private checkAndBroadcast(emitNotifications: boolean): void {
    if (this.clients.size === 0) return;

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
