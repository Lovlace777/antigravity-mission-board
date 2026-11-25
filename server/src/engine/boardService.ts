import fs from 'node:fs';
import path from 'node:path';
import type {
  ArtifactContentResponse,
  ArtifactInfo,
  BoardResponse,
  BoardSettings,
  ConversationCard,
  ConversationDetail,
  DispatchRequest,
  DispatchResponse,
  HealthResponse,
  LaneId,
  OverlayData,
  OverlayPatch,
  ReviewBatchResponse,
  SearchMatchField,
  SearchResponse,
  SearchResult,
  SubagentInfo,
  SwarmDetail,
  SwarmHoverPreview,
  SwarmSummary,
} from '../../../shared/types.js';
import { APP_VERSION } from '../config.js';
import { AntigravityReadOnlyDb, type FtsMetaRow, type SummaryRow } from '../db/antigravityDb.js';
import { createDefaultOverlay, OverlayStore } from '../db/overlayDb.js';
import { scanArtifactsDirectory } from '../parsers/artifacts.js';
import { parseAnnotationFile, type ParsedAnnotation } from '../parsers/pbtxt.js';
import {
  buildSubagentTree,
  parseSubagentDescriptorsDir,
  summarizeSubagents,
  type ChildSummaryRow,
  type SubagentDescriptorMeta,
} from '../parsers/subagents.js';
import {
  getSwarmFiles,
  parseSwarmDirectory,
  toSwarmSummary,
  type MemberRuntimeLookup,
} from '../parsers/swarm.js';
import {
  buildCompactPreview,
  createEmptyTranscript,
  parseTranscriptFile,
  type ParsedTranscript,
} from '../parsers/transcript.js';
import { buildFilesSignature, FileStatCache } from '../utils/cache.js';
import { detectDispatchCapabilities, launchAgyCliDispatch } from '../utils/dispatch.js';
import {
  isValidConversationId,
  readBoundedTextFile,
  resolveSafeArtifactPath,
} from '../utils/pathSafety.js';
import { normalizeTimestamp } from '../utils/time.js';
import { parseWorkspaceUris } from '../utils/uri.js';
import { assembleBoardResponse, classifyConversation } from './classifier.js';
import type { IBoardService, ServiceMetrics } from './types.js';

interface HydratedConversation {
  card: ConversationCard;
  swarmDetail: SwarmDetail | null;
  subagents: SubagentInfo[];
  artifacts: ArtifactInfo[];
  transcript: ParsedTranscript;
  annotation: ParsedAnnotation | null;
}

const MAX_STEPS_PREVIEW = 10;
const STALE_BUCKET_MS = 5 * 60_000; // Re-evaluate stale thresholds every 5 min on idle

export function buildSwarmHoverPreview(swarm: SwarmSummary | null): SwarmHoverPreview | null {
  if (!swarm) return null;
  const workingAgents = swarm.members
    .filter((m) => m.state === 'working')
    .map((m) => m.name);
  const lastMsg =
    swarm.recentMessages.length > 0
      ? swarm.recentMessages[swarm.recentMessages.length - 1]
      : null;

  return {
    goalTitle: swarm.goalTitle ?? swarm.title,
    goalLine: swarm.goalLine ?? '',
    workingAgents,
    latestPost: lastMsg
      ? {
          agent: lastMsg.agent,
          text: buildCompactPreview(lastMsg.text, 140) ?? lastMsg.text.slice(0, 140),
        }
      : null,
  };
}

function formatNoteTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export class LiveBoardService implements IBoardService {
  public readonly mode = 'live' as const;
  private readonly dataDir: string;
  private readonly antigravityDb: AntigravityReadOnlyDb;
  private readonly overlayStore: OverlayStore;
  private readonly startedAt = Date.now();

  // Bounded 200-entry LRU stat-keyed caches so memory stays flat over days/weeks
  private readonly annotationCache = new FileStatCache<ParsedAnnotation>(200);
  private readonly summaryTranscriptCache = new FileStatCache<ParsedTranscript>(200);
  private readonly swarmCache = new FileStatCache<SwarmDetail | null>(200);
  private readonly subagentDescCache = new FileStatCache<Map<string, SubagentDescriptorMeta>>(200);
  private readonly artifactsCache = new FileStatCache<ArtifactInfo[]>(200);

  // Stat-fingerprint fast path state (avoids opening SQLite when nothing changed on disk)
  private lastFingerprint: string | null = null;
  private cachedBoard: BoardResponse | null = null;
  private lastRunningIds: string[] = [];
  private _pollCount = 0;
  private _skippedIdlePolls = 0;

  constructor(dataDir: string, overlayDbPath: string) {
    this.dataDir = dataDir;
    this.antigravityDb = new AntigravityReadOnlyDb(dataDir);
    this.overlayStore = new OverlayStore(overlayDbPath);
  }

  private statToken(targetPath: string): string {
    try {
      const st = fs.statSync(targetPath);
      return `${st.mtimeMs}:${st.size}`;
    } catch {
      return 'm';
    }
  }

  /**
   * Ultra-cheap (<0.1ms) filesystem fingerprint checked before opening SQLite.
   * Tracks DB + WAL, annotations dir mtime, local overlay mutation version,
   * 5-minute stale bucket, and active running transcripts/swarms when any agent is running.
   */
  private computeFastFingerprint(): string {
    const dbPath = this.antigravityDb.dbPath;
    const walPath = `${dbPath}-wal`;
    const annotationsDir = path.join(this.dataDir, 'annotations');
    const timeBucket = Math.floor(Date.now() / STALE_BUCKET_MS);

    const parts = [
      this.statToken(dbPath),
      this.statToken(walPath),
      this.statToken(annotationsDir),
      `ov:${this.overlayStore.version}`,
      `tb:${timeBucket}`,
    ];

    // While agents are actively running, also stat their live logs & swarm files
    for (const cid of this.lastRunningIds) {
      const brainDir = path.join(this.dataDir, 'brain', cid);
      parts.push(
        `${cid}:${this.statToken(path.join(brainDir, '.system_generated', 'logs', 'transcript.jsonl'))}` +
          `|${this.statToken(path.join(brainDir, '.system_generated', 'swarm', 'board.jsonl'))}` +
          `|${this.statToken(path.join(brainDir, '.system_generated', 'swarm', 'members.json'))}`,
      );
    }

    return parts.join(';');
  }

  private getAnnotation(conversationId: string): ParsedAnnotation | null {
    const filePath = path.join(this.dataDir, 'annotations', `${conversationId}.pbtxt`);
    return this.annotationCache.getOrCompute(filePath, (p) => parseAnnotationFile(p));
  }

  private getTranscript(conversationId: string, forDetail: boolean): ParsedTranscript {
    const logsDir = path.join(this.dataDir, 'brain', conversationId, '.system_generated', 'logs');
    const transcriptPath = path.join(logsDir, 'transcript.jsonl');
    const fullPath = path.join(logsDir, 'transcript_full.jsonl');
    const sig = buildFilesSignature([transcriptPath, fullPath]);
    if (sig.startsWith(`${transcriptPath}|missing`)) {
      return createEmptyTranscript();
    }

    // Detail view requests full timeline on demand without inflating the board summary cache
    if (forDetail) {
      return parseTranscriptFile(transcriptPath, { tailOnly: false });
    }

    return this.summaryTranscriptCache.getOrComputeBySignature(transcriptPath, sig, () =>
      parseTranscriptFile(transcriptPath, { tailOnly: true }),
    );
  }

  private getSwarmDetail(
    conversationId: string,
    runtimeByConversationId: Map<string, MemberRuntimeLookup>,
  ): SwarmDetail | null {
    const swarmDir = path.join(this.dataDir, 'brain', conversationId, '.system_generated', 'swarm');
    const files = getSwarmFiles(swarmDir);
    const fileSig = buildFilesSignature(files);
    if (
      fileSig.includes(`${files[0]}|missing`) &&
      fileSig.includes(`${files[1]}|missing`)
    ) {
      return null;
    }

    const parsed = this.swarmCache.getOrComputeBySignature(swarmDir, fileSig, () =>
      parseSwarmDirectory(swarmDir, runtimeByConversationId),
    );

    if (!parsed) return null;

    let workingCount = 0;
    let waitingCount = 0;
    let killedCount = 0;
    const members = parsed.members.map((m) => {
      const runtime = m.conversationId ? runtimeByConversationId.get(m.conversationId) : undefined;
      let state = m.state;
      let isRunning = m.isRunning;
      let killed = m.killed;

      if (runtime?.killed) {
        state = 'killed';
        isRunning = false;
        killed = true;
      } else if (!killed && runtime?.status === 'CASCADE_RUN_STATUS_RUNNING') {
        state = 'working';
        isRunning = true;
      }

      if (state === 'working') workingCount += 1;
      else if (state === 'waiting') waitingCount += 1;
      else if (state === 'killed') killedCount += 1;

      return { ...m, state, isRunning, killed };
    });

    return {
      ...parsed,
      members,
      workingCount,
      waitingCount,
      killedCount,
    };
  }

  private getSubagentDescriptors(conversationId: string): Map<string, SubagentDescriptorMeta> {
    const subagentsDir = path.join(
      this.dataDir,
      'brain',
      conversationId,
      '.system_generated',
      'subagents',
    );
    let stat: fs.Stats;
    try {
      stat = fs.statSync(subagentsDir);
    } catch {
      return new Map();
    }
    let names: string[];
    try {
      names = fs.readdirSync(subagentsDir).filter((n) => n.endsWith('.json'));
    } catch {
      return new Map();
    }
    const sig = `${stat.mtimeMs}:${names.length}:${names.join(',')}`;
    return this.subagentDescCache.getOrComputeBySignature(subagentsDir, sig, () =>
      parseSubagentDescriptorsDir(subagentsDir),
    );
  }

  private getArtifacts(conversationId: string): ArtifactInfo[] {
    const brainDir = path.join(this.dataDir, 'brain', conversationId);
    let dirEntries: fs.Dirent[];
    try {
      dirEntries = fs.readdirSync(brainDir, { withFileTypes: true });
    } catch {
      return [];
    }

    const trackedPaths: string[] = [brainDir];
    for (const entry of dirEntries) {
      if (entry.name.startsWith('.') || entry.name === 'scratch') continue;
      trackedPaths.push(path.join(brainDir, entry.name));
    }
    const sig = buildFilesSignature(trackedPaths);
    return this.artifactsCache.getOrComputeBySignature(brainDir, sig, () =>
      scanArtifactsDirectory(brainDir),
    );
  }

  private hydrateAll(
    targetConversationIds?: string | Set<string>,
    forDetail = false,
  ): HydratedConversation[] {
    const snapshot = this.antigravityDb.readSnapshot();
    const settings = this.overlayStore.getSettings();
    const overlays = this.overlayStore.getAllOverlays();
    const nowMs = Date.now();

    const runtimeByConversationId = new Map<string, MemberRuntimeLookup>();
    const childrenByParent = new Map<string, ChildSummaryRow[]>();
    const roots: SummaryRow[] = [];

    for (const row of snapshot.summaries) {
      runtimeByConversationId.set(row.conversationId, {
        status: row.status,
        killed: row.killed,
      });

      const parentId =
        row.parentConversationId || snapshot.parentOverrides.get(row.conversationId) || '';

      if (row.nestingDepth === 0 && !parentId) {
        roots.push(row);
      } else if (parentId) {
        const list = childrenByParent.get(parentId) ?? [];
        list.push({
          conversationId: row.conversationId,
          parentConversationId: parentId,
          title: row.title,
          status: row.status,
          killed: row.killed,
          stepCount: row.stepCount,
          lastModifiedTime: row.lastModifiedTime,
          nestingDepth: row.nestingDepth,
          agentName: row.agentName,
        });
        childrenByParent.set(parentId, list);
      }
    }

    const filteredRoots =
      typeof targetConversationIds === 'string'
        ? roots.filter((r) => r.conversationId === targetConversationIds)
        : targetConversationIds instanceof Set
          ? roots.filter((r) => targetConversationIds.has(r.conversationId))
          : roots;

    const results: HydratedConversation[] = [];

    for (const row of filteredRoots) {
      const cid = row.conversationId;
      const ftsMeta: FtsMetaRow | undefined = snapshot.ftsMetaById.get(cid);
      const annotation = this.getAnnotation(cid);
      const isArchived = Boolean(annotation?.archived || ftsMeta?.archived);
      const isDirectlyRunning =
        row.status === 'CASCADE_RUN_STATUS_RUNNING' || row.notFullyIdle;

      // Lazy archived transcript skip: do NOT parse archived transcript.jsonl during board polling!
      const skipArchivedTranscript = isArchived && !forDetail && !isDirectlyRunning;
      const transcript = skipArchivedTranscript
        ? createEmptyTranscript()
        : this.getTranscript(cid, forDetail);

      const swarmDetail = this.getSwarmDetail(cid, runtimeByConversationId);
      const swarm = swarmDetail ? toSwarmSummary(swarmDetail) : null;

      const descriptors = this.getSubagentDescriptors(cid);
      const subagents = buildSubagentTree(cid, childrenByParent, descriptors);
      const subagentStats = summarizeSubagents(subagents);

      const artifacts = this.getArtifacts(cid);
      const overlay = overlays.get(cid) ?? createDefaultOverlay(cid);

      const parsedWorkspace = parseWorkspaceUris(row.workspaceUris, ftsMeta?.workspace ?? '');
      const lastModifiedAt =
        normalizeTimestamp(row.lastModifiedTime) ?? new Date(0).toISOString();
      const lastUserInputAt = normalizeTimestamp(row.lastUserInputTime);
      const lastUserViewAt = annotation?.lastUserViewAt ?? null;
      const markedAsUnread = Boolean(annotation?.markedAsUnread);

      const classification = classifyConversation({
        status: row.status,
        notFullyIdle: row.notFullyIdle,
        isArchived,
        lastModifiedAt,
        lastUserInputAt,
        lastUserViewAt,
        markedAsUnread,
        hasPendingQuestion: transcript.hasPendingQuestion,
        hasError: transcript.hasError,
        artifacts,
        activeSubagentCount: subagentStats.activeCount,
        swarm,
        overlay,
        settings,
        nowMs,
      });

      const title =
        annotation?.title ||
        row.title.trim() ||
        row.preview.trim().slice(0, 80) ||
        'Untitled Conversation';

      const stepsCompleted = transcript.steps.filter((s) => s.status === 'done').length;
      const latestMessagePreview =
        transcript.latestMessagePreview ?? buildCompactPreview(row.preview) ?? null;
      const feedbackArtifacts = artifacts
        .filter((a) => a.requestFeedback)
        .map((a) => a.fileName);

      const card: ConversationCard = {
        id: cid,
        title,
        preview: row.preview.trim(),
        project: ftsMeta?.project ?? '',
        projectId: row.projectId,
        workspace: parsedWorkspace.basename,
        workspacePath: parsedWorkspace.primaryPath,
        workspaceUris: parsedWorkspace.uris,

        lane: classification.lane,
        autoLane: classification.autoLane,
        isManualLane: classification.isManualLane,
        isRunning: classification.isRunning,
        isArchived,
        status: row.status,
        notFullyIdle: row.notFullyIdle,
        attentionReasons: classification.attentionReasons,

        currentFocus: transcript.currentFocus,
        steps: transcript.steps,
        stepsCompleted,
        stepsTotal: transcript.steps.length,
        stepCount: row.stepCount,

        lastModifiedAt,
        lastUserInputAt,
        lastUserViewAt,
        markedAsUnread,
        planExecute: Boolean(annotation?.planExecute),
        hasError: transcript.hasError,
        hasPendingQuestion: transcript.hasPendingQuestion,
        pendingFeedbackCount: classification.pendingFeedbackCount,

        models: transcript.models,
        tokens: transcript.tokens,

        swarm,
        subagentCount: subagentStats.totalCount,
        activeSubagentCount: subagentStats.activeCount,
        subagentsPreview: subagentStats.preview,
        artifactCount: artifacts.length,
        sideQuestionCount: annotation?.sideQuestionIds.length ?? 0,

        latestMessagePreview,
        stepsPreview: transcript.steps.slice(0, MAX_STEPS_PREVIEW),
        swarmPreview: buildSwarmHoverPreview(swarm),
        feedbackArtifacts,

        overlay,
      };

      results.push({
        card,
        swarmDetail,
        subagents,
        artifacts,
        transcript,
        annotation,
      });
    }

    return results;
  }

  getHealth(): HealthResponse {
    let dataDirAccessible = false;
    try {
      fs.accessSync(this.dataDir, fs.constants.R_OK);
      dataDirAccessible = true;
    } catch {
      dataDirAccessible = false;
    }

    const dbAccessible = this.antigravityDb.isAccessible();
    let conversationCount = 0;
    if (dbAccessible) {
      if (this.cachedBoard) {
        conversationCount = this.cachedBoard.stats.total;
      } else {
        try {
          conversationCount = this.antigravityDb
            .readSnapshot()
            .summaries.filter((s) => s.nestingDepth === 0 && !s.parentConversationId).length;
        } catch {
          conversationCount = 0;
        }
      }
    }

    return {
      ok: true,
      mode: 'live',
      version: APP_VERSION,
      dataDir: this.dataDir,
      dataDirAccessible,
      dbAccessible,
      conversationCount,
      uptimeSec: Math.floor((Date.now() - this.startedAt) / 1000),
      dispatchCapabilities: detectDispatchCapabilities(),
    };
  }

  getBoard(): BoardResponse {
    this._pollCount += 1;
    const fp = this.computeFastFingerprint();
    if (this.cachedBoard && this.lastFingerprint === fp) {
      this._skippedIdlePolls += 1;
      return this.cachedBoard;
    }

    const settings = this.overlayStore.getSettings();
    const hydrated = this.hydrateAll(undefined, false);
    const board = assembleBoardResponse(
      'live',
      hydrated.map((h) => h.card),
      settings,
    );

    this.cachedBoard = board;
    this.lastRunningIds = board.conversations.filter((c) => c.isRunning).map((c) => c.id);
    this.lastFingerprint = this.computeFastFingerprint();
    return board;
  }

  getConversationDetail(conversationId: string): ConversationDetail | null {
    if (!isValidConversationId(conversationId)) return null;
    const hydrated = this.hydrateAll(conversationId, true);
    if (hydrated.length === 0) return null;

    const item = hydrated[0];
    const sideQuestions = (item.annotation?.sideQuestionIds ?? []).map((sqId) => ({
      id: sqId,
      title: item.annotation?.sideQuestionTitles[sqId] ?? 'Side Question',
    }));

    return {
      ...item.card,
      swarmDetail: item.swarmDetail,
      subagents: item.subagents,
      artifacts: item.artifacts,
      timeline: item.transcript.timeline,
      sideQuestions,
      lastError: item.transcript.lastError,
      pendingQuestionText: item.transcript.pendingQuestionText,
    };
  }

  readArtifact(conversationId: string, relativeFilePath: string): ArtifactContentResponse | null {
    if (!isValidConversationId(conversationId)) return null;
    const brainConversationDir = path.join(this.dataDir, 'brain', conversationId);
    const safePath = resolveSafeArtifactPath(brainConversationDir, relativeFilePath);
    if (!safePath) return null;

    const normalizedRel = relativeFilePath.replace(/\\/g, '/').trim();
    const artifacts = this.getArtifacts(conversationId);
    const metadata = artifacts.find((a) => a.relativePath === normalizedRel) ?? null;

    const { content, truncated, sizeBytes } = readBoundedTextFile(safePath);

    return {
      conversationId,
      fileName: path.basename(safePath),
      relativePath: normalizedRel,
      content,
      truncated,
      sizeBytes,
      metadata,
    };
  }

  patchOverlay(
    conversationId: string,
    patch: OverlayPatch,
  ): { overlay: OverlayData; card: ConversationCard | null } {
    const overlay = this.overlayStore.patchOverlay(conversationId, patch);
    const hydrated = this.hydrateAll(conversationId, false);
    return {
      overlay,
      card: hydrated[0]?.card ?? null,
    };
  }

  markReviewed(conversationId: string): { overlay: OverlayData; card: ConversationCard | null } {
    const overlay = this.overlayStore.markReviewed(conversationId);
    const hydrated = this.hydrateAll(conversationId, false);
    return {
      overlay,
      card: hydrated[0]?.card ?? null,
    };
  }

  markReviewedBatch(
    ids: string[],
    reviewedAt?: string | null,
    restoreManualLanes?: Record<string, LaneId | null>,
  ): ReviewBatchResponse {
    const uniqueIds = Array.from(new Set(ids));
    const appliedReviewedAt =
      reviewedAt === undefined ? new Date().toISOString() : reviewedAt;
    this.overlayStore.markReviewedBatch(uniqueIds, appliedReviewedAt, restoreManualLanes);
    const idSet = new Set(uniqueIds);
    const hydrated = this.hydrateAll(idSet, false);
    return {
      updatedCount: uniqueIds.length,
      reviewedAt: appliedReviewedAt,
      cards: hydrated.map((h) => h.card),
    };
  }

  dispatchPrompt(conversationId: string, request: DispatchRequest): DispatchResponse | null {
    if (!isValidConversationId(conversationId)) return null;
    const existing = this.hydrateAll(conversationId, false);
    if (existing.length === 0) return null;

    const prompt = request.prompt.trim();
    let card = existing[0].card;
    let noteSaved = false;

    if (request.saveToNotes) {
      const stamp = formatNoteTimestamp();
      const entryLine = `[${stamp}] → ${prompt}`;
      const nextNotes = card.overlay.notes.trim()
        ? `${card.overlay.notes.trim()}\n${entryLine}`
        : entryLine;
      const updated = this.patchOverlay(conversationId, { notes: nextNotes });
      if (updated.card) card = updated.card;
      noteSaved = true;
    }

    const caps = detectDispatchCapabilities();
    if (caps.agyCliAvailable) {
      const launched = launchAgyCliDispatch(conversationId, prompt, card.workspacePath);
      if (launched) {
        return {
          ok: true,
          mode: 'agy_cli',
          copiedPrompt: prompt,
          conversationId,
          noteSaved,
          message: 'Dispatched follow-up prompt via Antigravity CLI (`agy`).',
          card,
        };
      }
    }

    return {
      ok: true,
      mode: 'handoff',
      copiedPrompt: prompt,
      conversationId,
      noteSaved,
      message: 'Prompt prepared for Antigravity Desktop handoff.',
      card,
    };
  }

  search(rawQuery: string): SearchResponse {
    const query = rawQuery.trim();
    if (!query) {
      return { query: '', total: 0, results: [] };
    }

    const board = this.getBoard();
    const lowerQ = query.toLowerCase();
    const ftsHits = this.antigravityDb.searchFts(query, 50);
    const ftsSnippetById = new Map<string, string>();
    for (const hit of ftsHits) {
      ftsSnippetById.set(hit.conversationId, hit.snippet);
    }

    const results: SearchResult[] = [];
    for (const card of board.conversations) {
      const matchedIn: SearchMatchField[] = [];
      let snippet = '';

      if (card.title.toLowerCase().includes(lowerQ)) {
        matchedIn.push('title');
        snippet = card.title;
      }
      if (card.preview.toLowerCase().includes(lowerQ)) {
        matchedIn.push('preview');
        if (!snippet) snippet = card.preview.slice(0, 180);
      }
      if (card.overlay.notes.toLowerCase().includes(lowerQ)) {
        matchedIn.push('notes');
        if (!snippet) snippet = card.overlay.notes.slice(0, 180);
      }
      if (card.overlay.tags.some((t) => t.toLowerCase().includes(lowerQ))) {
        matchedIn.push('tags');
        if (!snippet) snippet = card.overlay.tags.join(', ');
      }
      if (card.workspace.toLowerCase().includes(lowerQ)) {
        matchedIn.push('workspace');
      }
      if (card.project.toLowerCase().includes(lowerQ)) {
        matchedIn.push('project');
      }

      const ftsSnippet = ftsSnippetById.get(card.id);
      if (ftsSnippet !== undefined) {
        matchedIn.push('transcript');
        if (!snippet) snippet = ftsSnippet || card.preview.slice(0, 180);
      }

      if (matchedIn.length > 0) {
        results.push({
          conversationId: card.id,
          matchedIn,
          snippet: snippet || card.preview.slice(0, 160),
          card,
        });
      }
    }

    results.sort((a, b) => {
      const aDirect = a.matchedIn.includes('title') || a.matchedIn.includes('tags') ? 0 : 1;
      const bDirect = b.matchedIn.includes('title') || b.matchedIn.includes('tags') ? 0 : 1;
      if (aDirect !== bDirect) return aDirect - bDirect;
      return b.card.lastModifiedAt.localeCompare(a.card.lastModifiedAt);
    });

    return {
      query,
      total: results.length,
      results,
    };
  }

  getSettings(): BoardSettings {
    return this.overlayStore.getSettings();
  }

  patchSettings(patch: Partial<BoardSettings>): BoardSettings {
    return this.overlayStore.patchSettings(patch);
  }

  getMetrics(): ServiceMetrics {
    const cacheHits =
      this._skippedIdlePolls +
      this.annotationCache.hits +
      this.summaryTranscriptCache.hits +
      this.swarmCache.hits +
      this.subagentDescCache.hits +
      this.artifactsCache.hits;

    return {
      pollCount: this._pollCount,
      cacheHits,
      skippedIdlePolls: this._skippedIdlePolls,
    };
  }

  close(): void {
    this.overlayStore.close();
  }
}
