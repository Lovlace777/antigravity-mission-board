import fs from 'node:fs';
import path from 'node:path';
import type { ArtifactInfo } from '../../../shared/types.js';
import { normalizeTimestamp } from '../utils/time.js';

interface RawArtifactMetadata {
  summary?: string;
  updatedAt?: string;
  userFacing?: boolean;
  requestFeedback?: boolean;
}

const METADATA_SUFFIX = '.metadata.json';
const TEXT_EXTENSIONS = new Set(['.md', '.markdown', '.txt', '.json', '.yaml', '.yml']);

/**
 * Scan a conversation's `brain/<id>/` directory for artifacts and their companion
 * `*.metadata.json` files. Skips `.system_generated` and dot-directories.
 */
export function scanArtifactsDirectory(brainConversationDir: string): ArtifactInfo[] {
  let dirEntries: fs.Dirent[];
  try {
    dirEntries = fs.readdirSync(brainConversationDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const metadataByFile = new Map<string, RawArtifactMetadata>();
  const fileStats = new Map<string, fs.Stats>();

  const scanLevel = (dir: string, relPrefix: string, depth: number) => {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue; // skip .system_generated, .resolved, etc.
      const fullPath = path.join(dir, entry.name);
      const relPath = relPrefix ? `${relPrefix}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        // Scan up to 1 nested folder (e.g. reports/), skip scratch/temp unless needed
        if (depth < 1 && entry.name !== 'scratch') {
          scanLevel(fullPath, relPath, depth + 1);
        }
        continue;
      }

      if (!entry.isFile()) continue;

      if (entry.name.endsWith(METADATA_SUFFIX)) {
        const targetRel = relPath.slice(0, -METADATA_SUFFIX.length);
        try {
          const raw = JSON.parse(fs.readFileSync(fullPath, 'utf8')) as RawArtifactMetadata;
          metadataByFile.set(targetRel, raw);
        } catch {
          // Ignore malformed metadata JSON
        }
      } else {
        try {
          fileStats.set(relPath, fs.statSync(fullPath));
        } catch {
          // ignore
        }
      }
    }
  };

  // Use already-read top-level directory existence check and scan recursively
  if (dirEntries.length === 0) return [];
  scanLevel(brainConversationDir, '', 0);

  const artifacts: ArtifactInfo[] = [];
  const seen = new Set<string>();

  // 1. Add all files that have a companion `.metadata.json`
  for (const [relPath, meta] of metadataByFile.entries()) {
    const stat = fileStats.get(relPath);
    if (!stat) continue; // Orphan metadata without artifact file
    seen.add(relPath);

    artifacts.push({
      fileName: path.posix.basename(relPath),
      relativePath: relPath,
      summary: typeof meta.summary === 'string' ? meta.summary.trim() : '',
      updatedAt: normalizeTimestamp(meta.updatedAt) ?? stat.mtime.toISOString(),
      userFacing: meta.userFacing !== false,
      requestFeedback: meta.requestFeedback === true,
      sizeBytes: stat.size,
    });
  }

  // 2. Also include top-level readable Markdown/text artifacts without metadata JSON
  for (const [relPath, stat] of fileStats.entries()) {
    if (seen.has(relPath)) continue;
    const ext = path.extname(relPath).toLowerCase();
    if (!TEXT_EXTENSIONS.has(ext)) continue;
    if (relPath.endsWith('.metadata.json')) continue;

    artifacts.push({
      fileName: path.posix.basename(relPath),
      relativePath: relPath,
      summary: '',
      updatedAt: stat.mtime.toISOString(),
      userFacing: ext === '.md' || ext === '.markdown',
      requestFeedback: false,
      sizeBytes: stat.size,
    });
  }

  artifacts.sort((a, b) => {
    if (a.requestFeedback !== b.requestFeedback) return a.requestFeedback ? -1 : 1;
    return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
  });

  return artifacts;
}
