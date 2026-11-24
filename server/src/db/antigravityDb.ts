import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface SummaryRow {
  conversationId: string;
  title: string;
  preview: string;
  stepCount: number;
  lastModifiedTime: string;
  workspaceUris: string;
  status: string;
  source: string;
  projectId: string;
  agentName: string;
  parentConversationId: string;
  nestingDepth: number;
  notFullyIdle: boolean;
  killed: boolean;
  lastUserInputTime: string;
  lastUserInputStepIndex: number;
  groupId: string;
}

export interface FtsMetaRow {
  conversationId: string;
  project: string;
  workspace: string;
  archived: boolean;
}

export interface FtsSearchHit {
  conversationId: string;
  snippet: string;
}

export interface AntigravityDbSnapshot {
  summaries: SummaryRow[];
  ftsMetaById: Map<string, FtsMetaRow>;
  parentOverrides: Map<string, string>;
}

interface ShadowColumnMap {
  conversationId: string;
  archived: string;
  title: string;
  workspace: string;
  project: string;
  userBody: string;
  agentBody: string;
}

const DEFAULT_SHADOW_COLUMNS: ShadowColumnMap = {
  conversationId: 'c0',
  archived: 'c7',
  title: 'c10',
  workspace: 'c11',
  project: 'c12',
  userBody: 'c13',
  agentBody: 'c14',
};

const BUSY_RETRIES = 4;

function isTransientSqliteBusy(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('busy') ||
    msg.includes('locked') ||
    msg.includes('sqlite_busy') ||
    msg.includes('sqlite_locked')
  );
}

function sleepSyncMs(ms: number): void {
  const buf = new SharedArrayBuffer(4);
  const view = new Int32Array(buf);
  Atomics.wait(view, 0, 0, ms);
}

/**
 * Sanitize user search input into a safe FTS5 prefix-match query string.
 * Prevents syntax errors from quotes, punctuation, operators, or unbalanced tokens.
 */
export function buildSafeFts5Query(rawQuery: string): string | null {
  const cleaned = rawQuery
    .replace(/["'`*():^~\\]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (!cleaned) return null;

  const tokens = cleaned
    .split(' ')
    .map((t) => t.trim())
    .filter((t) => t.length > 0 && !/^(AND|OR|NOT|NEAR)$/i.test(t))
    .slice(0, 8);

  if (tokens.length === 0) return null;

  return tokens.map((t) => `"${t.replace(/"/g, '')}"*`).join(' AND ');
}

/**
 * Extract column index mapping (`c0`, `c1`, ...) from the `CREATE VIRTUAL TABLE conversations_fts USING fts5(...)` DDL
 * so the shadow table `conversations_fts_content` can be read cleanly even on Node builds compiled without FTS5.
 */
export function parseFts5ShadowColumns(ddl: string | null | undefined): ShadowColumnMap {
  if (!ddl) return DEFAULT_SHADOW_COLUMNS;
  const openIdx = ddl.indexOf('(');
  const closeIdx = ddl.lastIndexOf(')');
  if (openIdx === -1 || closeIdx <= openIdx) return DEFAULT_SHADOW_COLUMNS;

  const inner = ddl.slice(openIdx + 1, closeIdx);
  const parts = inner.split(',');
  const nameToCol = new Map<string, string>();
  let colIdx = 0;

  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed || trimmed.includes('=')) continue; // skip fts5 options like tokenize=..., prefix=...
    const firstWord = trimmed.split(/\s+/)[0]?.replace(/^["'`]|["'`]$/g, '');
    if (firstWord && /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(firstWord)) {
      nameToCol.set(firstWord, `c${colIdx}`);
      colIdx += 1;
    }
  }

  return {
    conversationId: nameToCol.get('conversation_id') ?? DEFAULT_SHADOW_COLUMNS.conversationId,
    archived: nameToCol.get('archived') ?? DEFAULT_SHADOW_COLUMNS.archived,
    title: nameToCol.get('title') ?? DEFAULT_SHADOW_COLUMNS.title,
    workspace: nameToCol.get('workspace') ?? DEFAULT_SHADOW_COLUMNS.workspace,
    project: nameToCol.get('project') ?? DEFAULT_SHADOW_COLUMNS.project,
    userBody: nameToCol.get('user_body') ?? DEFAULT_SHADOW_COLUMNS.userBody,
    agentBody: nameToCol.get('agent_body') ?? DEFAULT_SHADOW_COLUMNS.agentBody,
  };
}

function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, '\\$&');
}

function extractMatchSnippet(texts: string[], queryTerm: string): string {
  const lowerTerm = queryTerm.toLowerCase();
  for (const text of texts) {
    if (!text) continue;
    const idx = text.toLowerCase().indexOf(lowerTerm);
    if (idx !== -1) {
      const start = Math.max(0, idx - 50);
      const end = Math.min(text.length, idx + queryTerm.length + 110);
      const prefix = start > 0 ? '…' : '';
      const suffix = end < text.length ? '…' : '';
      return `${prefix}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${suffix}`;
    }
  }
  return '';
}

