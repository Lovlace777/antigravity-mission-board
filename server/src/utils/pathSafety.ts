import fs from 'node:fs';
import path from 'node:path';

export const MAX_ARTIFACT_BYTES = 512 * 1024; // 512 KB

const SAFE_CONVERSATION_ID_RE = /^[a-zA-Z0-9_-]{1,128}$/;

export function isValidConversationId(id: string): boolean {
  return SAFE_CONVERSATION_ID_RE.test(id);
}

/**
 * Strictly resolve a requested artifact relative path inside a conversation's brain directory.
 * Rejects absolute paths, null bytes, Windows drive letters, `..` traversal, `.system_generated`
 * internal files, and symlink escapes outside the root directory.
 */
export function resolveSafeArtifactPath(brainConversationDir: string, requestedFile: string): string | null {
  if (!requestedFile || typeof requestedFile !== 'string') return null;
  if (requestedFile.includes('\0')) return null;

  const normalizedInput = requestedFile.replace(/\\/g, '/').trim();
  if (!normalizedInput) return null;
  if (normalizedInput.startsWith('/') || /^[a-zA-Z]:/.test(normalizedInput)) return null;

  const segments = normalizedInput.split('/');
  if (segments.some((seg) => !seg || seg === '.' || seg === '..' || seg === '.system_generated')) {
    return null;
  }

  const rootResolved = path.resolve(brainConversationDir);
  const candidate = path.resolve(rootResolved, ...segments);

  const rel = path.relative(rootResolved, candidate);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    return null;
  }

  // Verify realpath containment when the target exists on disk (blocks symlink traversal).
  try {
    const rootReal = fs.realpathSync(rootResolved);
    const targetReal = fs.realpathSync(candidate);
    const realRel = path.relative(rootReal, targetReal);
    if (!realRel || realRel.startsWith('..') || path.isAbsolute(realRel)) {
      return null;
    }
    const stat = fs.statSync(targetReal);
    if (!stat.isFile()) return null;
    return targetReal;
  } catch {
    return null;
  }
}

/**
 * Read a UTF-8 text artifact capped at `maxBytes` (default 512 KB).
 */
export function readBoundedTextFile(
  absoluteFilePath: string,
  maxBytes = MAX_ARTIFACT_BYTES,
): { content: string; truncated: boolean; sizeBytes: number } {
  const stat = fs.statSync(absoluteFilePath);
  const sizeBytes = stat.size;
  const readLength = Math.min(sizeBytes, maxBytes);
  const buffer = Buffer.alloc(readLength);

  const fd = fs.openSync(absoluteFilePath, 'r');
  try {
    if (readLength > 0) {
      fs.readSync(fd, buffer, 0, readLength, 0);
    }
  } finally {
    fs.closeSync(fd);
  }

  return {
    content: buffer.toString('utf8'),
    truncated: sizeBytes > maxBytes,
    sizeBytes,
  };
}
