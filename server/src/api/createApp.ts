import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import type {
  BoardSettings,
  DispatchRequest,
  LaneId,
  OverlayPatch,
  Priority,
  ReviewBatchRequest,
} from '../../../shared/types.js';
import type { IBoardService } from '../engine/types.js';
import { isValidConversationId } from '../utils/pathSafety.js';
import { SseBroker } from './sse.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VALID_LANES = new Set<LaneId>(['running', 'attention', 'active', 'stale', 'archived']);
const VALID_PRIORITIES = new Set<Exclude<Priority, null>>(['p0', 'p1', 'p2']);

export interface AppBundle {
  app: Express;
  sseBroker: SseBroker;
  staticDir: string | null;
}

export interface CreateAppOptions {
  staticDir?: string | null;
}

function resolveDefaultWebDistDir(): string | null {
  const candidates = [
    path.resolve(__dirname, '../../../web/dist'), // tsx src/api/createApp.ts
    path.resolve(__dirname, '../../../../../web/dist'), // compiled dist/server/src/api/createApp.js
    path.resolve(process.cwd(), '../web/dist'), // cwd = server/
    path.resolve(process.cwd(), 'web/dist'), // cwd = repo root
  ];

  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'index.html'))) {
      return dir;
    }
  }
  return null;
}

function validateOverlayPatch(body: unknown): { patch?: OverlayPatch; error?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object.' };
  }

  const raw = body as Record<string, unknown>;
  const patch: OverlayPatch = {};

  if ('manualLane' in raw) {
    if (raw.manualLane === null || raw.manualLane === '') {
      patch.manualLane = null;
    } else if (typeof raw.manualLane === 'string' && VALID_LANES.has(raw.manualLane as LaneId)) {
      patch.manualLane = raw.manualLane as LaneId;
    } else {
      return {
        error: 'Invalid manualLane. Must be one of running, attention, active, stale, archived, or null.',
      };
    }
  }

  if ('pinned' in raw) {
    if (typeof raw.pinned !== 'boolean') {
      return { error: 'Invalid pinned value. Must be a boolean.' };
    }
    patch.pinned = raw.pinned;
  }

  if ('priority' in raw) {
    if (raw.priority === null || raw.priority === '') {
      patch.priority = null;
    } else if (
      typeof raw.priority === 'string' &&
      VALID_PRIORITIES.has(raw.priority as Exclude<Priority, null>)
    ) {
      patch.priority = raw.priority as Priority;
    } else {
      return { error: 'Invalid priority. Must be p0, p1, p2, or null.' };
    }
  }

  if ('tags' in raw) {
    if (!Array.isArray(raw.tags) || raw.tags.some((t) => typeof t !== 'string')) {
      return { error: 'Invalid tags. Must be an array of strings.' };
    }
    if (raw.tags.length > 30) {
      return { error: 'Too many tags (max 30).' };
    }
    patch.tags = (raw.tags as string[]).map((t) => t.trim().slice(0, 48)).filter(Boolean);
  }

  if ('notes' in raw) {
    if (typeof raw.notes !== 'string') {
      return { error: 'Invalid notes. Must be a string.' };
    }
    if (raw.notes.length > 20_000) {
      return { error: 'Notes exceed maximum length (20,000 characters).' };
    }
    patch.notes = raw.notes;
  }

  if ('followUpAt' in raw) {
    if (raw.followUpAt === null || raw.followUpAt === '') {
      patch.followUpAt = null;
    } else if (typeof raw.followUpAt === 'string' && raw.followUpAt.trim().length <= 64) {
      patch.followUpAt = raw.followUpAt.trim();
    } else {
      return { error: 'Invalid followUpAt. Must be an ISO/date string or null.' };
    }
  }

  if ('reviewedAt' in raw) {
    if (raw.reviewedAt === null || raw.reviewedAt === '') {
      patch.reviewedAt = null;
    } else if (typeof raw.reviewedAt === 'string' && raw.reviewedAt.trim().length <= 64) {
      patch.reviewedAt = raw.reviewedAt.trim();
    } else {
      return { error: 'Invalid reviewedAt. Must be an ISO timestamp string or null.' };
    }
  }

  return { patch };
}

