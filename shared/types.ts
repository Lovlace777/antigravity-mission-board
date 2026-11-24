/**
 * Shared API & Domain Types for Antigravity Mission Board
 * Pure TypeScript interfaces/types — imported by both `server/` and `web/`.
 */

export type LaneId = 'running' | 'attention' | 'active' | 'stale' | 'archived';

export type AttentionReason =
  | 'marked_as_unread'
  | 'unread_update'
  | 'needs_input'
  | 'request_feedback'
  | 'error'
  | 'follow_up_due';

export type Priority = 'p0' | 'p1' | 'p2' | null;

export type StepStatus = 'pending' | 'in_progress' | 'done' | 'skipped' | 'failed';

export interface StepItem {
  title: string;
  status: StepStatus;
}

export interface TokenUsage {
  inputTokens: number;
  cacheReadTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** Ratio in [0, 1]: cacheReadTokens / (inputTokens + cacheReadTokens), or 0 if denominator is 0. */
  cacheHitRate: number;
}

export interface OverlayData {
  conversationId: string;
  manualLane: LaneId | null;
  pinned: boolean;
  priority: Priority;
  tags: string[];
  notes: string;
  /** ISO timestamp or YYYY-MM-DD reminder date */
  followUpAt: string | null;
  /** ISO timestamp marking when the user last reviewed this conversation on the Mission Board */
  reviewedAt: string | null;
  updatedAt: string | null;
}

export interface OverlayPatch {
  manualLane?: LaneId | null;
  pinned?: boolean;
  priority?: Priority;
  tags?: string[];
  notes?: string;
  followUpAt?: string | null;
  reviewedAt?: string | null;
}

export type SwarmMemberState = 'working' | 'waiting' | 'killed' | 'stopped';

export interface SwarmMemberInfo {
  name: string;
  conversationId: string;
  role: 'coordinator' | 'worker';
  state: SwarmMemberState;
  phase: string;
  desiredState: string;
  wakeMode: string;
  workspaceMode: string;
  model: string;
  killed: boolean;
  task: string | null;
  lastReadSeq: number;
  waitSince: number;
  isRunning: boolean;
}

export interface SwarmThreadInfo {
  id: string;
  title: string;
  goal: string;
  tasks: string[];
}

export interface SwarmBoardMessage {
  seq: number;
  agent: string;
  text: string;
  time: string;
  kind?: string;
}

export interface SwarmSummary {
  swarmId: string;
  title: string;
  createdAt: string | null;
  goalTitle: string | null;
  goalLine: string | null;
  threads: SwarmThreadInfo[];
  members: SwarmMemberInfo[];
  workingCount: number;
  waitingCount: number;
  killedCount: number;
  totalMembers: number;
  messageCount: number;
  recentMessages: SwarmBoardMessage[];
}

export interface SwarmDetail extends SwarmSummary {
  tasks: Record<string, string>;
  messages: SwarmBoardMessage[];
}

export interface SubagentPreview {
  conversationId: string;
  typeName: string;
  role: string;
  state: 'alive' | 'killed' | 'idle';
  isRunning: boolean;
  title: string;
}

export interface SubagentInfo {
  conversationId: string;
  parentConversationId: string;
  title: string;
  typeName: string;
  role: string;
  state: 'alive' | 'killed' | 'idle';
  isRunning: boolean;
  stepCount: number;
  lastModifiedAt: string;
  spawnStepIndex: number | null;
  nestingDepth: number;
  children: SubagentInfo[];
}

export interface ArtifactInfo {
  fileName: string;
  /** Path relative to the conversation's brain directory (forward-slash normalized). */
  relativePath: string;
  summary: string;
  updatedAt: string | null;
  userFacing: boolean;
  requestFeedback: boolean;
  sizeBytes: number;
}

export interface TimelineTurn {
  stepIndex: number;
  source: string;
  type: string;
  status: string;
  createdAt: string | null;
  text: string;
  thinkingSummary?: string;
  toolNames: string[];
  model?: string;
  errorMessage?: string;
}

