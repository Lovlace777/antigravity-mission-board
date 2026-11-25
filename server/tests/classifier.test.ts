import { describe, expect, it } from 'vitest';
import type { BoardSettings, ConversationCard, OverlayData, SwarmSummary } from '../../shared/types.js';
import { createDefaultOverlay } from '../src/db/overlayDb.js';
import {
  assembleBoardResponse,
  classifyConversation,
  detectNotifications,
  type ClassificationInput,
} from '../src/engine/classifier.js';
import { createEmptyTokenUsage } from '../src/parsers/transcript.js';

const BASE_NOW_MS = Date.parse('2026-11-24T12:00:00.000Z');
const DEFAULT_SETTINGS: BoardSettings = {
  staleAfterHours: 72,
  pollIntervalMs: 3000,
};

function makeInput(overrides: Partial<ClassificationInput> = {}): ClassificationInput {
  return {
    status: 'CASCADE_RUN_STATUS_IDLE',
    notFullyIdle: false,
    isArchived: false,
    lastModifiedAt: '2026-11-24T10:00:00.000Z',
    lastUserInputAt: '2026-11-24T09:50:00.000Z',
    lastUserViewAt: '2026-11-24T10:05:00.000Z',
    markedAsUnread: false,
    hasPendingQuestion: false,
    hasError: false,
    artifacts: [],
    activeSubagentCount: 0,
    swarm: null,
    overlay: createDefaultOverlay('conv-1'),
    settings: DEFAULT_SETTINGS,
    nowMs: BASE_NOW_MS,
    ...overrides,
  };
}

