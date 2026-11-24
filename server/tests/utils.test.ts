import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildSafeFts5Query, parseFts5ShadowColumns } from '../src/db/antigravityDb.js';
import {
  MAX_ARTIFACT_BYTES,
  readBoundedTextFile,
  resolveSafeArtifactPath,
} from '../src/utils/pathSafety.js';
import { normalizeTimestamp, protoTimestampToIso } from '../src/utils/time.js';
import { decodeFileUri, parseWorkspaceUris } from '../src/utils/uri.js';

describe('timestamp utilities', () => {
  it('normalizes Go-style 7-digit fractional timestamps to ISO UTC', () => {
    expect(normalizeTimestamp('2026-11-24 00:47:21.1068159+00:00')).toBe(
      '2026-11-24T00:47:21.106Z',
    );
    expect(normalizeTimestamp('2026-11-24 08:47:21.5+08:00')).toBe(
      '2026-11-24T00:47:21.500Z',
    );
    expect(normalizeTimestamp('2026-11-24T00:47:21Z')).toBe('2026-11-24T00:47:21.000Z');
  });

  it('returns null for Go zero-value and invalid timestamps', () => {
    expect(normalizeTimestamp('0001-01-01 00:00:00+00:00')).toBeNull();
    expect(normalizeTimestamp('')).toBeNull();
    expect(normalizeTimestamp('not-a-date')).toBeNull();
    expect(protoTimestampToIso(0, 0)).toBeNull();
  });
});

describe('URI & workspace parsing utilities', () => {
  it('decodes Windows percent-encoded and Unicode file URIs', () => {
    expect(decodeFileUri('file:///d%3A/projects/mission%20board')).toBe(
      'D:/projects/mission board',
    );
    expect(decodeFileUri('file:///C%3A/Users/%E7%94%A8%E6%88%B7/work')).toBe(
      'C:/Users/用户/work',
    );
    expect(decodeFileUri('file:///Users/alice/dev/aurora-cloud')).toBe(
      '/Users/alice/dev/aurora-cloud',
    );
  });

  it('parses JSON array workspace_uris and extracts basename', () => {
    const parsed = parseWorkspaceUris('["file:///d%3A/projects/aurora-cloud"]');
    expect(parsed.primaryPath).toBe('D:/projects/aurora-cloud');
    expect(parsed.basename).toBe('aurora-cloud');
    expect(parsed.uris).toEqual(['file:///d%3A/projects/aurora-cloud']);
  });

  it('falls back cleanly on empty or malformed workspace_uris', () => {
    const parsed = parseWorkspaceUris('not-json', 'fallback-repo');
    expect(parsed.primaryPath).toBe('');
    expect(parsed.basename).toBe('fallback-repo');
  });
});

describe('FTS5 query sanitizer & shadow column mapper', () => {
  it('sanitizes special syntax characters and boolean operators safely', () => {
    expect(buildSafeFts5Query('stripe "webhook" (v2): AND OR')).toBe(
      '"stripe"* AND "webhook"* AND "v2"*',
    );
    expect(buildSafeFts5Query('   *** ""  ')).toBeNull();
  });

  it('extracts shadow table column indices from Antigravity FTS5 DDL', () => {
    const ddl = `CREATE VIRTUAL TABLE conversations_fts USING fts5(
      conversation_id UNINDEXED,
      chunk_index UNINDEXED,
      chunk_first_step UNINDEXED,
      chunk_last_step UNINDEXED,
      last_modified_time UNINDEXED,
      step_count UNINDEXED,
      last_step_created_at UNINDEXED,
      archived UNINDEXED,
      user_step_byte_offsets UNINDEXED,
      agent_step_byte_offsets UNINDEXED,
      title,
      workspace,
      project,
      user_body,
      agent_body,
      tokenize = 'unicode61 remove_diacritics 2',
      prefix = '1 2 3'
    )`;

    expect(parseFts5ShadowColumns(ddl)).toEqual({
      conversationId: 'c0',
      archived: 'c7',
      title: 'c10',
      workspace: 'c11',
      project: 'c12',
      userBody: 'c13',
      agentBody: 'c14',
    });
  });
});

describe('artifact path traversal safety', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('allows valid files inside brain dir and rejects traversal attempts', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-path-test-'));
    tempDirs.push(base);

    const brainDir = path.join(base, 'brain-conv-1');
    fs.mkdirSync(path.join(brainDir, 'reports'), { recursive: true });
    fs.mkdirSync(path.join(brainDir, '.system_generated', 'logs'), { recursive: true });

    const validFile = path.join(brainDir, 'implementation_plan.md');
    const nestedValid = path.join(brainDir, 'reports', 'summary.md');
    const secretOutside = path.join(base, 'secret.txt');
    const internalLog = path.join(brainDir, '.system_generated', 'logs', 'transcript.jsonl');

    fs.writeFileSync(validFile, '# Plan\nHello world', 'utf8');
    fs.writeFileSync(nestedValid, '# Nested', 'utf8');
    fs.writeFileSync(secretOutside, 'TOP SECRET', 'utf8');
    fs.writeFileSync(internalLog, '{}', 'utf8');

    expect(resolveSafeArtifactPath(brainDir, 'implementation_plan.md')).toBe(
      fs.realpathSync(validFile),
    );
    expect(resolveSafeArtifactPath(brainDir, 'reports/summary.md')).toBe(
      fs.realpathSync(nestedValid),
    );

    // Traversal & internal paths MUST be rejected
    expect(resolveSafeArtifactPath(brainDir, '../secret.txt')).toBeNull();
    expect(resolveSafeArtifactPath(brainDir, '..\\secret.txt')).toBeNull();
    expect(resolveSafeArtifactPath(brainDir, 'reports/../../secret.txt')).toBeNull();
    expect(resolveSafeArtifactPath(brainDir, '/etc/passwd')).toBeNull();
    expect(resolveSafeArtifactPath(brainDir, 'C:/Windows/win.ini')).toBeNull();
    expect(resolveSafeArtifactPath(brainDir, '.system_generated/logs/transcript.jsonl')).toBeNull();
    expect(resolveSafeArtifactPath(brainDir, 'implementation_plan.md\0.png')).toBeNull();
  });

  it('caps artifact reads at MAX_ARTIFACT_BYTES (512KB)', () => {
    const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-size-test-'));
    tempDirs.push(base);

    const bigFile = path.join(base, 'huge.md');
    const payload = 'A'.repeat(MAX_ARTIFACT_BYTES + 4096);
    fs.writeFileSync(bigFile, payload, 'utf8');

    const res = readBoundedTextFile(bigFile);
    expect(res.truncated).toBe(true);
    expect(res.sizeBytes).toBe(MAX_ARTIFACT_BYTES + 4096);
    expect(Buffer.byteLength(res.content, 'utf8')).toBe(MAX_ARTIFACT_BYTES);
  });
});
