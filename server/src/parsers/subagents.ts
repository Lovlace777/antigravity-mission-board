import fs from 'node:fs';
import path from 'node:path';
import type { SubagentInfo, SubagentPreview } from '../../../shared/types.js';
import { normalizeTimestamp } from '../utils/time.js';

export interface SubagentDescriptorMeta {
  conversationId: string;
  typeName: string;
  role: string;
  state: 'alive' | 'killed';
  spawnStepIndex: number | null;
}

export interface ChildSummaryRow {
  conversationId: string;
  parentConversationId: string;
  title: string;
  status: string;
  killed: boolean;
  stepCount: number;
  lastModifiedTime: string;
  nestingDepth: number;
  agentName: string;
}

interface RawSubagentFile {
  conversationId?: string;
  subagentDescriptor?: {
    typeName?: string;
    role?: string;
  };
  state?: string;
  spawnStepIndex?: number;
}

/**
 * Parse all JSON descriptor files inside `brain/<conversationId>/.system_generated/subagents/`.
 */
export function parseSubagentDescriptorsDir(subagentsDir: string): Map<string, SubagentDescriptorMeta> {
  const result = new Map<string, SubagentDescriptorMeta>();
  let entries: string[];
  try {
    entries = fs.readdirSync(subagentsDir);
  } catch {
    return result;
  }

  for (const name of entries) {
    if (!name.endsWith('.json')) continue;
    const fullPath = path.join(subagentsDir, name);
    try {
      const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as RawSubagentFile;
      const convId =
        typeof raw.conversationId === 'string' && raw.conversationId.trim()
          ? raw.conversationId.trim()
          : name.slice(0, -'.json'.length);
      const state: 'alive' | 'killed' =
        raw.state === 'SUBAGENT_STATE_KILLED' ? 'killed' : 'alive';
      result.set(convId, {
        conversationId: convId,
        typeName: raw.subagentDescriptor?.typeName?.trim() || 'subagent',
        role: raw.subagentDescriptor?.role?.trim() || '',
        state,
        spawnStepIndex: typeof raw.spawnStepIndex === 'number' ? raw.spawnStepIndex : null,
      });
    } catch {
      continue;
    }
  }

  return result;
}

/**
 * Recursively build a nested SubagentInfo tree rooted at `parentId`
 * from `conversation_summaries` child rows + `.system_generated/subagents/*.json` descriptors.
 */
export function buildSubagentTree(
  parentId: string,
  childrenByParent: Map<string, ChildSummaryRow[]>,
  descriptors: Map<string, SubagentDescriptorMeta>,
  visited = new Set<string>(),
): SubagentInfo[] {
  const directRows = childrenByParent.get(parentId) ?? [];
  const seenIds = new Set<string>();
  const nodes: SubagentInfo[] = [];

  for (const row of directRows) {
    if (visited.has(row.conversationId)) continue;
    visited.add(row.conversationId);
    seenIds.add(row.conversationId);

    const meta = descriptors.get(row.conversationId);
    const isRunning = row.status === 'CASCADE_RUN_STATUS_RUNNING' && !row.killed;
    const isKilled = row.killed || meta?.state === 'killed';
    const state: 'alive' | 'killed' | 'idle' = isKilled
      ? 'killed'
      : isRunning
        ? 'alive'
        : 'idle';

    const children = buildSubagentTree(
      row.conversationId,
      childrenByParent,
      descriptors,
      visited,
    );

    nodes.push({
      conversationId: row.conversationId,
      parentConversationId: parentId,
      title: row.title || row.agentName || meta?.typeName || 'Subagent',
      typeName: meta?.typeName || row.agentName || 'subagent',
      role: meta?.role || '',
      state,
      isRunning,
      stepCount: row.stepCount,
      lastModifiedAt: normalizeTimestamp(row.lastModifiedTime) ?? new Date(0).toISOString(),
      spawnStepIndex: meta?.spawnStepIndex ?? null,
      nestingDepth: row.nestingDepth,
      children,
    });
  }

  // Also include any descriptor whose conversation wasn't present in conversation_summaries
  if (visited.size === directRows.length) {
    for (const [convId, meta] of descriptors.entries()) {
      if (seenIds.has(convId) || visited.has(convId)) continue;
      visited.add(convId);
      nodes.push({
        conversationId: convId,
        parentConversationId: parentId,
        title: meta.typeName || 'Subagent',
        typeName: meta.typeName,
        role: meta.role,
        state: meta.state === 'killed' ? 'killed' : 'idle',
        isRunning: false,
        stepCount: 0,
        lastModifiedAt: new Date(0).toISOString(),
        spawnStepIndex: meta.spawnStepIndex,
        nestingDepth: 1,
        children: [],
      });
    }
  }

  nodes.sort((a, b) => {
    if (a.isRunning !== b.isRunning) return a.isRunning ? -1 : 1;
    return b.lastModifiedAt.localeCompare(a.lastModifiedAt);
  });

  return nodes;
}

export function summarizeSubagents(tree: SubagentInfo[]): {
  totalCount: number;
  activeCount: number;
  preview: SubagentPreview[];
} {
  let totalCount = 0;
  let activeCount = 0;
  const flat: SubagentPreview[] = [];

  const walk = (nodes: SubagentInfo[]) => {
    for (const node of nodes) {
      totalCount += 1;
      if (node.isRunning) activeCount += 1;
      flat.push({
        conversationId: node.conversationId,
        typeName: node.typeName,
        role: node.role,
        state: node.state,
        isRunning: node.isRunning,
        title: node.title,
      });
      if (node.children.length > 0) {
        walk(node.children);
      }
    }
  };

  walk(tree);

  // Running subagents first, limit preview to 6 for crisp cards
  flat.sort((a, b) => {
    if (a.isRunning !== b.isRunning) return a.isRunning ? -1 : 1;
    return 0;
  });

  return {
    totalCount,
    activeCount,
    preview: flat.slice(0, 6),
  };
}
