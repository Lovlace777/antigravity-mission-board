import crypto from 'node:crypto';
import type {
  ActiveSwarmEntry,
  ArtifactInfo,
  AttentionReason,
  BoardNotification,
  BoardResponse,
  BoardSettings,
  BoardStats,
  ConversationCard,
  LaneId,
  OverlayData,
  Priority,
  SwarmSummary,
  WorkspaceSummary,
} from '../../../shared/types.js';
import { finalizeTokenUsage } from '../parsers/transcript.js';
import { parseFollowUpMs, parseTimestampMs } from '../utils/time.js';

export interface ClassificationInput {
  status: string;
  notFullyIdle: boolean;
  isArchived: boolean;
  lastModifiedAt: string;
  lastUserInputAt: string | null;
  lastUserViewAt: string | null;
  markedAsUnread: boolean;
  hasPendingQuestion: boolean;
  hasError: boolean;
  artifacts: ArtifactInfo[];
  activeSubagentCount: number;
  swarm: SwarmSummary | null;
  overlay: OverlayData;
  settings: BoardSettings;
  nowMs?: number;
}

export interface ClassificationResult {
  lane: LaneId;
  autoLane: LaneId;
  isManualLane: boolean;
  isRunning: boolean;
  attentionReasons: AttentionReason[];
  pendingFeedbackCount: number;
}

const UNREAD_JITTER_MS = 1000;
const UNVIEWED_REPLY_GAP_MS = 5000;

export function classifyConversation(input: ClassificationInput): ClassificationResult {
  const nowMs = input.nowMs ?? Date.now();
  const lastModifiedMs = parseTimestampMs(input.lastModifiedAt) ?? 0;
  const lastUserInputMs = parseTimestampMs(input.lastUserInputAt);
  const lastUserViewMs = parseTimestampMs(input.lastUserViewAt);
  const reviewedAtMs = parseTimestampMs(input.overlay.reviewedAt);

  const isRunning =
    input.status === 'CASCADE_RUN_STATUS_RUNNING' ||
    input.notFullyIdle ||
    input.activeSubagentCount > 0 ||
    (input.swarm !== null && input.swarm.workingCount > 0);

  const reviewedCoversLastMod = reviewedAtMs !== null && reviewedAtMs >= lastModifiedMs;

  const pendingFeedbackArtifacts = input.artifacts.filter((a) => {
    if (!a.requestFeedback) return false;
    const updatedMs = parseTimestampMs(a.updatedAt) ?? lastModifiedMs;
    if (reviewedAtMs !== null && reviewedAtMs >= updatedMs) return false;
    return true;
  });
  const pendingFeedbackCount = pendingFeedbackArtifacts.length;

  const attentionReasons: AttentionReason[] = [];

  if (!input.isArchived) {
    if (input.markedAsUnread && !reviewedCoversLastMod) {
      attentionReasons.push('marked_as_unread');
    }

    if (!isRunning) {
      if (lastUserViewMs !== null || reviewedAtMs !== null) {
        const baselineMs = Math.max(lastUserViewMs ?? 0, reviewedAtMs ?? 0);
        if (lastModifiedMs > baselineMs + UNREAD_JITTER_MS) {
          attentionReasons.push('unread_update');
        }
      } else if (lastUserInputMs !== null && lastModifiedMs > lastUserInputMs + UNVIEWED_REPLY_GAP_MS) {
        attentionReasons.push('unread_update');
      }
    }

    if (input.hasPendingQuestion && !reviewedCoversLastMod) {
      attentionReasons.push('needs_input');
    }

    if (pendingFeedbackCount > 0) {
      attentionReasons.push('request_feedback');
    }

    if (input.hasError && !reviewedCoversLastMod) {
      attentionReasons.push('error');
    }

    const followUpMs = parseFollowUpMs(input.overlay.followUpAt);
    if (followUpMs !== null && followUpMs <= nowMs && (reviewedAtMs === null || reviewedAtMs < followUpMs)) {
      attentionReasons.push('follow_up_due');
    }
  }

  let autoLane: LaneId;
  if (isRunning) {
    autoLane = 'running';
  } else if (input.isArchived) {
    autoLane = 'archived';
  } else if (attentionReasons.length > 0) {
    autoLane = 'attention';
  } else {
    const staleThresholdMs = Math.max(1, input.settings.staleAfterHours) * 3_600_000;
    const idleMs = Math.max(0, nowMs - lastModifiedMs);
    autoLane = idleMs > staleThresholdMs ? 'stale' : 'active';
  }

  const isManualLane = input.overlay.manualLane !== null;
  const lane: LaneId = input.overlay.manualLane ?? autoLane;

  return {
    lane,
    autoLane,
    isManualLane,
    isRunning,
    attentionReasons,
    pendingFeedbackCount,
  };
}