function validateReviewBatchRequest(body: unknown): {
  request?: ReviewBatchRequest;
  error?: string;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object.' };
  }

  const raw = body as Record<string, unknown>;
  if (!Array.isArray(raw.ids) || raw.ids.length === 0) {
    return { error: 'Field `ids` must be a non-empty array of conversation IDs.' };
  }
  if (raw.ids.length > 200) {
    return { error: 'Batch review supports at most 200 conversation IDs per request.' };
  }

  const ids: string[] = [];
  for (const item of raw.ids) {
    if (typeof item !== 'string' || !isValidConversationId(item)) {
      return { error: 'All items in `ids` must be valid conversation IDs.' };
    }
    ids.push(item);
  }

  let reviewedAt: string | null | undefined;
  if ('reviewedAt' in raw) {
    if (raw.reviewedAt === null || raw.reviewedAt === '') {
      reviewedAt = null;
    } else if (typeof raw.reviewedAt === 'string' && raw.reviewedAt.trim().length <= 64) {
      reviewedAt = raw.reviewedAt.trim();
    } else {
      return { error: 'Invalid reviewedAt. Must be an ISO timestamp string or null.' };
    }
  }

  let restoreManualLanes: Record<string, LaneId | null> | undefined;
  if ('restoreManualLanes' in raw && raw.restoreManualLanes !== undefined) {
    if (
      !raw.restoreManualLanes ||
      typeof raw.restoreManualLanes !== 'object' ||
      Array.isArray(raw.restoreManualLanes)
    ) {
      return { error: 'Field `restoreManualLanes` must be an object mapping conversation IDs to lanes or null.' };
    }
    const entries = Object.entries(raw.restoreManualLanes as Record<string, unknown>);
    if (entries.length > 200) {
      return { error: 'Field `restoreManualLanes` supports at most 200 entries.' };
    }
    const map: Record<string, LaneId | null> = {};
    for (const [k, v] of entries) {
      if (!isValidConversationId(k)) {
        return { error: 'All keys in `restoreManualLanes` must be valid conversation IDs.' };
      }
      if (v === null || v === '') {
        map[k] = null;
      } else if (typeof v === 'string' && VALID_LANES.has(v as LaneId)) {
        map[k] = v as LaneId;
      } else {
        return { error: 'Invalid lane value inside `restoreManualLanes`.' };
      }
    }
    restoreManualLanes = map;
  }

  return {
    request: {
      ids: Array.from(new Set(ids)),
      ...(reviewedAt !== undefined ? { reviewedAt } : {}),
      ...(restoreManualLanes !== undefined ? { restoreManualLanes } : {}),
    },
  };
}

function validateDispatchRequest(body: unknown): {
  request?: DispatchRequest;
  error?: string;
} {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object.' };
  }

  const raw = body as Record<string, unknown>;
  if (typeof raw.prompt !== 'string' || !raw.prompt.trim()) {
    return { error: 'Field `prompt` must be a non-empty string.' };
  }
  if (raw.prompt.trim().length > 4000) {
    return { error: 'Prompt exceeds maximum length (4,000 characters).' };
  }

  let saveToNotes: boolean | undefined;
  if ('saveToNotes' in raw) {
    if (typeof raw.saveToNotes !== 'boolean') {
      return { error: 'Field `saveToNotes` must be a boolean.' };
    }
    saveToNotes = raw.saveToNotes;
  }

  return {
    request: {
      prompt: raw.prompt.trim(),
      ...(saveToNotes !== undefined ? { saveToNotes } : {}),
    },
  };
}

function validateSettingsPatch(body: unknown): { patch?: Partial<BoardSettings>; error?: string } {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Request body must be a JSON object.' };
  }

  const raw = body as Record<string, unknown>;
  const patch: Partial<BoardSettings> = {};

  if ('staleAfterHours' in raw) {
    const val = Number(raw.staleAfterHours);
    if (!Number.isFinite(val) || val < 1 || val > 24 * 365) {
      return { error: 'staleAfterHours must be a number between 1 and 8760.' };
    }
    patch.staleAfterHours = Math.round(val);
  }

  if ('pollIntervalMs' in raw) {
    const val = Number(raw.pollIntervalMs);
    if (!Number.isFinite(val) || val < 1000 || val > 60_000) {
      return { error: 'pollIntervalMs must be a number between 1000 and 60000.' };
    }
    patch.pollIntervalMs = Math.round(val);
  }

  return { patch };
}