describe('lane classification engine', () => {
  it('classifies running via status, notFullyIdle, activeSubagentCount, or working swarm member', () => {
    expect(classifyConversation(makeInput({ status: 'CASCADE_RUN_STATUS_RUNNING' })).autoLane).toBe(
      'running',
    );
    expect(classifyConversation(makeInput({ notFullyIdle: true })).autoLane).toBe('running');
    expect(classifyConversation(makeInput({ activeSubagentCount: 1 })).autoLane).toBe('running');

    const workingSwarm: SwarmSummary = {
      swarmId: 's1',
      title: 'Swarm',
      createdAt: null,
      goalTitle: null,
      goalLine: null,
      threads: [],
      members: [],
      workingCount: 1,
      waitingCount: 1,
      killedCount: 0,
      totalMembers: 2,
      messageCount: 1,
      recentMessages: [],
    };
    expect(classifyConversation(makeInput({ swarm: workingSwarm })).autoLane).toBe('running');
  });

  it('classifies attention reasons accurately and clears them once reviewedAt >= lastModifiedAt', () => {
    const unread = classifyConversation(
      makeInput({
        lastModifiedAt: '2026-11-24T11:00:00.000Z',
        lastUserViewAt: '2026-11-24T10:00:00.000Z',
        markedAsUnread: true,
        hasPendingQuestion: true,
        hasError: true,
        artifacts: [
          {
            fileName: 'plan.md',
            relativePath: 'plan.md',
            summary: 'Plan',
            updatedAt: '2026-11-24T11:00:00.000Z',
            userFacing: true,
            requestFeedback: true,
            sizeBytes: 100,
          },
        ],
      }),
    );

    expect(unread.autoLane).toBe('attention');
    expect(unread.attentionReasons).toEqual([
      'marked_as_unread',
      'unread_update',
      'needs_input',
      'request_feedback',
      'error',
    ]);
    expect(unread.pendingFeedbackCount).toBe(1);

    // After marking reviewed at 11:30, all pre-11:30 attention reasons clear -> active
    const reviewedOverlay: OverlayData = {
      ...createDefaultOverlay('conv-1'),
      reviewedAt: '2026-11-24T11:30:00.000Z',
    };
    const reviewed = classifyConversation(
      makeInput({
        lastModifiedAt: '2026-11-24T11:00:00.000Z',
        lastUserViewAt: '2026-11-24T10:00:00.000Z',
        markedAsUnread: true,
        hasPendingQuestion: true,
        hasError: true,
        overlay: reviewedOverlay,
        artifacts: [
          {
            fileName: 'plan.md',
            relativePath: 'plan.md',
            summary: 'Plan',
            updatedAt: '2026-11-24T11:00:00.000Z',
            userFacing: true,
            requestFeedback: true,
            sizeBytes: 100,
          },
        ],
      }),
    );

    expect(reviewed.autoLane).toBe('active');
    expect(reviewed.attentionReasons).toEqual([]);
    expect(reviewed.pendingFeedbackCount).toBe(0);
  });

  it('classifies stale vs active based on settings.staleAfterHours', () => {
    const fourDaysAgo = new Date(BASE_NOW_MS - 96 * 3_600_000).toISOString();
    const res72 = classifyConversation(
      makeInput({
        lastModifiedAt: fourDaysAgo,
        lastUserViewAt: fourDaysAgo,
        settings: { staleAfterHours: 72, pollIntervalMs: 3000 },
      }),
    );
    expect(res72.autoLane).toBe('stale');

    const res120 = classifyConversation(
      makeInput({
        lastModifiedAt: fourDaysAgo,
        lastUserViewAt: fourDaysAgo,
        settings: { staleAfterHours: 120, pollIntervalMs: 3000 },
      }),
    );
    expect(res120.autoLane).toBe('active');
  });

  it('preserves autoLane, isRunning, and attentionReasons when manualLane overrides lane', () => {
    const res = classifyConversation(
      makeInput({
        status: 'CASCADE_RUN_STATUS_RUNNING',
        overlay: {
          ...createDefaultOverlay('conv-1'),
          manualLane: 'active',
        },
      }),
    );

    expect(res.lane).toBe('active');
    expect(res.autoLane).toBe('running');
    expect(res.isManualLane).toBe(true);
    expect(res.isRunning).toBe(true);
  });

  it('supports moving stale, running, or archived cards into attention with manual_attention reason', () => {
    const fourDaysAgo = new Date(BASE_NOW_MS - 96 * 3_600_000).toISOString();

    const staleToAttention = classifyConversation(
      makeInput({
        lastModifiedAt: fourDaysAgo,
        lastUserViewAt: fourDaysAgo,
        overlay: {
          ...createDefaultOverlay('conv-1'),
          manualLane: 'attention',
        },
      }),
    );
    expect(staleToAttention.lane).toBe('attention');
    expect(staleToAttention.autoLane).toBe('stale');
    expect(staleToAttention.isManualLane).toBe(true);
    expect(staleToAttention.attentionReasons).toEqual(['manual_attention']);

    const runningToAttention = classifyConversation(
      makeInput({
        status: 'CASCADE_RUN_STATUS_RUNNING',
        overlay: {
          ...createDefaultOverlay('conv-1'),
          manualLane: 'attention',
        },
      }),
    );
    expect(runningToAttention.lane).toBe('attention');
    expect(runningToAttention.autoLane).toBe('running');
    expect(runningToAttention.isRunning).toBe(true);
    expect(runningToAttention.attentionReasons).toEqual(['manual_attention']);

    const archivedToAttention = classifyConversation(
      makeInput({
        isArchived: true,
        overlay: {
          ...createDefaultOverlay('conv-1'),
          manualLane: 'attention',
        },
      }),
    );
    expect(archivedToAttention.lane).toBe('attention');
    expect(archivedToAttention.autoLane).toBe('archived');
    expect(archivedToAttention.attentionReasons).toEqual(['manual_attention']);
  });

  it('does not emit unread_update while actively running, while preserving explicit attention signals', () => {
    const runningModifiedAfterView = classifyConversation(
      makeInput({
        status: 'CASCADE_RUN_STATUS_RUNNING',
        lastModifiedAt: '2026-11-24T11:30:00.000Z',
        lastUserViewAt: '2026-11-24T10:00:00.000Z',
        markedAsUnread: false,
      }),
    );
    expect(runningModifiedAfterView.autoLane).toBe('running');
    expect(runningModifiedAfterView.isRunning).toBe(true);
    expect(runningModifiedAfterView.attentionReasons).not.toContain('unread_update');

    const runningWithExplicitSignals = classifyConversation(
      makeInput({
        status: 'CASCADE_RUN_STATUS_RUNNING',
        lastModifiedAt: '2026-11-24T11:30:00.000Z',
        lastUserViewAt: '2026-11-24T10:00:00.000Z',
        markedAsUnread: true,
        hasPendingQuestion: true,
      }),
    );
    expect(runningWithExplicitSignals.autoLane).toBe('running');
    expect(runningWithExplicitSignals.attentionReasons).toEqual([
      'marked_as_unread',
      'needs_input',
    ]);
  });

  it('classifies archived without emitting attention reasons', () => {
    const res = classifyConversation(
      makeInput({
        isArchived: true,
        markedAsUnread: true,
        hasError: true,
      }),
    );
    expect(res.autoLane).toBe('archived');
    expect(res.attentionReasons).toEqual([]);
  });

  it('detects semantic SSE notification transitions when a running agent completes or errors', () => {
    const baseCard: ConversationCard = {
      id: 'c1',
      title: 'Deploy migration',
      preview: '',
      project: 'Aurora',
      projectId: 'p1',
      workspace: 'aurora-cloud',
      workspacePath: '/aurora-cloud',
      workspaceUris: [],
      lane: 'running',
      autoLane: 'running',
      isManualLane: false,
      isRunning: true,
      isArchived: false,
      status: 'CASCADE_RUN_STATUS_RUNNING',
      notFullyIdle: false,
      attentionReasons: [],
      currentFocus: null,
      steps: [],
      stepsCompleted: 0,
      stepsTotal: 0,
      stepCount: 5,
      lastModifiedAt: '2026-11-24T12:00:00.000Z',
      lastUserInputAt: null,
      lastUserViewAt: null,
      markedAsUnread: false,
      planExecute: false,
      hasError: false,
      hasPendingQuestion: false,
      pendingFeedbackCount: 0,
      models: [],
      tokens: createEmptyTokenUsage(),
      swarm: null,
      subagentCount: 0,
      activeSubagentCount: 0,
      subagentsPreview: [],
      artifactCount: 0,
      sideQuestionCount: 0,
      latestMessagePreview: null,
      stepsPreview: [],
      swarmPreview: null,
      feedbackArtifacts: [],
      overlay: createDefaultOverlay('c1'),
    };

    const prevBoard = assembleBoardResponse('live', [baseCard], DEFAULT_SETTINGS);
    const finishedCard: ConversationCard = {
      ...baseCard,
      lane: 'attention',
      autoLane: 'attention',
      isRunning: false,
      status: 'CASCADE_RUN_STATUS_IDLE',
      attentionReasons: ['unread_update'],
    };
    const nextBoard = assembleBoardResponse('live', [finishedCard], DEFAULT_SETTINGS);

    const notifs = detectNotifications(prevBoard, nextBoard);
    expect(notifs).toHaveLength(1);
    expect(notifs[0].kind).toBe('run_finished');
    expect(notifs[0].conversationId).toBe('c1');
  });
});
