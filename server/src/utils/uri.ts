/**
 * Helpers for decoding Antigravity `workspace_uris` JSON strings
 * (percent-encoded `file:///` URIs on Windows, macOS, and Linux).
 */

export interface ParsedWorkspace {
  uris: string[];
  primaryPath: string;
  basename: string;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

/**
 * Decode a single `file://` URI into a clean readable local path (forward-slash normalized).
 */
export function decodeFileUri(uri: string): string {
  const trimmed = uri.trim();
  if (!trimmed) return '';

  if (!trimmed.toLowerCase().startsWith('file://')) {
    return safeDecodeURIComponent(trimmed).replace(/\\/g, '/').replace(/\/+$/, '');
  }

  let rest = trimmed.slice('file://'.length);

  // Strip optional "localhost" authority: file://localhost/path -> /path
  if (rest.toLowerCase().startsWith('localhost/')) {
    rest = rest.slice('localhost'.length);
  }

  const decoded = safeDecodeURIComponent(rest);

  // Windows drive path: /d:/foo/bar or /D:/foo/bar -> D:/foo/bar
  const winDriveMatch = /^\/([a-zA-Z]):(\/.*|$)/.exec(decoded);
  if (winDriveMatch) {
    const drive = winDriveMatch[1].toUpperCase();
    const tail = winDriveMatch[2] || '/';
    const combined = `${drive}:${tail}`;
    return combined.length > 3 ? combined.replace(/\/+$/, '') : combined;
  }

  // UNC path: file://server/share/dir -> //server/share/dir
  if (!decoded.startsWith('/')) {
    return `//${decoded}`.replace(/\/+$/, '');
  }

  // POSIX absolute path: /Users/alice/project
  return decoded.length > 1 ? decoded.replace(/\/+$/, '') : decoded;
}

/**
 * Extract the last path segment as a display workspace name.
 */
export function extractPathBasename(fsPath: string): string {
  const normalized = fsPath.replace(/\\/g, '/').replace(/\/+$/, '');
  if (!normalized) return '';
  const parts = normalized.split('/').filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : normalized;
}

/**
 * Parse `conversation_summaries.workspace_uris` column (JSON array of file URIs).
 */
export function parseWorkspaceUris(raw: string | null | undefined, fallbackWorkspace = ''): ParsedWorkspace {
  const uris: string[] = [];

  if (raw && typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          for (const item of parsed) {
            if (typeof item === 'string' && item.trim()) {
              uris.push(item.trim());
            }
          }
        }
      } catch {
        // Ignore malformed JSON
      }
    } else if (trimmed.startsWith('file://')) {
      uris.push(trimmed);
    }
  }

  const primaryPath = uris.length > 0 ? decodeFileUri(uris[0]) : '';
  const basename = extractPathBasename(primaryPath) || fallbackWorkspace.trim();

  return {
    uris,
    primaryPath,
    basename,
  };
}
