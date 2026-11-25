import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  BoardSettings,
  LaneId,
  OverlayData,
  OverlayPatch,
  Priority,
} from '../../../shared/types.js';

const VALID_LANES = new Set<LaneId>(['running', 'attention', 'active', 'stale', 'archived']);
const VALID_PRIORITIES = new Set<Exclude<Priority, null>>(['p0', 'p1', 'p2']);

export const DEFAULT_SETTINGS: BoardSettings = {
  staleAfterHours: 72,
  pollIntervalMs: 3000,
};

export function createDefaultOverlay(conversationId: string): OverlayData {
  return {
    conversationId,
    manualLane: null,
    pinned: false,
    priority: null,
    tags: [],
    notes: '',
    followUpAt: null,
    reviewedAt: null,
    updatedAt: null,
  };
}

/**
 * Local persistent overlay & settings SQLite store (never touches Antigravity's data dir).
 * Supports both file-backed persistence (`~/.antigravity-mission-board/overlay.db`) and `:memory:` for demo/tests.
 */
export class OverlayStore {
  private readonly db: DatabaseSync;
  private _version = 0;

  constructor(dbPath: string) {
    if (dbPath !== ':memory:') {
      fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    }
    this.db = new DatabaseSync(dbPath);
    if (dbPath !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL');
    }
    this.db.exec('PRAGMA busy_timeout = 3000');
    this.initSchema();
  }