export function createApp(service: IBoardService, options: CreateAppOptions = {}): AppBundle {
  const app = express();
  const sseBroker = new SseBroker(service);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '256kb' }));

  // Lightweight security headers for local dashboard
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    next();
  });

  // Health
  app.get('/api/health', (_req, res) => {
    res.json(service.getHealth());
  });

  // Main board snapshot
  app.get('/api/board', (_req, res) => {
    res.json(service.getBoard());
  });

  // Batch mark-reviewed (or undo when reviewedAt: null)
  app.post('/api/conversations/review-batch', (req, res) => {
    const { request, error } = validateReviewBatchRequest(req.body);
    if (error || !request) {
      res.status(400).json({ error: error ?? 'Invalid batch review payload.' });
      return;
    }

    const result = service.markReviewedBatch(
      request.ids,
      request.reviewedAt,
      request.restoreManualLanes,
    );
    sseBroker.notifyMutation();
    res.json(result);
  });

  // Conversation detail
  app.get('/api/conversations/:id', (req, res) => {
    const { id } = req.params;
    if (!isValidConversationId(id)) {
      res.status(400).json({ error: 'Invalid conversation ID format.' });
      return;
    }

    const detail = service.getConversationDetail(id);
    if (!detail) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }
    res.json(detail);
  });

  // Path-traversal-safe artifact reader
  app.get('/api/conversations/:id/artifact', (req, res) => {
    const { id } = req.params;
    if (!isValidConversationId(id)) {
      res.status(400).json({ error: 'Invalid conversation ID format.' });
      return;
    }

    const file = typeof req.query.file === 'string' ? req.query.file : '';
    if (!file.trim()) {
      res.status(400).json({ error: 'Missing required query parameter: file.' });
      return;
    }

    // Reject obvious traversal attempts explicitly with 400
    const normalized = file.replace(/\\/g, '/').trim();
    if (
      normalized.includes('\0') ||
      normalized.startsWith('/') ||
      /^[a-zA-Z]:/.test(normalized) ||
      normalized.split('/').some((seg) => seg === '..' || seg === '.' || seg === '.system_generated')
    ) {
      res.status(400).json({ error: 'Invalid artifact file path.' });
      return;
    }

    const artifact = service.readArtifact(id, file);
    if (!artifact) {
      res.status(404).json({ error: 'Artifact not found.' });
      return;
    }
    res.json(artifact);
  });

  // Update per-conversation overlay metadata
  app.patch('/api/conversations/:id/overlay', (req, res) => {
    const { id } = req.params;
    if (!isValidConversationId(id)) {
      res.status(400).json({ error: 'Invalid conversation ID format.' });
      return;
    }

    const { patch, error } = validateOverlayPatch(req.body);
    if (error || !patch) {
      res.status(400).json({ error: error ?? 'Invalid overlay payload.' });
      return;
    }

    const result = service.patchOverlay(id, patch);
    sseBroker.notifyMutation();
    res.json(result);
  });

  // Convenience mark-reviewed endpoint
  app.post('/api/conversations/:id/review', (req, res) => {
    const { id } = req.params;
    if (!isValidConversationId(id)) {
      res.status(400).json({ error: 'Invalid conversation ID format.' });
      return;
    }

    const result = service.markReviewed(id);
    sseBroker.notifyMutation();
    res.json(result);
  });

  // Safe follow-up prompt dispatch (agy CLI when available, else clean Desktop handoff)
  app.post('/api/conversations/:id/dispatch', (req, res) => {
    const { id } = req.params;
    if (!isValidConversationId(id)) {
      res.status(400).json({ error: 'Invalid conversation ID format.' });
      return;
    }

    const { request, error } = validateDispatchRequest(req.body);
    if (error || !request) {
      res.status(400).json({ error: error ?? 'Invalid dispatch payload.' });
      return;
    }

    const result = service.dispatchPrompt(id, request);
    if (!result) {
      res.status(404).json({ error: 'Conversation not found.' });
      return;
    }

    if (result.noteSaved) {
      sseBroker.notifyMutation();
    }
    res.json(result);
  });

  // Full-text + metadata search
  app.get('/api/search', (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q : '';
    res.json(service.search(q));
  });

  // Settings
  app.get('/api/settings', (_req, res) => {
    res.json(service.getSettings());
  });

  app.patch('/api/settings', (req, res) => {
    const { patch, error } = validateSettingsPatch(req.body);
    if (error || !patch) {
      res.status(400).json({ error: error ?? 'Invalid settings payload.' });
      return;
    }

    const updated = service.patchSettings(patch);
    if (patch.pollIntervalMs !== undefined) {
      sseBroker.updatePollInterval(updated.pollIntervalMs);
    }
    sseBroker.notifyMutation();
    res.json(updated);
  });

  // SSE stream
  app.get('/api/events', (_req, res) => {
    sseBroker.addClient(res);
  });

  // Unknown API route returns JSON 404 (not SPA HTML)
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API endpoint not found.' });
  });

  // Serve built frontend static bundle if present
  const staticDir = options.staticDir !== undefined ? options.staticDir : resolveDefaultWebDistDir();
  if (staticDir && fs.existsSync(path.join(staticDir, 'index.html'))) {
    app.use(express.static(staticDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(staticDir, 'index.html'));
    });
  }

  // Global error handler
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err && typeof err === 'object' && 'type' in err && (err as { type?: string }).type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Malformed JSON body.' });
      return;
    }
    const message = err instanceof Error ? err.message : 'Internal server error';
    res.status(500).json({ error: message });
  });

  return { app, sseBroker, staticDir };
}
