import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { afterEach, describe, expect, it } from 'vitest';
import type { BoardResponse, DispatchResponse, HealthResponse } from '../../shared/types.js';
import { LiveBoardService } from '../src/engine/boardService.js';
import { parseTranscriptFile } from '../src/parsers/transcript.js';
import { startMissionBoardServer, type MissionBoardServerHandle } from '../src/runtime.js';
import { FileStatCache } from '../src/utils/cache.js';

describe('v2.1.0 resource optimization, hover preview, runtime & dispatch', () => {
  const tempDirs: string[] = [];
  const handles: MissionBoardServerHandle[] = [];

  afterEach(async () => {
    for (const h of handles.splice(0)) {
      await h.close();
    }
    for (const d of tempDirs.splice(0)) {
      fs.rmSync(d, { recursive: true, force: true });
    }
  });

  it('enforces bounded LRU eviction and hit tracking in FileStatCache', () => {
    const cache = new FileStatCache<string>(3);
    cache.getOrComputeBySignature('a', '1', () => 'val-a');
    cache.getOrComputeBySignature('b', '1', () => 'val-b');
    cache.getOrComputeBySignature('c', '1', () => 'val-c');

    // Promote 'a' to MRU via cache hit
    expect(cache.getOrComputeBySignature('a', '1', () => 'recomputed')).toBe('val-a');
    expect(cache.hits).toBe(1);

    // Adding 'd' should evict 'b' (the true LRU), NOT 'a'
    cache.getOrComputeBySignature('d', '1', () => 'val-d');
    expect(cache.size).toBe(3);

    let recomputedA = false;
    let recomputedB = false;
    cache.getOrComputeBySignature('a', '1', () => {
      recomputedA = true;
      return 'new-a';
    });
    cache.getOrComputeBySignature('b', '1', () => {
      recomputedB = true;
      return 'new-b';
    });
    expect(recomputedA).toBe(false);
    expect(recomputedB).toBe(true);
  });

  it('uses low-RAM tail-read for huge transcripts (>256 KB) while preserving full token counts and latestMessagePreview', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-tail-test-'));
    tempDirs.push(dir);
    const transcriptPath = path.join(dir, 'transcript.jsonl');

    const lines: string[] = [];
    const padding = 'x'.repeat(2000);
    // ~170 prefix lines (~350 KB total) each carrying known token counts
    for (let i = 0; i < 170; i++) {
      lines.push(
        JSON.stringify({
          step_index: i,
          source: 'MODEL',
          type: 'PLANNER_RESPONSE',
          status: 'DONE',
          model: 'claude-sonnet-4-5',
          input_tokens: 100,
          cache_read_tokens: 400,
          output_tokens: 50,
          content: `Prefix step ${i} ${padding}`,
        }),
      );
    }

    // Final tail step with focus, update_steps, and latest response
    lines.push(
      JSON.stringify({
        step_index: 170,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        model: 'gemini-2.5-pro',
        input_tokens: 200,
        cache_read_tokens: 800,
        output_tokens: 100,
        content: 'Finished migrating **billing** handlers and all unit tests are passing.',
        tool_calls: [
          { name: 'update_focus', args: { focus: 'Finalizing replay verification' } },
          {
            name: 'update_steps',
            args: {
              steps: [
                { title: 'Step A', status: 'done' },
                { title: 'Step B', status: 'in_progress' },
              ],
            },
          },
        ],
      }),
    );

    fs.writeFileSync(transcriptPath, lines.join('\n'), 'utf8');
    expect(fs.statSync(transcriptPath).size).toBeGreaterThan(256 * 1024);

    const summary = parseTranscriptFile(transcriptPath, { tailOnly: true });
    expect(summary.timeline).toHaveLength(0); // omitted in board summary mode to save RAM
    expect(summary.currentFocus).toBe('Finalizing replay verification');
    expect(summary.steps).toHaveLength(2);
    expect(summary.latestMessagePreview).toContain('Finished migrating billing handlers');
    expect(summary.tokens.inputTokens).toBe(170 * 100 + 200);
    expect(summary.tokens.cacheReadTokens).toBe(170 * 400 + 800);
    expect(summary.tokens.outputTokens).toBe(170 * 50 + 100);
    expect(summary.models).toContain('claude-sonnet-4-5');
    expect(summary.models).toContain('gemini-2.5-pro');

    // Full detail parse still builds timeline
    const full = parseTranscriptFile(transcriptPath, { tailOnly: false });
    expect(full.timeline.length).toBeGreaterThan(0);
  });

  it('skips SQLite via stat-fingerprint fast path when idle and lazily skips archived transcripts on board polls', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-fastpath-test-'));
    tempDirs.push(dir);
    fs.mkdirSync(path.join(dir, 'annotations'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'brain', 'conv-active', '.system_generated', 'logs'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(dir, 'brain', 'conv-archived', '.system_generated', 'logs'), {
      recursive: true,
    });

    const db = new DatabaseSync(path.join(dir, 'conversation_summaries.db'));
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
      `);

      const nowGo = new Date().toISOString().replace('T', ' ').replace('Z', '0000+00:00');
      const ins = db.prepare(`
        INSERT INTO conversation_summaries (
          conversation_id, title, preview, step_count, last_modified_time, workspace_uris,
          status, last_user_input_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      ins.run(
        'conv-active',
        'Active Workstream',
        'Working on caching',
        10,
        nowGo,
        '["file:///workspace/app"]',
        'CASCADE_RUN_STATUS_IDLE',
        nowGo,
      );
      ins.run(
        'conv-archived',
        'Archived Workstream',
        'Historical archived summary',
        15,
        nowGo,
        '["file:///workspace/app"]',
        'CASCADE_RUN_STATUS_IDLE',
        nowGo,
      );
    } finally {
      db.close();
    }

    fs.writeFileSync(
      path.join(dir, 'annotations', 'conv-archived.pbtxt'),
      'archived:true title:"Archived Workstream"',
      'utf8',
    );
    fs.writeFileSync(
      path.join(dir, 'brain', 'conv-archived', '.system_generated', 'logs', 'transcript.jsonl'),
      JSON.stringify({
        step_index: 1,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        input_tokens: 999,
        output_tokens: 111,
        content: 'Deep archived transcript message',
        tool_calls: [
          { name: 'update_steps', args: { steps: [{ title: 'Done archived step', status: 'done' }] } },
        ],
      }),
      'utf8',
    );

    const svc = new LiveBoardService(dir, path.join(dir, 'overlay.db'));
    try {
      const b1 = svc.getBoard();
      const archivedCard = b1.conversations.find((c) => c.id === 'conv-archived')!;
      expect(archivedCard.isArchived).toBe(true);
      // Lazy skip on board poll: archived transcript was NOT parsed
      expect(archivedCard.stepsTotal).toBe(0);
      expect(archivedCard.tokens.totalTokens).toBe(0);

      // Detail endpoint lazily parses archived transcript on demand
      const detail = svc.getConversationDetail('conv-archived')!;
      expect(detail.stepsTotal).toBe(1);
      expect(detail.tokens.totalTokens).toBe(1110);

      // Consecutive unchanged getBoard() calls hit the <0.1ms stat-fingerprint fast path
      const b2 = svc.getBoard();
      const b3 = svc.getBoard();
      expect(b2.snapshotHash).toBe(b1.snapshotHash);
      expect(b3.snapshotHash).toBe(b1.snapshotHash);
      const m1 = svc.getMetrics();
      expect(m1.pollCount).toBe(3);
      expect(m1.skippedIdlePolls).toBe(2);

      // Overlay mutation invalidates fingerprint cleanly
      svc.patchOverlay('conv-active', { pinned: true });
      const b4 = svc.getBoard();
      expect(b4.conversations.find((c) => c.id === 'conv-active')?.overlay.pinned).toBe(true);
      expect(svc.getMetrics().skippedIdlePolls).toBe(2);
    } finally {
      svc.close();
    }
  });

  it('starts in-process via startMissionBoardServer(), serves hover previews & dispatch API, and tracks runtime metrics', async () => {
    const handle = await startMissionBoardServer({
      port: 0,
      host: '127.0.0.1',
      demoMode: true,
      staticDir: null,
      silent: true,
    });
    handles.push(handle);

    expect(handle.port).toBeGreaterThan(0);

    // Health reports v2.3.0 + dispatchCapabilities
    const health = (await fetch(`${handle.url}/api/health`).then((r) => r.json())) as HealthResponse;
    expect(health.ok).toBe(true);
    expect(health.version).toBe('2.3.0');
    expect(health.dispatchCapabilities).toEqual({
      agyCliAvailable: false,
      protocolSchemeAvailable: false,
      mode: 'handoff',
    });

    // Board cards include rich zero-latency hover preview fields
    const board = (await fetch(`${handle.url}/api/board`).then((r) => r.json())) as BoardResponse;
    const swarmCard = board.conversations.find((c) => c.id === 'demo-01')!;
    expect(swarmCard.latestMessagePreview).toBeTruthy();
    expect(swarmCard.stepsPreview.length).toBeGreaterThan(0);
    expect(swarmCard.swarmPreview).not.toBeNull();
    expect(swarmCard.swarmPreview?.workingAgents).toContain('api-migrator');
    expect(swarmCard.swarmPreview?.latestPost?.agent).toBe('api-migrator');

    const feedbackCard = board.conversations.find((c) => c.id === 'demo-04')!;
    expect(feedbackCard.feedbackArtifacts).toEqual(['implementation_plan.md']);

    // Second board fetch hits fast cache -> skippedIdlePolls increments
    await fetch(`${handle.url}/api/board`);
    handle.setIdleMode(true);
    handle.setIdleMode(false);
    const metrics = handle.getRuntimeMetrics();
    expect(metrics.memoryRssMb).toBeGreaterThan(0);
    expect(metrics.pollCount).toBe(2);
    expect(metrics.skippedIdlePolls).toBe(1);
    expect(metrics.sseClients).toBe(0);

    // POST /api/conversations/:id/dispatch (valid + saveToNotes + 400 + 404)
    const dispatchRes = (await fetch(`${handle.url}/api/conversations/demo-01/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Continue verifying replay fixtures', saveToNotes: true }),
    }).then((r) => r.json())) as DispatchResponse;

    expect(dispatchRes.ok).toBe(true);
    expect(dispatchRes.mode).toBe('handoff');
    expect(dispatchRes.copiedPrompt).toBe('Continue verifying replay fixtures');
    expect(dispatchRes.noteSaved).toBe(true);
    expect(dispatchRes.card?.overlay.notes).toContain('Continue verifying replay fixtures');

    const badDispatch = await fetch(`${handle.url}/api/conversations/demo-01/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: '   ' }),
    });
    expect(badDispatch.status).toBe(400);

    const missingDispatch = await fetch(`${handle.url}/api/conversations/nonexistent/dispatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: 'Hello' }),
    });
    expect(missingDispatch.status).toBe(404);
  });
});