const PRIORITY_RANK: Record<Exclude<Priority, null>, number> = {
  p0: 0,
  p1: 1,
  p2: 2,
};

export function sortConversationCards(cards: ConversationCard[]): ConversationCard[] {
  return [...cards].sort((a, b) => {
    if (a.overlay.pinned !== b.overlay.pinned) {
      return a.overlay.pinned ? -1 : 1;
    }
    const pa = a.overlay.priority ? PRIORITY_RANK[a.overlay.priority] : 3;
    const pb = b.overlay.priority ? PRIORITY_RANK[b.overlay.priority] : 3;
    if (pa !== pb) return pa - pb;
    return b.lastModifiedAt.localeCompare(a.lastModifiedAt);
  });
}

export function buildBoardStats(cards: ConversationCard[]): BoardStats {
  const byLane: Record<LaneId, number> = {
    running: 0,
    attention: 0,
    active: 0,
    stale: 0,
    archived: 0,
  };

  let runningCount = 0;
  let attentionCount = 0;
  let staleCount = 0;
  let archivedCount = 0;
  let activeSwarmCount = 0;
  let activeAgentCount = 0;

  let totalIn = 0;
  let totalCache = 0;
  let totalOut = 0;

  for (const card of cards) {
    byLane[card.lane] += 1;
    if (card.isRunning) runningCount += 1;
    if (!card.isRunning && !card.isArchived && card.attentionReasons.length > 0) {
      attentionCount += 1;
    }
    if (card.lane === 'stale') staleCount += 1;
    if (card.lane === 'archived') archivedCount += 1;

    if (card.swarm && (card.swarm.workingCount > 0 || card.swarm.waitingCount > 0)) {
      activeSwarmCount += 1;
      activeAgentCount += card.swarm.workingCount;
    }
    activeAgentCount += card.activeSubagentCount;

    totalIn += card.tokens.inputTokens;
    totalCache += card.tokens.cacheReadTokens;
    totalOut += card.tokens.outputTokens;
  }

  return {
    total: cards.length,
    byLane,
    runningCount,
    attentionCount,
    staleCount,
    archivedCount,
    activeSwarmCount,
    activeAgentCount,
    tokens: finalizeTokenUsage(totalIn, totalCache, totalOut),
  };
}

export function assembleBoardResponse(
  mode: 'live' | 'demo',
  rawCards: ConversationCard[],
  settings: BoardSettings,
): BoardResponse {
  const conversations = sortConversationCards(rawCards);
  const stats = buildBoardStats(conversations);

  const wsMap = new Map<string, WorkspaceSummary>();
  const projectSet = new Set<string>();
  const tagSet = new Set<string>();
  const activeSwarms: ActiveSwarmEntry[] = [];

  for (const card of conversations) {
    if (card.workspace) {
      const existing = wsMap.get(card.workspace);
      if (existing) {
        existing.count += 1;
        if (!existing.path && card.workspacePath) existing.path = card.workspacePath;
      } else {
        wsMap.set(card.workspace, {
          name: card.workspace,
          path: card.workspacePath,
          count: 1,
        });
      }
    }

    if (card.project) {
      projectSet.add(card.project);
    }

    for (const tag of card.overlay.tags) {
      tagSet.add(tag);
    }

    if (card.swarm) {
      activeSwarms.push({
        conversationId: card.id,
        conversationTitle: card.title,
        workspace: card.workspace,
        swarm: card.swarm,
      });
    }
  }

  const workspaces = Array.from(wsMap.values()).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const projects = Array.from(projectSet).sort((a, b) => a.localeCompare(b));
  const tags = Array.from(tagSet).sort((a, b) => a.localeCompare(b));

  activeSwarms.sort((a, b) => {
    if (a.swarm.workingCount !== b.swarm.workingCount) {
      return b.swarm.workingCount - a.swarm.workingCount;
    }
    return b.swarm.messageCount - a.swarm.messageCount;
  });

  const snapshotPayload = JSON.stringify({
    mode,
    settings,
    conversations,
  });
  const snapshotHash = crypto.createHash('sha256').update(snapshotPayload).digest('hex').slice(0, 16);

  return {
    mode,
    generatedAt: new Date().toISOString(),
    snapshotHash,
    conversations,
    stats,
    workspaces,
    projects,
    tags,
    settings,
    activeSwarms,
  };
}