  /** Monotonic mutation version used by the stat-fingerprint fast path to detect local overlay changes. */
  get version(): number {
    return this._version;
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS conversation_overlays (
        conversation_id TEXT PRIMARY KEY,
        manual_lane TEXT,
        pinned INTEGER NOT NULL DEFAULT 0,
        priority TEXT,
        tags_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT NOT NULL DEFAULT '',
        follow_up_at TEXT,
        reviewed_at TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `);
  }

  private rowToOverlay(row: Record<string, unknown>): OverlayData {
    const manualLaneRaw = typeof row.manual_lane === 'string' ? row.manual_lane : null;
    const manualLane =
      manualLaneRaw && VALID_LANES.has(manualLaneRaw as LaneId) ? (manualLaneRaw as LaneId) : null;

    const priorityRaw = typeof row.priority === 'string' ? row.priority : null;
    const priority: Priority =
      priorityRaw && VALID_PRIORITIES.has(priorityRaw as Exclude<Priority, null>)
        ? (priorityRaw as Priority)
        : null;

    let tags: string[] = [];
    if (typeof row.tags_json === 'string') {
      try {
        const parsed = JSON.parse(row.tags_json);
        if (Array.isArray(parsed)) {
          tags = parsed.filter((t): t is string => typeof t === 'string' && t.trim().length > 0);
        }
      } catch {
        tags = [];
      }
    }

    return {
      conversationId: String(row.conversation_id ?? ''),
      manualLane,
      pinned: Boolean(Number(row.pinned ?? 0)),
      priority,
      tags,
      notes: typeof row.notes === 'string' ? row.notes : '',
      followUpAt: typeof row.follow_up_at === 'string' && row.follow_up_at ? row.follow_up_at : null,
      reviewedAt: typeof row.reviewed_at === 'string' && row.reviewed_at ? row.reviewed_at : null,
      updatedAt: typeof row.updated_at === 'string' && row.updated_at ? row.updated_at : null,
    };
  }

  getOverlay(conversationId: string): OverlayData {
    const row = this.db
      .prepare('SELECT * FROM conversation_overlays WHERE conversation_id = ?')
      .get(conversationId) as Record<string, unknown> | undefined;

    return row ? this.rowToOverlay(row) : createDefaultOverlay(conversationId);
  }

  getAllOverlays(): Map<string, OverlayData> {
    const rows = this.db.prepare('SELECT * FROM conversation_overlays').all() as Array<
      Record<string, unknown>
    >;
    const map = new Map<string, OverlayData>();
    for (const row of rows) {
      const overlay = this.rowToOverlay(row);
      if (overlay.conversationId) {
        map.set(overlay.conversationId, overlay);
      }
    }
    return map;
  }

  patchOverlay(conversationId: string, patch: OverlayPatch): OverlayData {
    const current = this.getOverlay(conversationId);
    const nowIso = new Date().toISOString();

    const manualLane =
      patch.manualLane !== undefined ? patch.manualLane : current.manualLane;
    const pinned = patch.pinned !== undefined ? Boolean(patch.pinned) : current.pinned;
    const priority = patch.priority !== undefined ? patch.priority : current.priority;
    const tags =
      patch.tags !== undefined
        ? Array.from(
            new Set(
              patch.tags
                .map((t) => t.trim())
                .filter((t) => t.length > 0)
                .slice(0, 20),
            ),
          )
        : current.tags;
    const notes = patch.notes !== undefined ? patch.notes : current.notes;
    const followUpAt =
      patch.followUpAt !== undefined
        ? patch.followUpAt && patch.followUpAt.trim()
          ? patch.followUpAt.trim()
          : null
        : current.followUpAt;
    const reviewedAt =
      patch.reviewedAt !== undefined
        ? patch.reviewedAt && patch.reviewedAt.trim()
          ? patch.reviewedAt.trim()
          : null
        : current.reviewedAt;

    this.db
      .prepare(
        `INSERT INTO conversation_overlays (
          conversation_id, manual_lane, pinned, priority, tags_json, notes, follow_up_at, reviewed_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(conversation_id) DO UPDATE SET
          manual_lane = excluded.manual_lane,
          pinned = excluded.pinned,
          priority = excluded.priority,
          tags_json = excluded.tags_json,
          notes = excluded.notes,
          follow_up_at = excluded.follow_up_at,
          reviewed_at = excluded.reviewed_at,
          updated_at = excluded.updated_at`,
      )
      .run(
        conversationId,
        manualLane,
        pinned ? 1 : 0,
        priority,
        JSON.stringify(tags),
        notes,
        followUpAt,
        reviewedAt,
        nowIso,
      );

    this._version += 1;

    return {
      conversationId,
      manualLane,
      pinned,
      priority,
      tags,
      notes,
      followUpAt,
      reviewedAt,
      updatedAt: nowIso,
    };
  }

  markReviewed(conversationId: string, nowIso = new Date().toISOString()): OverlayData {
    const current = this.getOverlay(conversationId);
    const patch: OverlayPatch = { reviewedAt: nowIso };
    if (current.manualLane === 'attention') {
      patch.manualLane = null;
    }
    return this.patchOverlay(conversationId, patch);
  }

  markReviewedBatch(
    conversationIds: string[],
    reviewedAt: string | null = new Date().toISOString(),
    restoreManualLanes?: Record<string, LaneId | null>,
  ): OverlayData[] {
    const uniqueIds = Array.from(new Set(conversationIds));
    if (uniqueIds.length === 0) return [];

    const results: OverlayData[] = [];
    this.db.exec('BEGIN IMMEDIATE');
    try {
      for (const id of uniqueIds) {
        const patch: OverlayPatch = { reviewedAt };
        if (restoreManualLanes && Object.prototype.hasOwnProperty.call(restoreManualLanes, id)) {
          patch.manualLane = restoreManualLanes[id];
        } else if (reviewedAt !== null) {
          const current = this.getOverlay(id);
          if (current.manualLane === 'attention') {
            patch.manualLane = null;
          }
        }
        results.push(this.patchOverlay(id, patch));
      }
      this.db.exec('COMMIT');
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {
        // ignore rollback error
      }
      throw err;
    }
    return results;
  }

  getSettings(): BoardSettings {
    const rows = this.db.prepare('SELECT key, value FROM app_settings').all() as Array<{
      key: string;
      value: string;
    }>;
    const settings: BoardSettings = { ...DEFAULT_SETTINGS };

    for (const row of rows) {
      if (row.key === 'staleAfterHours') {
        const val = Number(row.value);
        if (Number.isFinite(val) && val >= 1 && val <= 24 * 365) {
          settings.staleAfterHours = val;
        }
      } else if (row.key === 'pollIntervalMs') {
        const val = Number(row.value);
        if (Number.isFinite(val) && val >= 1000 && val <= 60000) {
          settings.pollIntervalMs = val;
        }
      }
    }

    return settings;
  }

  patchSettings(patch: Partial<BoardSettings>): BoardSettings {
    const current = this.getSettings();
    const next: BoardSettings = {
      staleAfterHours:
        patch.staleAfterHours !== undefined ? patch.staleAfterHours : current.staleAfterHours,
      pollIntervalMs:
        patch.pollIntervalMs !== undefined ? patch.pollIntervalMs : current.pollIntervalMs,
    };

    const stmt = this.db.prepare(
      `INSERT INTO app_settings (key, value) VALUES (?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    );
    stmt.run('staleAfterHours', String(next.staleAfterHours));
    stmt.run('pollIntervalMs', String(next.pollIntervalMs));

    this._version += 1;

    return next;
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      // ignore
    }
  }
}