export class AntigravityReadOnlyDb {
  public readonly dbPath: string;

  constructor(dataDir: string) {
    this.dbPath = path.join(dataDir, 'conversation_summaries.db');
  }

  isAccessible(): boolean {
    try {
      fs.accessSync(this.dbPath, fs.constants.R_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Open `conversation_summaries.db` strictly read-only (`{ readOnly: true }`),
   * execute `fn`, and close immediately so Antigravity WAL checkpoints are never blocked.
   */
  private withReadOnlyDb<T>(fn: (db: DatabaseSync) => T): T {
    let lastError: unknown;

    for (let attempt = 0; attempt <= BUSY_RETRIES; attempt++) {
      let db: DatabaseSync | null = null;
      try {
        db = new DatabaseSync(this.dbPath, { readOnly: true });
        try {
          db.exec('PRAGMA query_only = ON');
          db.exec('PRAGMA busy_timeout = 2000');
        } catch {
          // Some SQLite builds ignore pragmas in read-only mode; continue safely
        }
        return fn(db);
      } catch (err) {
        lastError = err;
        if (isTransientSqliteBusy(err) && attempt < BUSY_RETRIES) {
          sleepSyncMs(40 * (attempt + 1));
          continue;
        }
        throw err;
      } finally {
        if (db) {
          try {
            db.close();
          } catch {
            // ignore close error
          }
        }
      }
    }

    throw lastError;
  }

  private resolveShadowColumns(db: DatabaseSync): ShadowColumnMap {
    try {
      const row = db
        .prepare("SELECT sql FROM sqlite_master WHERE name = 'conversations_fts' LIMIT 1")
        .get() as { sql?: string } | undefined;
      return parseFts5ShadowColumns(row?.sql);
    } catch {
      return DEFAULT_SHADOW_COLUMNS;
    }
  }

  private readFtsMetadata(db: DatabaseSync): Map<string, FtsMetaRow> {
    const ftsMetaById = new Map<string, FtsMetaRow>();

    // Path 1: Direct query against `conversations_fts` (when SQLite has FTS5 compiled in)
    try {
      const ftsRows = db
        .prepare(
          `SELECT
            conversation_id,
            MAX(COALESCE(project, '')) AS project,
            MAX(COALESCE(workspace, '')) AS workspace,
            MAX(COALESCE(archived, 0)) AS archived
          FROM conversations_fts
          GROUP BY conversation_id`,
        )
        .all() as Array<Record<string, unknown>>;

      for (const row of ftsRows) {
        const cid = String(row.conversation_id ?? '');
        if (!cid) continue;
        ftsMetaById.set(cid, {
          conversationId: cid,
          project: String(row.project ?? ''),
          workspace: String(row.workspace ?? ''),
          archived: Boolean(Number(row.archived ?? 0)),
        });
      }
      return ftsMetaById;
    } catch {
      // Fall back to regular shadow table `conversations_fts_content`
      // (works on Node 22.x builds compiled without SQLITE_ENABLE_FTS5!)
    }

    try {
      const cols = this.resolveShadowColumns(db);
      const shadowRows = db
        .prepare(
          `SELECT
            ${cols.conversationId} AS conversation_id,
            MAX(COALESCE(${cols.project}, '')) AS project,
            MAX(COALESCE(${cols.workspace}, '')) AS workspace,
            MAX(COALESCE(${cols.archived}, 0)) AS archived
          FROM conversations_fts_content
          GROUP BY ${cols.conversationId}`,
        )
        .all() as Array<Record<string, unknown>>;

      for (const row of shadowRows) {
        const cid = String(row.conversation_id ?? '');
        if (!cid) continue;
        ftsMetaById.set(cid, {
          conversationId: cid,
          project: String(row.project ?? ''),
          workspace: String(row.workspace ?? ''),
          archived: Boolean(Number(row.archived ?? 0)),
        });
      }
    } catch {
      // Neither FTS table nor shadow content table present
    }

    return ftsMetaById;
  }

  /**
   * Read all conversation summaries, deduplicated FTS metadata (`project`, `workspace`, `archived`),
   * and `conversation_parents` mappings in a single consistent read-only pass.
   * Never reads 64-bit nanosecond timestamps as JS numbers.
   */
  readSnapshot(): AntigravityDbSnapshot {
    if (!this.isAccessible()) {
      return {
        summaries: [],
        ftsMetaById: new Map(),
        parentOverrides: new Map(),
      };
    }

    return this.withReadOnlyDb((db) => {
      const rawRows = db
        .prepare(
          `SELECT
            conversation_id,
            title,
            preview,
            step_count,
            last_modified_time,
            workspace_uris,
            status,
            source,
            project_id,
            agent_name,
            parent_conversation_id,
            nesting_depth,
            not_fully_idle,
            killed,
            last_user_input_time,
            last_user_input_step_index,
            group_id
          FROM conversation_summaries
          ORDER BY last_modified_time DESC`,
        )
        .all() as Array<Record<string, unknown>>;

      const summaries: SummaryRow[] = rawRows.map((r) => ({
        conversationId: String(r.conversation_id ?? ''),
        title: String(r.title ?? ''),
        preview: String(r.preview ?? ''),
        stepCount: Number(r.step_count ?? 0) || 0,
        lastModifiedTime: String(r.last_modified_time ?? ''),
        workspaceUris: String(r.workspace_uris ?? '[]'),
        status: String(r.status ?? ''),
        source: String(r.source ?? ''),
        projectId: String(r.project_id ?? ''),
        agentName: String(r.agent_name ?? ''),
        parentConversationId: String(r.parent_conversation_id ?? ''),
        nestingDepth: Number(r.nesting_depth ?? 0) || 0,
        notFullyIdle: Boolean(Number(r.not_fully_idle ?? 0)),
        killed: Boolean(Number(r.killed ?? 0)),
        lastUserInputTime: String(r.last_user_input_time ?? ''),
        lastUserInputStepIndex:
          typeof r.last_user_input_step_index === 'number' ? r.last_user_input_step_index : -1,
        groupId: String(r.group_id ?? ''),
      }));

      const ftsMetaById = this.readFtsMetadata(db);

      const parentOverrides = new Map<string, string>();
      try {
        const parentRows = db
          .prepare('SELECT conversation_id, parent_id FROM conversation_parents')
          .all() as Array<Record<string, unknown>>;
        for (const row of parentRows) {
          const cid = String(row.conversation_id ?? '');
          const pid = String(row.parent_id ?? '');
          if (cid && pid) parentOverrides.set(cid, pid);
        }
      } catch {
        // conversation_parents optional
      }

      return { summaries, ftsMetaById, parentOverrides };
    });
  }

  /**
   * Run a safe read-only full-text search across conversations (FTS5 when available,
   * automatic fallback to `conversations_fts_content` LIKE matching when SQLite lacks FTS5).
   */
  searchFts(rawQuery: string, limit = 40): FtsSearchHit[] {
    if (!this.isAccessible()) return [];
    const ftsQuery = buildSafeFts5Query(rawQuery);
    if (!ftsQuery) return [];

    const plainTerms = rawQuery
      .replace(/["'`*():^~\\]/g, ' ')
      .split(/\s+/)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !/^(AND|OR|NOT|NEAR)$/i.test(t))
      .slice(0, 6);

    try {
      return this.withReadOnlyDb((db) => {
        // Path 1: Native FTS5 MATCH + BM25 ranking
        try {
          const rows = db
            .prepare(
              `SELECT
                conversation_id,
                snippet(conversations_fts, -1, '', '', '…', 20) AS snippet_text
              FROM conversations_fts
              WHERE conversations_fts MATCH ?
              ORDER BY bm25(conversations_fts)
              LIMIT ?`,
            )
            .all(ftsQuery, limit * 2) as Array<Record<string, unknown>>;

          const seen = new Set<string>();
          const hits: FtsSearchHit[] = [];
          for (const r of rows) {
            const cid = String(r.conversation_id ?? '');
            if (!cid || seen.has(cid)) continue;
            seen.add(cid);
            hits.push({
              conversationId: cid,
              snippet: String(r.snippet_text ?? '').trim(),
            });
            if (hits.length >= limit) break;
          }
          return hits;
        } catch {
          // Path 2: Shadow table `conversations_fts_content` LIKE fallback
        }

        if (plainTerms.length === 0) return [];
        const cols = this.resolveShadowColumns(db);
        const clauses: string[] = [];
        const params: string[] = [];

        for (const term of plainTerms) {
          const like = `%${escapeLikePattern(term)}%`;
          clauses.push(
            `(COALESCE(${cols.title}, '') LIKE ? ESCAPE '\\' OR COALESCE(${cols.userBody}, '') LIKE ? ESCAPE '\\' OR COALESCE(${cols.agentBody}, '') LIKE ? ESCAPE '\\' OR COALESCE(${cols.project}, '') LIKE ? ESCAPE '\\')`,
          );
          params.push(like, like, like, like);
        }

        const sql = `
          SELECT
            ${cols.conversationId} AS conversation_id,
            ${cols.title} AS title,
            ${cols.userBody} AS user_body,
            ${cols.agentBody} AS agent_body
          FROM conversations_fts_content
          WHERE ${clauses.join(' AND ')}
          LIMIT ?
        `;

        const rows = db.prepare(sql).all(...params, limit * 3) as Array<Record<string, unknown>>;
        const seen = new Set<string>();
        const hits: FtsSearchHit[] = [];

        for (const r of rows) {
          const cid = String(r.conversation_id ?? '');
          if (!cid || seen.has(cid)) continue;
          seen.add(cid);
          const snippet = extractMatchSnippet(
            [String(r.title ?? ''), String(r.user_body ?? ''), String(r.agent_body ?? '')],
            plainTerms[0],
          );
          hits.push({ conversationId: cid, snippet });
          if (hits.length >= limit) break;
        }

        return hits;
      });
    } catch {
      return [];
    }
  }
}