/**
 * Detect high-signal semantic transitions between consecutive board snapshots
 * to emit desktop / SSE notifications without spamming noise.
 */
export function detectNotifications(
  previous: BoardResponse | null,
  current: BoardResponse,
): BoardNotification[] {
  if (!previous) return [];

  const prevById = new Map<string, ConversationCard>();
  for (const card of previous.conversations) {
    prevById.set(card.id, card);
  }

  const nowIso = new Date().toISOString();
  const notifications: BoardNotification[] = [];

  for (const next of current.conversations) {
    const prev = prevById.get(next.id);
    if (!prev || next.isArchived) continue;

    if (prev.isRunning && !next.isRunning) {
      if (next.hasError) {
        notifications.push({
          id: `${next.id}:error:${Date.now()}`,
          kind: 'error',
          conversationId: next.id,
          title: next.title,
          workspace: next.workspace,
          message: 'Agent run stopped with an error',
          timestamp: nowIso,
        });
      } else if (next.hasPendingQuestion) {
        notifications.push({
          id: `${next.id}:input:${Date.now()}`,
          kind: 'needs_input',
          conversationId: next.id,
          title: next.title,
          workspace: next.workspace,
          message: 'Agent is waiting for your input',
          timestamp: nowIso,
        });
      } else if (next.pendingFeedbackCount > 0) {
        notifications.push({
          id: `${next.id}:feedback:${Date.now()}`,
          kind: 'feedback_requested',
          conversationId: next.id,
          title: next.title,
          workspace: next.workspace,
          message: 'Artifact is ready for your review',
          timestamp: nowIso,
        });
      } else {
        notifications.push({
          id: `${next.id}:finished:${Date.now()}`,
          kind: 'run_finished',
          conversationId: next.id,
          title: next.title,
          workspace: next.workspace,
          message: 'Agent run finished and is ready to review',
          timestamp: nowIso,
        });
      }
      continue;
    }

    if (!prev.hasError && next.hasError) {
      notifications.push({
        id: `${next.id}:error:${Date.now()}`,
        kind: 'error',
        conversationId: next.id,
        title: next.title,
        workspace: next.workspace,
        message: 'Conversation encountered an execution error',
        timestamp: nowIso,
      });
    } else if (!prev.hasPendingQuestion && next.hasPendingQuestion) {
      notifications.push({
        id: `${next.id}:input:${Date.now()}`,
        kind: 'needs_input',
        conversationId: next.id,
        title: next.title,
        workspace: next.workspace,
        message: 'Agent asked a question and needs your decision',
        timestamp: nowIso,
      });
    } else if (prev.pendingFeedbackCount < next.pendingFeedbackCount) {
      notifications.push({
        id: `${next.id}:feedback:${Date.now()}`,
        kind: 'feedback_requested',
        conversationId: next.id,
        title: next.title,
        workspace: next.workspace,
        message: 'New artifact requires your approval',
        timestamp: nowIso,
      });
    } else if (
      prev.autoLane !== 'attention' &&
      next.autoLane === 'attention' &&
      !next.isRunning
    ) {
      notifications.push({
        id: `${next.id}:attention:${Date.now()}`,
        kind: 'needs_attention',
        conversationId: next.id,
        title: next.title,
        workspace: next.workspace,
        message: 'Conversation needs your attention',
        timestamp: nowIso,
      });
    }
  }

  return notifications;
}
