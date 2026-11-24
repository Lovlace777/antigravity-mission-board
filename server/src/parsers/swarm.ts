import fs from 'node:fs';
import path from 'node:path';
import type {
  SwarmBoardMessage,
  SwarmDetail,
  SwarmMemberInfo,
  SwarmMemberState,
  SwarmSummary,
  SwarmThreadInfo,
} from '../../../shared/types.js';
import { normalizeTimestamp } from '../utils/time.js';

interface RawSwarmJson {
  version?: number;
  backend?: string;
  swarm_id?: string;
  created_at?: string;
}

interface RawMemberEntry {
  conversation_id?: string;
  role?: string;
  desired_state?: string;
  phase?: string;
  wake_mode?: string;
  workspace_mode?: string;
  desired_model?: string;
  applied_model?: string;
  model?: string;
  wait_since?: number;
  last_read_seq?: number;
  killed?: boolean;
}

interface RawMembersJson {
  title?: string;
  members?: Record<string, RawMemberEntry>;
}

interface RawPlanJson {
  goal?: { title?: string; line?: string };
  tasks?: Record<string, string>;
  threads?: Array<{ id?: string; title?: string; goal?: string; tasks?: string[] }>;
}

interface RawBoardLine {
  seq?: number;
  agent?: string;
  text?: string;
  time?: string;
  kind?: string;
}

export interface MemberRuntimeLookup {
  status?: string;
  killed?: boolean;
}

const MAX_RECENT_MESSAGES = 6;
const MAX_DETAIL_MESSAGES = 200;

function readJsonSafe<T>(filePath: string): T | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

function readBoardMessages(boardPath: string): { totalCount: number; messages: SwarmBoardMessage[] } {
  let content: string;
  try {
    content = fs.readFileSync(boardPath, 'utf8');
  } catch {
    return { totalCount: 0, messages: [] };
  }

  const messages: SwarmBoardMessage[] = [];
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as RawBoardLine;
      if (typeof parsed.seq !== 'number' || typeof parsed.agent !== 'string') continue;
      messages.push({
        seq: parsed.seq,
        agent: parsed.agent,
        text: typeof parsed.text === 'string' ? parsed.text : '',
        time: typeof parsed.time === 'string' ? parsed.time : '',
        kind: typeof parsed.kind === 'string' ? parsed.kind : undefined,
      });
    } catch {
      continue;
    }
  }

  const totalCount = messages.length;
  return {
    totalCount,
    messages: totalCount > MAX_DETAIL_MESSAGES ? messages.slice(-MAX_DETAIL_MESSAGES) : messages,
  };
}

function classifyMemberState(
  entry: RawMemberEntry,
  runtime?: MemberRuntimeLookup,
): { state: SwarmMemberState; isRunning: boolean } {
  const isKilled =
    entry.killed === true ||
    entry.phase === 'KILLED' ||
    entry.desired_state === 'KILLED' ||
    runtime?.killed === true;

  if (isKilled) {
    return { state: 'killed', isRunning: false };
  }

  const isWorking =
    entry.wake_mode === 'working' || runtime?.status === 'CASCADE_RUN_STATUS_RUNNING';

  if (isWorking) {
    return { state: 'working', isRunning: true };
  }

  if (entry.phase === 'RUNNING' || entry.desired_state === 'RUNNING') {
    return { state: 'waiting', isRunning: false };
  }

  return { state: 'stopped', isRunning: false };
}

export function getSwarmFiles(swarmDir: string): string[] {
  return [
    path.join(swarmDir, 'swarm.json'),
    path.join(swarmDir, 'members.json'),
    path.join(swarmDir, 'plan.json'),
    path.join(swarmDir, 'board.jsonl'),
  ];
}

/**
 * Parse a `.system_generated/swarm/` directory into both `SwarmDetail` and `SwarmSummary`.
 * Cross-references live `conversation_summaries` rows via `runtimeByConversationId`
 * for accurate working/killed state.
 */