export interface ConversationCard {
  id: string;
  title: string;
  preview: string;
  project: string;
  projectId: string;
  /** Folder basename of primary workspace (e.g. "my-repo") */
  workspace: string;
  /** Decoded local filesystem path of primary workspace */
  workspacePath: string;
  workspaceUris: string[];

  /** Effective Kanban lane: overlay.manualLane ?? autoLane */
  lane: LaneId;
  /** Automatically inferred lane ignoring manualLane override */
  autoLane: LaneId;
  isManualLane: boolean;
  /** True if currently executing (even when manually placed in another lane) */
  isRunning: boolean;
  isArchived: boolean;
  status: string;
  notFullyIdle: boolean;
  attentionReasons: AttentionReason[];

  currentFocus: string | null;
  steps: StepItem[];
  stepsCompleted: number;
  stepsTotal: number;
  stepCount: number;

  /** ISO 8601 UTC timestamp */
  lastModifiedAt: string;
  lastUserInputAt: string | null;
  lastUserViewAt: string | null;
  markedAsUnread: boolean;
  planExecute: boolean;
  hasError: boolean;
  hasPendingQuestion: boolean;
  pendingFeedbackCount: number;

  models: string[];
  tokens: TokenUsage;

  swarm: SwarmSummary | null;
  subagentCount: number;
  activeSubagentCount: number;
  subagentsPreview: SubagentPreview[];
  artifactCount: number;
  sideQuestionCount: number;

  overlay: OverlayData;
}

export interface ConversationDetail extends ConversationCard {
  swarmDetail: SwarmDetail | null;
  subagents: SubagentInfo[];
  artifacts: ArtifactInfo[];
  timeline: TimelineTurn[];
  sideQuestions: Array<{ id: string; title: string }>;
  lastError: string | null;
  pendingQuestionText: string | null;
}

export interface BoardStats {
  total: number;
  byLane: Record<LaneId, number>;
  runningCount: number;
  attentionCount: number;
  staleCount: number;
  archivedCount: number;
  activeSwarmCount: number;
  activeAgentCount: number;
  tokens: TokenUsage;
}

export interface BoardSettings {
  staleAfterHours: number;
  pollIntervalMs: number;
}

export interface WorkspaceSummary {
  name: string;
  path: string;
  count: number;
}

export interface ActiveSwarmEntry {
  conversationId: string;
  conversationTitle: string;
  workspace: string;
  swarm: SwarmSummary;
}

export interface BoardResponse {
  mode: 'live' | 'demo';
  generatedAt: string;
  snapshotHash: string;
  conversations: ConversationCard[];
  stats: BoardStats;
  workspaces: WorkspaceSummary[];
  projects: string[];
  tags: string[];
  settings: BoardSettings;
  activeSwarms: ActiveSwarmEntry[];
}

export type SearchMatchField =
  | 'title'
  | 'preview'
  | 'transcript'
  | 'notes'
  | 'tags'
  | 'workspace'
  | 'project';

export interface SearchResult {
  conversationId: string;
  matchedIn: SearchMatchField[];
  snippet: string;
  card: ConversationCard;
}

export interface SearchResponse {
  query: string;
  total: number;
  results: SearchResult[];
}

export interface HealthResponse {
  ok: boolean;
  mode: 'live' | 'demo';
  version: string;
  dataDir: string;
  dataDirAccessible: boolean;
  dbAccessible: boolean;
  conversationCount: number;
  uptimeSec: number;
}

export interface ArtifactContentResponse {
  conversationId: string;
  fileName: string;
  relativePath: string;
  content: string;
  truncated: boolean;
  sizeBytes: number;
  metadata: ArtifactInfo | null;
}

export type NotificationKind =
  | 'run_finished'
  | 'needs_attention'
  | 'needs_input'
  | 'error'
  | 'feedback_requested';

export interface BoardNotification {
  id: string;
  kind: NotificationKind;
  conversationId: string;
  title: string;
  workspace: string;
  message: string;
  timestamp: string;
}

export type SseEvent =
  | { type: 'connected'; mode: 'live' | 'demo'; timestamp: string }
  | { type: 'heartbeat'; timestamp: string }
  | { type: 'board_update'; board: BoardResponse }
  | { type: 'notification'; notification: BoardNotification };
