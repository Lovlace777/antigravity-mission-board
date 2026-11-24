/**
 * Timestamp normalization helpers for Go-style UTC timestamps, protobuf timestamps,
 * and standard ISO 8601 strings observed in Antigravity 2.0 local storage.
 */

const GO_TIMESTAMP_RE =
  /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * Normalize Go-style timestamps (e.g. "2026-11-24 00:47:21.1068159+00:00")
 * or ISO strings to a canonical ISO 8601 UTC string (`YYYY-MM-DDTHH:mm:ss.sssZ`).
 * Returns null for empty, invalid, or zero-epoch Go dates (year <= 1970).
 */
export function normalizeTimestamp(raw: string | null | undefined): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const match = GO_TIMESTAMP_RE.exec(trimmed);
  let candidate: string;

  if (match) {
    const [, datePart, timePart, fracPart, tzPart] = match;
    const ms = fracPart ? fracPart.slice(0, 3).padEnd(3, '0') : '000';
    let tz = tzPart ?? 'Z';
    if (tz !== 'Z' && tz.length === 5) {
      // +0000 -> +00:00
      tz = `${tz.slice(0, 3)}:${tz.slice(3)}`;
    }
    candidate = `${datePart}T${timePart}.${ms}${tz}`;
  } else {
    candidate = trimmed;
  }

  const parsedMs = Date.parse(candidate);
  if (!Number.isFinite(parsedMs) || parsedMs <= 0) {
    return null;
  }

  const date = new Date(parsedMs);
  if (date.getUTCFullYear() <= 1970) {
    return null;
  }

  return date.toISOString();
}

/**
 * Parse a timestamp string (Go-style or ISO) into Unix milliseconds, or null if invalid.
 */
export function parseTimestampMs(raw: string | null | undefined): number | null {
  const iso = normalizeTimestamp(raw);
  if (!iso) return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

/**
 * Convert a protobuf Timestamp `{ seconds, nanos }` into canonical ISO 8601 UTC string.
 */
export function protoTimestampToIso(seconds?: number | null, nanos?: number | null): string | null {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return null;
  }
  const safeNanos = typeof nanos === 'number' && Number.isFinite(nanos) && nanos >= 0 ? nanos : 0;
  const ms = seconds * 1000 + Math.floor(safeNanos / 1_000_000);
  if (!Number.isFinite(ms) || ms <= 0) return null;
  const date = new Date(ms);
  if (date.getUTCFullYear() <= 1970) return null;
  return date.toISOString();
}

/**
 * Parse a reminder date/timestamp (`YYYY-MM-DD` or ISO) into epoch milliseconds.
 * Date-only strings (`YYYY-MM-DD`) are interpreted as start of day UTC.
 */
export function parseFollowUpMs(raw: string | null | undefined): number | null {
  if (!raw || typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const ms = Date.parse(`${trimmed}T00:00:00.000Z`);
    return Number.isFinite(ms) ? ms : null;
  }
  return parseTimestampMs(trimmed);
}
