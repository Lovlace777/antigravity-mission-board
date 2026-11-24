import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseTranscriptContent, parseTranscriptFile } from '../src/parsers/transcript.js';

describe('transcript parser', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('falls back to transcript_full.jsonl when update_steps is truncated in compact transcript.jsonl', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-transcript-test-'));
    tempDirs.push(dir);

    const compactLines = [
      JSON.stringify({
        step_index: 0,
        source: 'USER_EXPLICIT',
        type: 'USER_INPUT',
        status: 'DONE',
        created_at: '2026-11-24T00:10:00Z',
        content: 'Build the dashboard backend',
      }),
      JSON.stringify({
        step_index: 1,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: '2026-11-24T00:10:15Z',
        model: 'claude-sonnet-4-5',
        input_tokens: 1000,
        cache_read_tokens: 4000,
        output_tokens: 500,
        truncated_fields: ['tool_calls'],
        tool_calls: [
          {
            name: 'update_focus',
            args: { focus: 'Implementing read-only SQLite layer' },
          },
          {
            name: 'update_steps',
            // Truncated JSON string as observed in compact transcript.jsonl
            args: { steps: '[{"title":"Create shared types","status":"done"},{"title":"Build DB' },
          },
        ],
      }),
    ].join('\n');

    const fullLines = [
      JSON.stringify({
        step_index: 0,
        source: 'USER_EXPLICIT',
        type: 'USER_INPUT',
        status: 'DONE',
        created_at: '2026-11-24T00:10:00Z',
        content: 'Build the dashboard backend',
      }),
      JSON.stringify({
        step_index: 1,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: '2026-11-24T00:10:15Z',
        model: 'claude-sonnet-4-5',
        tool_calls: [
          {
            name: 'update_focus',
            args: { focus: 'Implementing read-only SQLite layer' },
          },
          {
            name: 'update_steps',
            args: {
              steps: [
                { title: 'Create shared types', status: 'done' },
                { title: 'Build DB reader', status: 'in_progress' },
                { title: 'Write unit tests', status: 'pending' },
              ],
            },
          },
        ],
      }),
    ].join('\n');

    const compactPath = path.join(dir, 'transcript.jsonl');
    const fullPath = path.join(dir, 'transcript_full.jsonl');
    fs.writeFileSync(compactPath, compactLines, 'utf8');
    fs.writeFileSync(fullPath, fullLines, 'utf8');

    const parsed = parseTranscriptFile(compactPath);

    expect(parsed.currentFocus).toBe('Implementing read-only SQLite layer');
    expect(parsed.steps).toEqual([
      { title: 'Create shared types', status: 'done' },
      { title: 'Build DB reader', status: 'in_progress' },
      { title: 'Write unit tests', status: 'pending' },
    ]);
    expect(parsed.models).toEqual(['claude-sonnet-4-5']);
    expect(parsed.tokens.inputTokens).toBe(1000);
    expect(parsed.tokens.cacheReadTokens).toBe(4000);
    expect(parsed.tokens.outputTokens).toBe(500);
    expect(parsed.tokens.totalTokens).toBe(5500);
    expect(parsed.tokens.cacheHitRate).toBe(0.8);
    expect(parsed.hasError).toBe(false);
    expect(parsed.hasPendingQuestion).toBe(false);
  });

  it('detects pending ask_question and clears it once user responds', () => {
    const waitingContent = [
      JSON.stringify({
        step_index: 1,
        source: 'MODEL',
        type: 'PLANNER_RESPONSE',
        status: 'DONE',
        created_at: '2026-11-24T00:20:00Z',
        tool_calls: [
          {
            name: 'ask_question',
            args: {
              questions: [{ question: 'Should we enable WAL mode?', options: ['Yes', 'No'] }],
            },
          },
        ],
      }),
    ].join('\n');

    const waiting = parseTranscriptContent(waitingContent);
    expect(waiting.hasPendingQuestion).toBe(true);
    expect(waiting.pendingQuestionText).toBe('Should we enable WAL mode?');

    const answeredContent =
      waitingContent +
      '\n' +
      JSON.stringify({
        step_index: 2,
        source: 'USER_EXPLICIT',
        type: 'USER_INPUT',
        status: 'DONE',
        created_at: '2026-11-24T00:21:00Z',
        content: 'Yes, enable WAL mode.',
      });

    const answered = parseTranscriptContent(answeredContent);
    expect(answered.hasPendingQuestion).toBe(false);
    expect(answered.pendingQuestionText).toBeNull();
  });

  it('detects ERROR_MESSAGE as last substantive turn and ignores trailing checkpoints', () => {
    const content = [
      JSON.stringify({
        step_index: 1,
        source: 'SYSTEM',
        type: 'ERROR_MESSAGE',
        status: 'ERROR',
        created_at: '2026-11-24T00:30:00Z',
        error: 'Command exited with code 137 (OOM)',
      }),
      JSON.stringify({
        step_index: 2,
        source: 'SYSTEM',
        type: 'CHECKPOINT',
        status: 'DONE',
        created_at: '2026-11-24T00:30:01Z',
      }),
    ].join('\n');

    const parsed = parseTranscriptContent(content);
    expect(parsed.hasError).toBe(true);
    expect(parsed.lastError).toBe('Command exited with code 137 (OOM)');
  });
});
