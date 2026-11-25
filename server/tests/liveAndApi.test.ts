import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  ArtifactContentResponse,
  BoardResponse,
  ConversationDetail,
  HealthResponse,
  ReviewBatchResponse,
  SearchResponse,
} from '../../shared/types.js';
import { createApp } from '../src/api/createApp.js';
import { LiveBoardService } from '../src/engine/boardService.js';
import { DemoBoardService } from '../src/engine/demoService.js';

interface TestServerHandle {
  baseUrl: string;
  close: () => Promise<void>;
}

async function startTestServer(service: LiveBoardService | DemoBoardService): Promise<TestServerHandle> {
  const { app, sseBroker } = createApp(service, { staticDir: null });
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: async () => {
      sseBroker.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      service.close();
    },
  };
}

function createSyntheticAntigravityFixture(rootDir: string): void {
  fs.mkdirSync(path.join(rootDir, 'annotations'), { recursive: true });
  fs.mkdirSync(path.join(rootDir, 'brain', 'conv-running', '.system_generated', 'logs'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(rootDir, 'brain', 'conv-running', '.system_generated', 'swarm'), {
    recursive: true,
  });
  fs.mkdirSync(path.join(rootDir, 'brain', 'conv-attention', '.system_generated', 'logs'), {
    recursive: true,
  });

  const db = new DatabaseSync(path.join(rootDir, 'conversation_summaries.db'));
  try {
    db.exec(`
      CREATE TABLE conversation_summaries (
        conversation_id TEXT PRIMARY KEY,
        title TEXT NOT NULL DEFAULT '',
        preview TEXT NOT NULL DEFAULT '',
        step_count INTEGER NOT NULL DEFAULT 0,
        last_modified_time DATETIME NOT NULL,
        workspace_uris TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL DEFAULT '',
        project_id TEXT NOT NULL DEFAULT '',
        agent_name TEXT NOT NULL DEFAULT '',
        parent_conversation_id TEXT NOT NULL DEFAULT '',
        nesting_depth INTEGER NOT NULL DEFAULT 0,
        not_fully_idle NUMERIC NOT NULL DEFAULT 0,
        killed NUMERIC NOT NULL DEFAULT 0,
        last_user_input_time DATETIME NOT NULL,
        last_user_input_step_index INTEGER NOT NULL DEFAULT -1,
        group_id TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE conversation_parents (
        conversation_id TEXT PRIMARY KEY,
        parent_id TEXT NOT NULL
      ) WITHOUT ROWID;
    `);

    let hasFts5 = false;
    try {
      db.exec(`
        CREATE VIRTUAL TABLE conversations_fts USING fts5(
          conversation_id UNINDEXED,
          chunk_index UNINDEXED,
          last_modified_time UNINDEXED,
          archived UNINDEXED,
          title,
          workspace,
          project,
          user_body,
          agent_body
        );
      `);
      hasFts5 = true;
    } catch {
      // Mirror Antigravity's real FTS5 shadow content table layout (c0..c14)
      db.exec(`
        CREATE TABLE conversations_fts_content (
          id INTEGER PRIMARY KEY,
          c0, c1, c2, c3, c4, c5, c6, c7, c8, c9, c10, c11, c12, c13, c14
        );
      `);
    }

    const nowGo = new Date().toISOString().replace('T', ' ').replace('Z', '0000+00:00');
    const fiveMinAgoGo = new Date(Date.now() - 5 * 60_000)
      .toISOString()
      .replace('T', ' ')
      .replace('Z', '0000+00:00');

    const insertSummary = db.prepare(`
      INSERT INTO conversation_summaries (
        conversation_id, title, preview, step_count, last_modified_time, workspace_uris,
        status, project_id, agent_name, parent_conversation_id, nesting_depth,
        not_fully_idle, killed, last_user_input_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Root 1: Running with Swarm worker
    insertSummary.run(
      'conv-running',
      'Build GraphQL Gateway',
      'Coordinating schema federation and auth middleware.',
      18,
      nowGo,
      '["file:///d%3A/repos/gateway-service"]',
      'CASCADE_RUN_STATUS_RUNNING',
      'proj-gw',
      '',
      '',
      0,
      1,
      0,
      fiveMinAgoGo,
    );

    // Worker child of conv-running
    insertSummary.run(
      'conv-worker-1',
      'Schema Worker',
      'Stitching federated subgraphs',
      6,
      nowGo,
      '["file:///d%3A/repos/gateway-service"]',
      'CASCADE_RUN_STATUS_RUNNING',
      'proj-gw',
      'schema-worker',
      'conv-running',
      1,
      0,
      0,
      fiveMinAgoGo,
    );

    // Root 2: Idle with unread update + feedback artifact
    insertSummary.run(
      'conv-attention',
      'Review Auth Migration Plan',
      'Implementation plan drafted and awaiting approval.',
      12,
      fiveMinAgoGo,
      '["file:///d%3A/repos/gateway-service"]',
      'CASCADE_RUN_STATUS_IDLE',
      'proj-gw',
      '',
      '',
      0,
      0,
      0,
      fiveMinAgoGo,
    );

    // Multi-chunk FTS rows with 64-bit nanosecond timestamps (should deduplicate cleanly!)
    if (hasFts5) {
      const insertFts = db.prepare(`
        INSERT INTO conversations_fts (
          conversation_id, chunk_index, last_modified_time, archived, title, workspace, project, user_body, agent_body
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertFts.run(
        'conv-running',
        0,
        1793500053540332900n,
        0,
        'Build GraphQL Gateway',
        'gateway-service',
        'Gateway Platform',
        'Set up Apollo federation',
        'Created schema registry client',
      );
      insertFts.run(
        'conv-running',
        1,
        1793500053540332900n,
        0,
        'Build GraphQL Gateway',
        'gateway-service',
        'Gateway Platform',
        'Add rate limiter',
        'Added Redis token bucket limiter',
      );
      insertFts.run(
        'conv-attention',
        0,
        1793500053540332900n,
        0,
        'Review Auth Migration Plan',
        'gateway-service',
        'Gateway Platform',
        'Migrate JWT signing keys',
        'Prepared rotation plan artifact',
      );
    } else {
      const insertShadow = db.prepare(`
        INSERT INTO conversations_fts_content (
          c0, c1, c4, c7, c10, c11, c12, c13, c14
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insertShadow.run(
        'conv-running',
        0,
        1793500053540332900n,
        0,
        'Build GraphQL Gateway',
        'gateway-service',
        'Gateway Platform',
        'Set up Apollo federation',
        'Created schema registry client',
      );
      insertShadow.run(
        'conv-running',
        1,
        1793500053540332900n,
        0,
        'Build GraphQL Gateway',
        'gateway-service',
        'Gateway Platform',
        'Add rate limiter',
        'Added Redis token bucket limiter',
      );
      insertShadow.run(
        'conv-attention',
        0,
        1793500053540332900n,
        0,
        'Review Auth Migration Plan',
        'gateway-service',
        'Gateway Platform',
        'Migrate JWT signing keys',
        'Prepared rotation plan artifact',
      );
    }
  } finally {
    db.close();
  }

  // Annotation pbtxt for conv-attention (marked_as_unread + older view time)
  const tenMinAgoSec = Math.floor((Date.now() - 10 * 60_000) / 1000);
  fs.writeFileSync(
    path.join(rootDir, 'annotations', 'conv-attention.pbtxt'),
    `last_user_view_time:{seconds:${tenMinAgoSec} nanos:0} marked_as_unread:true title:"Review Auth Migration Plan"`,
    'utf8',
  );

  // Artifact + metadata for conv-attention
  fs.writeFileSync(
    path.join(rootDir, 'brain', 'conv-attention', 'plan.md'),
    '# Auth Rotation Plan\n\nRotate JWKS keys cleanly with dual validation.',
    'utf8',
  );
  fs.writeFileSync(
    path.join(rootDir, 'brain', 'conv-attention', 'plan.md.metadata.json'),
    JSON.stringify({
      summary: 'JWKS dual-key rotation plan',
      updatedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
      userFacing: true,
      requestFeedback: true,
    }),
    'utf8',
  );

  // Swarm metadata for conv-running
  const swarmDir = path.join(rootDir, 'brain', 'conv-running', '.system_generated', 'swarm');
  fs.writeFileSync(
    path.join(swarmDir, 'swarm.json'),
    JSON.stringify({
      version: 1,
      backend: 'local',
      swarm_id: 'swarm-gw',
      created_at: new Date().toISOString(),
    }),
  );
  fs.writeFileSync(
    path.join(swarmDir, 'members.json'),
    JSON.stringify({
      title: 'Gateway Federation Swarm',
      members: {
        coordinator: {
          conversation_id: 'conv-running',
          role: 'coordinator',
          phase: 'RUNNING',
          desired_state: 'RUNNING',
          wake_mode: 'mentions',
          model: 'claude-sonnet-4-5',
          killed: false,
        },
        'schema-worker': {
          conversation_id: 'conv-worker-1',
          role: 'worker',
          phase: 'RUNNING',
          desired_state: 'RUNNING',
          wake_mode: 'working',
          model: 'gemini-2.5-pro',
          killed: false,
        },
      },
    }),
  );
  fs.writeFileSync(
    path.join(swarmDir, 'plan.json'),
    JSON.stringify({
      goal: { title: 'Ship federated GraphQL gateway', line: 'Schema + auth in parallel' },
      tasks: { 'schema-worker': 'Stitch subgraphs' },
      threads: [{ id: 't1', title: 'Federation', goal: 'Compose schema', tasks: ['schema-worker'] }],
    }),
  );
  fs.writeFileSync(
    path.join(swarmDir, 'board.jsonl'),
    JSON.stringify({
      seq: 1,
      agent: 'coordinator',
      text: '@schema-worker Compose subgraphs',
      time: '2026-11-24 09:00:00',
      kind: 'brief',
    }) + '\n',
  );
}

describe('LiveBoardService & REST/SSE API integration', () => {
  const tempDirs: string[] = [];
  const servers: TestServerHandle[] = [];

  afterEach(async () => {
    for (const s of servers.splice(0)) {
      await s.close();
    }
    for (const d of tempDirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('hydrates synthetic Antigravity fixture read-only and serves REST, review, search, artifact security, and SSE', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-live-fixture-'));
    tempDirs.push(dir);
    createSyntheticAntigravityFixture(dir);

    const overlayDb = path.join(dir, 'overlay.db');
    const service = new LiveBoardService(dir, overlayDb);
    const srv = await startTestServer(service);
    servers.push(srv);

    // 1. Health
    const health = (await fetch(`${srv.baseUrl}/api/health`).then((r) => r.json())) as HealthResponse;
    expect(health.ok).toBe(true);
    expect(health.mode).toBe('live');
    expect(health.dbAccessible).toBe(true);
    expect(health.conversationCount).toBe(2);

    // 2. Board
    const board = (await fetch(`${srv.baseUrl}/api/board`).then((r) => r.json())) as BoardResponse;
    expect(board.conversations).toHaveLength(2);
    expect(board.stats.byLane.running).toBe(1);
    expect(board.stats.byLane.attention).toBe(1);
    expect(board.activeSwarms).toHaveLength(1);
    expect(board.activeSwarms[0].swarm.workingCount).toBe(2);

    const runningCard = board.conversations.find((c) => c.id === 'conv-running')!;
    expect(runningCard.project).toBe('Gateway Platform');
    expect(runningCard.workspace).toBe('gateway-service');
    expect(runningCard.subagentCount).toBe(1);

    // 3. Conversation detail
    const detail = (await fetch(`${srv.baseUrl}/api/conversations/conv-attention`).then((r) =>
      r.json(),
    )) as ConversationDetail;
    expect(detail.artifacts).toHaveLength(1);
    expect(detail.artifacts[0].requestFeedback).toBe(true);

    // 4. Artifact reading + strict path traversal guard
    const artRes = (await fetch(
      `${srv.baseUrl}/api/conversations/conv-attention/artifact?file=plan.md`,
    ).then((r) => r.json())) as ArtifactContentResponse;
    expect(artRes.content).toContain('Auth Rotation Plan');

    const traversal1 = await fetch(
      `${srv.baseUrl}/api/conversations/conv-attention/artifact?file=../overlay.db`,
    );
    expect(traversal1.status).toBe(400);

    const traversal2 = await fetch(
      `${srv.baseUrl}/api/conversations/conv-attention/artifact?file=.system_generated/logs/transcript.jsonl`,
    );
    expect(traversal2.status).toBe(400);

    // 5. Overlay patch validation + mutation
    const badPatch = await fetch(`${srv.baseUrl}/api/conversations/conv-attention/overlay`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualLane: 'invalid-lane' }),
    });
    expect(badPatch.status).toBe(400);

    const goodPatch = await fetch(`${srv.baseUrl}/api/conversations/conv-attention/overlay`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: 'p0', tags: ['auth'], notes: 'Check JWKS TTL' }),
    });
    expect(goodPatch.status).toBe(200);

    // 6. Search (FTS5 + overlay notes + special chars safety)
    const ftsSearch = (await fetch(`${srv.baseUrl}/api/search?q=Redis`).then((r) =>
      r.json(),
    )) as SearchResponse;
    expect(ftsSearch.results.map((r) => r.conversationId)).toContain('conv-running');

    const notesSearch = (await fetch(`${srv.baseUrl}/api/search?q=JWKS`).then((r) =>
      r.json(),
    )) as SearchResponse;
    expect(notesSearch.results.map((r) => r.conversationId)).toContain('conv-attention');

    const weirdSearch = await fetch(
      `${srv.baseUrl}/api/search?q=${encodeURIComponent('foo"bar (test): AND *')}`,
    );
    expect(weirdSearch.status).toBe(200);

    // 7. Review clears attention -> moves to active, and review-batch supports Undo (reviewedAt: null)
    const reviewRes = await fetch(`${srv.baseUrl}/api/conversations/conv-attention/review`, {
      method: 'POST',
    });
    expect(reviewRes.status).toBe(200);
    const reviewJson = (await reviewRes.json()) as { card: { lane: string; attentionReasons: string[] } };
    expect(reviewJson.card.lane).toBe('active');
    expect(reviewJson.card.attentionReasons).toEqual([]);

    // Batch undo restores attention lane
    const undoRes = await fetch(`${srv.baseUrl}/api/conversations/review-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['conv-attention'], reviewedAt: null }),
    });
    expect(undoRes.status).toBe(200);
    const undoJson = (await undoRes.json()) as ReviewBatchResponse;
    expect(undoJson.updatedCount).toBe(1);
    expect(undoJson.reviewedAt).toBeNull();
    expect(undoJson.cards[0].lane).toBe('attention');

    // Batch review re-clears attention
    const batchRes = await fetch(`${srv.baseUrl}/api/conversations/review-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['conv-attention', 'conv-attention'] }),
    });
    expect(batchRes.status).toBe(200);
    const batchJson = (await batchRes.json()) as ReviewBatchResponse;
    expect(batchJson.updatedCount).toBe(1);
    expect(batchJson.reviewedAt).toBeTruthy();
    expect(batchJson.cards[0].lane).toBe('active');

    // Batch review validation errors
    const emptyBatch = await fetch(`${srv.baseUrl}/api/conversations/review-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: [] }),
    });
    expect(emptyBatch.status).toBe(400);

    const tooManyBatch = await fetch(`${srv.baseUrl}/api/conversations/review-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from({ length: 201 }, (_, i) => `c-${i}`) }),
    });
    expect(tooManyBatch.status).toBe(400);

    const badIdBatch = await fetch(`${srv.baseUrl}/api/conversations/review-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['../bad-id'] }),
    });
    expect(badIdBatch.status).toBe(400);

    // 8. SSE stream pushes connected + initial board_update + mutation board_update
    const controller = new AbortController();
    const sseRes = await fetch(`${srv.baseUrl}/api/events`, { signal: controller.signal });
    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get('content-type')).toContain('text/event-stream');

    const reader = sseRes.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const receivedTypes: string[] = [];

    const readUntilCount = async (target: number) => {
      while (receivedTypes.length < target) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true });
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
        for (const frame of parts) {
          const line = frame.split('\n').find((l) => l.startsWith('data: '));
          if (line) {
            const parsed = JSON.parse(line.slice(6)) as { type: string };
            receivedTypes.push(parsed.type);
          }
        }
      }
    };

    await readUntilCount(2);
    expect(receivedTypes.slice(0, 2)).toEqual(['connected', 'board_update']);

    // Mutate settings -> SSE pushes a new board_update
    await fetch(`${srv.baseUrl}/api/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ staleAfterHours: 48 }),
    });
    await readUntilCount(3);
    expect(receivedTypes[2]).toBe('board_update');

    controller.abort();
  });
});

describe('DemoBoardService REST API', () => {
  const servers: TestServerHandle[] = [];

  afterEach(async () => {
    for (const s of servers.splice(0)) {
      await s.close();
    }
  });

  it('serves 14 fictional conversations across all 5 lanes, swarms, artifacts, and in-memory mutations', async () => {
    const service = new DemoBoardService();
    const srv = await startTestServer(service);
    servers.push(srv);

    const health = (await fetch(`${srv.baseUrl}/api/health`).then((r) => r.json())) as HealthResponse;
    expect(health.mode).toBe('demo');
    expect(health.conversationCount).toBe(14);

    const board = (await fetch(`${srv.baseUrl}/api/board`).then((r) => r.json())) as BoardResponse;
    expect(board.mode).toBe('demo');
    expect(board.conversations).toHaveLength(14);
    expect(board.stats.byLane.running).toBe(3);
    expect(board.stats.byLane.attention).toBe(4);
    expect(board.stats.byLane.active).toBe(3);
    expect(board.stats.byLane.stale).toBe(2);
    expect(board.stats.byLane.archived).toBe(2);
    expect(board.activeSwarms).toHaveLength(2);
    expect(board.workspaces.length).toBe(3);
    expect(board.tags.length).toBeGreaterThanOrEqual(8);
    expect(board.tags.length).toBeLessThanOrEqual(10);

    // Rich primary demo artifact contains checklist, table, and SQL/TS code fences
    const primaryArt = (await fetch(
      `${srv.baseUrl}/api/conversations/demo-01/artifact?file=webhook_migration_spec.md`,
    ).then((r) => r.json())) as ArtifactContentResponse;
    expect(primaryArt.content).toContain('- [x]');
    expect(primaryArt.content).toContain('```sql');
    expect(primaryArt.content).toContain('```ts');
    expect(primaryArt.content).toContain('| Event Type |');

    // Batch review all attention cards in demo mode + undo back to attention
    const attentionIds = board.conversations
      .filter((c) => c.lane === 'attention')
      .map((c) => c.id);
    expect(attentionIds).toHaveLength(4);

    const batchReview = (await fetch(`${srv.baseUrl}/api/conversations/review-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: attentionIds }),
    }).then((r) => r.json())) as ReviewBatchResponse;
    expect(batchReview.updatedCount).toBe(4);
    expect(batchReview.cards.every((c) => c.lane === 'active')).toBe(true);

    const batchUndo = (await fetch(`${srv.baseUrl}/api/conversations/review-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: attentionIds, reviewedAt: null }),
    }).then((r) => r.json())) as ReviewBatchResponse;
    expect(batchUndo.updatedCount).toBe(4);
    expect(batchUndo.reviewedAt).toBeNull();
    expect(batchUndo.cards.every((c) => c.lane === 'attention')).toBe(true);

    // Readable demo artifact
    const art = (await fetch(
      `${srv.baseUrl}/api/conversations/demo-04/artifact?file=implementation_plan.md`,
    ).then((r) => r.json())) as ArtifactContentResponse;
    expect(art.content).toContain('Zero-Downtime Partitioning');

    // Traversal rejected even in demo mode
    const badArt = await fetch(
      `${srv.baseUrl}/api/conversations/demo-04/artifact?file=../../package.json`,
    );
    expect(badArt.status).toBe(400);

    // In-memory drag-and-drop lane override works
    const moved = await fetch(`${srv.baseUrl}/api/conversations/demo-08/overlay`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualLane: 'attention', pinned: true }),
    });
    expect(moved.status).toBe(200);
    const movedJson = (await moved.json()) as {
      card: { lane: string; autoLane: string; isManualLane: boolean };
    };
    expect(movedJson.card.lane).toBe('attention');
    expect(movedJson.card.autoLane).toBe('active');
    expect(movedJson.card.isManualLane).toBe(true);

    // Move a stale card (demo-11) -> attention (gets manual_attention), review clears manualLane cleanly
    const staleToAttn = (await fetch(`${srv.baseUrl}/api/conversations/demo-11/overlay`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualLane: 'attention' }),
    }).then((r) => r.json())) as {
      card: { lane: string; autoLane: string; attentionReasons: string[]; overlay: { manualLane: string | null } };
    };
    expect(staleToAttn.card.lane).toBe('attention');
    expect(staleToAttn.card.autoLane).toBe('stale');
    expect(staleToAttn.card.attentionReasons).toEqual(['manual_attention']);

    // Mark reviewed clears manualLane === 'attention' so card cleanly exits attention
    const reviewedStale = (await fetch(`${srv.baseUrl}/api/conversations/demo-11/review`, {
      method: 'POST',
    }).then((r) => r.json())) as {
      card: { lane: string; attentionReasons: string[]; overlay: { manualLane: string | null } };
    };
    expect(reviewedStale.card.overlay.manualLane).toBeNull();
    expect(reviewedStale.card.lane).toBe('stale');
    expect(reviewedStale.card.attentionReasons).toEqual([]);

    // Restore via PATCH /overlay and verify review-batch + restoreManualLanes Undo
    await fetch(`${srv.baseUrl}/api/conversations/demo-11/overlay`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualLane: 'attention', reviewedAt: null }),
    });
    const batchClear = (await fetch(`${srv.baseUrl}/api/conversations/review-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: ['demo-11'] }),
    }).then((r) => r.json())) as ReviewBatchResponse;
    expect(batchClear.cards[0].lane).toBe('stale');
    expect(batchClear.cards[0].overlay.manualLane).toBeNull();

    const batchRestore = (await fetch(`${srv.baseUrl}/api/conversations/review-batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: ['demo-11'],
        reviewedAt: null,
        restoreManualLanes: { 'demo-11': 'attention' },
      }),
    }).then((r) => r.json())) as ReviewBatchResponse;
    expect(batchRestore.cards[0].lane).toBe('attention');
    expect(batchRestore.cards[0].attentionReasons).toEqual(['manual_attention']);

    // Move running card (demo-01) -> active while preserving isRunning, then reset to auto
    const runMoved = (await fetch(`${srv.baseUrl}/api/conversations/demo-01/overlay`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ manualLane: 'active' }),
    }).then((r) => r.json())) as {
      card: { lane: string; autoLane: string; isRunning: boolean };
    };
    expect(runMoved.card.lane).toBe('active');
    expect(runMoved.card.autoLane).toBe('running');
    expect(runMoved.card.isRunning).toBe(true);
  });
});