export function parseSwarmDirectory(
  swarmDir: string,
  runtimeByConversationId: Map<string, MemberRuntimeLookup>,
): SwarmDetail | null {
  const swarmJson = readJsonSafe<RawSwarmJson>(path.join(swarmDir, 'swarm.json'));
  const membersJson = readJsonSafe<RawMembersJson>(path.join(swarmDir, 'members.json'));

  if (!swarmJson && !membersJson) {
    return null;
  }

  const planJson = readJsonSafe<RawPlanJson>(path.join(swarmDir, 'plan.json'));
  const { totalCount: messageCount, messages } = readBoardMessages(
    path.join(swarmDir, 'board.jsonl'),
  );

  const tasks: Record<string, string> = {};
  if (planJson?.tasks && typeof planJson.tasks === 'object') {
    for (const [k, v] of Object.entries(planJson.tasks)) {
      if (typeof v === 'string') tasks[k] = v;
    }
  }

  const threads: SwarmThreadInfo[] = [];
  if (Array.isArray(planJson?.threads)) {
    for (const t of planJson.threads) {
      if (!t || typeof t !== 'object') continue;
      threads.push({
        id: typeof t.id === 'string' ? t.id : '',
        title: typeof t.title === 'string' ? t.title : '',
        goal: typeof t.goal === 'string' ? t.goal : '',
        tasks: Array.isArray(t.tasks) ? t.tasks.filter((x): x is string => typeof x === 'string') : [],
      });
    }
  }

  const members: SwarmMemberInfo[] = [];
  let workingCount = 0;
  let waitingCount = 0;
  let killedCount = 0;

  if (membersJson?.members && typeof membersJson.members === 'object') {
    for (const [name, raw] of Object.entries(membersJson.members)) {
      if (!raw || typeof raw !== 'object') continue;
      const convId = typeof raw.conversation_id === 'string' ? raw.conversation_id : '';
      const runtime = convId ? runtimeByConversationId.get(convId) : undefined;
      const { state, isRunning } = classifyMemberState(raw, runtime);

      if (state === 'working') workingCount += 1;
      else if (state === 'waiting') waitingCount += 1;
      else if (state === 'killed') killedCount += 1;

      const role: 'coordinator' | 'worker' =
        raw.role === 'coordinator' || name === 'coordinator' ? 'coordinator' : 'worker';

      members.push({
        name,
        conversationId: convId,
        role,
        state,
        phase: typeof raw.phase === 'string' ? raw.phase : '',
        desiredState: typeof raw.desired_state === 'string' ? raw.desired_state : '',
        wakeMode: typeof raw.wake_mode === 'string' ? raw.wake_mode : '',
        workspaceMode: typeof raw.workspace_mode === 'string' ? raw.workspace_mode : 'inherit',
        model: raw.applied_model || raw.model || raw.desired_model || '',
        killed: state === 'killed',
        task: tasks[name] ?? null,
        lastReadSeq: typeof raw.last_read_seq === 'number' ? raw.last_read_seq : 0,
        waitSince: typeof raw.wait_since === 'number' ? raw.wait_since : 0,
        isRunning,
      });
    }
  }

  // Sort members: coordinator first, then working, waiting, stopped, killed
  const stateRank: Record<SwarmMemberState, number> = {
    working: 0,
    waiting: 1,
    stopped: 2,
    killed: 3,
  };
  members.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'coordinator' ? -1 : 1;
    if (a.state !== b.state) return stateRank[a.state] - stateRank[b.state];
    return a.name.localeCompare(b.name);
  });

  const recentMessages = messages.slice(-MAX_RECENT_MESSAGES);

  return {
    swarmId: typeof swarmJson?.swarm_id === 'string' ? swarmJson.swarm_id : path.basename(path.dirname(path.dirname(swarmDir))),
    title:
      (typeof membersJson?.title === 'string' && membersJson.title.trim()) ||
      (typeof planJson?.goal?.title === 'string' && planJson.goal.title.trim()) ||
      'Swarm',
    createdAt: normalizeTimestamp(swarmJson?.created_at),
    goalTitle: typeof planJson?.goal?.title === 'string' ? planJson.goal.title : null,
    goalLine: typeof planJson?.goal?.line === 'string' ? planJson.goal.line : null,
    threads,
    members,
    workingCount,
    waitingCount,
    killedCount,
    totalMembers: members.length,
    messageCount,
    recentMessages,
    tasks,
    messages,
  };
}

export function toSwarmSummary(detail: SwarmDetail): SwarmSummary {
  return {
    swarmId: detail.swarmId,
    title: detail.title,
    createdAt: detail.createdAt,
    goalTitle: detail.goalTitle,
    goalLine: detail.goalLine,
    threads: detail.threads,
    members: detail.members,
    workingCount: detail.workingCount,
    waitingCount: detail.waitingCount,
    killedCount: detail.killedCount,
    totalMembers: detail.totalMembers,
    messageCount: detail.messageCount,
    recentMessages: detail.recentMessages,
  };
}
