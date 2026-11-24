import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { OverlayStore } from '../src/db/overlayDb.js';

describe('OverlayStore SQLite persistence', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('persists conversation overlays and settings across DB restarts', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ag-overlay-test-'));
    tempDirs.push(dir);
    const dbPath = path.join(dir, 'nested', 'overlay.db');

    const store1 = new OverlayStore(dbPath);
    store1.patchOverlay('conv-abc', {
      manualLane: 'active',
      pinned: true,
      priority: 'p0',
      tags: ['backend', 'release', 'backend'], // duplicate should dedupe
      notes: 'Verify rollback script',
      followUpAt: '2026-11-30',
    });
    store1.markReviewed('conv-abc', '2026-11-24T12:00:00.000Z');
    store1.patchSettings({ staleAfterHours: 48, pollIntervalMs: 2500 });
    store1.close();

    // Reopen fresh instance from same file
    const store2 = new OverlayStore(dbPath);
    const overlay = store2.getOverlay('conv-abc');
    expect(overlay.manualLane).toBe('active');
    expect(overlay.pinned).toBe(true);
    expect(overlay.priority).toBe('p0');
    expect(overlay.tags).toEqual(['backend', 'release']);
    expect(overlay.notes).toBe('Verify rollback script');
    expect(overlay.followUpAt).toBe('2026-11-30');
    expect(overlay.reviewedAt).toBe('2026-11-24T12:00:00.000Z');

    const settings = store2.getSettings();
    expect(settings).toEqual({ staleAfterHours: 48, pollIntervalMs: 2500 });

    // Batch review and undo (reviewedAt: null) persist atomically
    const batchTs = '2026-11-24T15:30:00.000Z';
    const batchReviewed = store2.markReviewedBatch(['conv-1', 'conv-2', 'conv-1'], batchTs);
    expect(batchReviewed).toHaveLength(2);
    expect(store2.getOverlay('conv-1').reviewedAt).toBe(batchTs);
    expect(store2.getOverlay('conv-2').reviewedAt).toBe(batchTs);

    const undone = store2.markReviewedBatch(['conv-1', 'conv-2'], null);
    expect(undone).toHaveLength(2);
    expect(store2.getOverlay('conv-1').reviewedAt).toBeNull();
    expect(store2.getOverlay('conv-2').reviewedAt).toBeNull();
    store2.close();
  });
});
