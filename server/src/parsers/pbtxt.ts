import fs from 'node:fs';
import { protoTimestampToIso } from '../utils/time.js';

export interface ParsedAnnotation {
  title: string | null;
  lastUserViewAt: string | null;
  archived: boolean;
  archivedAt: string | null;
  markedAsUnread: boolean;
  planExecute: boolean;
  sideQuestionIds: string[];
  sideQuestionTitles: Record<string, string>;
}

type PbValue = string | number | boolean | PbMessage;
type PbMessage = Record<string, PbValue[]>;

/**
 * Decode a protobuf text-format quoted string literal, including UTF-8 octal
 * byte escapes (e.g. `\344\270\255`), hex escapes (`\xNN`), unicode escapes
 * (`\uNNNN`), and standard backslash escapes.
 */
function decodePbStringLiteral(raw: string, startIdx: number): { value: string; nextIdx: number } {
  const quote = raw[startIdx];
  let i = startIdx + 1;
  const bytes: number[] = [];

  const pushUtf8 = (str: string) => {
    const buf = Buffer.from(str, 'utf8');
    for (const b of buf) bytes.push(b);
  };

  while (i < raw.length) {
    const ch = raw[i];
    if (ch === quote) {
      i += 1;
      break;
    }
    if (ch === '\\' && i + 1 < raw.length) {
      const next = raw[i + 1];
      if (next >= '0' && next <= '7') {
        // Octal escape: up to 3 octal digits representing a single raw UTF-8 byte
        let oct = next;
        let k = i + 2;
        while (k < raw.length && oct.length < 3 && raw[k] >= '0' && raw[k] <= '7') {
          oct += raw[k];
          k += 1;
        }
        bytes.push(Number.parseInt(oct, 8) & 0xff);
        i = k;
        continue;
      }
      if (next === 'x' || next === 'X') {
        const hex = raw.slice(i + 2, i + 4);
        if (/^[0-9a-fA-F]{2}$/.test(hex)) {
          bytes.push(Number.parseInt(hex, 16));
          i += 4;
          continue;
        }
      }
      if (next === 'u') {
        const hex = raw.slice(i + 2, i + 6);
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          pushUtf8(String.fromCodePoint(Number.parseInt(hex, 16)));
          i += 6;
          continue;
        }
      }
      switch (next) {
        case 'n':
          bytes.push(0x0a);
          break;
        case 'r':
          bytes.push(0x0d);
          break;
        case 't':
          bytes.push(0x09);
          break;
        case '\\':
          bytes.push(0x5c);
          break;
        case '"':
          bytes.push(0x22);
          break;
        case "'":
          bytes.push(0x27);
          break;
        default:
          pushUtf8(next);
          break;
      }
      i += 2;
      continue;
    }

    // Consume plain UTF-16 code point (handles surrogate pairs properly)
    const cp = raw.codePointAt(i);
    if (cp !== undefined) {
      const charStr = String.fromCodePoint(cp);
      pushUtf8(charStr);
      i += charStr.length;
    } else {
      i += 1;
    }
  }

  return {
    value: Buffer.from(bytes).toString('utf8'),
    nextIdx: i,
  };
}

/**
 * Recursive-descent parser for protobuf text format (`.pbtxt`),
 * handling single-line space-separated fields as well as multi-line formatting.
 */
function parsePbMessage(input: string, startIdx = 0, expectCloseBrace = false): { msg: PbMessage; nextIdx: number } {
  const msg: PbMessage = {};
  let i = startIdx;
  const len = input.length;

  const skipWsAndComments = () => {
    while (i < len) {
      const ch = input[i];
      if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r' || ch === ',' || ch === ';') {
        i += 1;
      } else if (ch === '#') {
        while (i < len && input[i] !== '\n') i += 1;
      } else {
        break;
      }
    }
  };

  const pushField = (name: string, val: PbValue) => {
    if (!msg[name]) msg[name] = [];
    msg[name].push(val);
  };

  while (i < len) {
    skipWsAndComments();
    if (i >= len) break;

    if (input[i] === '}') {
      if (expectCloseBrace) {
        i += 1;
      }
      break;
    }

    // Read field identifier
    const nameStart = i;
    while (i < len && /[a-zA-Z0-9_.]/.test(input[i])) {
      i += 1;
    }
    const fieldName = input.slice(nameStart, i);
    if (!fieldName) {
      // Skip unexpected character to guarantee termination
      i += 1;
      continue;
    }

    skipWsAndComments();
    if (i < len && input[i] === ':') {
      i += 1;
      skipWsAndComments();
    }

    if (i >= len) break;

    const ch = input[i];
    if (ch === '{') {
      const nested = parsePbMessage(input, i + 1, true);
      pushField(fieldName, nested.msg);
      i = nested.nextIdx;
    } else if (ch === '"' || ch === "'") {
      // Protobuf allows adjacent string literals to concatenate
      let combined = '';
      while (i < len && (input[i] === '"' || input[i] === "'")) {
        const str = decodePbStringLiteral(input, i);
        combined += str.value;
        i = str.nextIdx;
        skipWsAndComments();
      }
      pushField(fieldName, combined);
    } else if (ch === '[') {
      // List literal: [val1, val2]
      i += 1;
      while (i < len) {
        skipWsAndComments();
        if (i >= len || input[i] === ']') {
          if (i < len && input[i] === ']') i += 1;
          break;
        }
        if (input[i] === '"' || input[i] === "'") {
          const str = decodePbStringLiteral(input, i);
          pushField(fieldName, str.value);
          i = str.nextIdx;
        } else if (input[i] === '{') {
          const nested = parsePbMessage(input, i + 1, true);
          pushField(fieldName, nested.msg);
          i = nested.nextIdx;
        } else {
          const tokStart = i;
          while (i < len && !/[\s,\];}]/.test(input[i])) i += 1;
          const tok = input.slice(tokStart, i);
          pushField(fieldName, parseScalarToken(tok));
        }
      }
    } else {
      // Scalar token (boolean, number, enum identifier)
      const tokStart = i;
      while (i < len && !/[\s,;}\n\r]/.test(input[i])) {
        i += 1;
      }
      const tok = input.slice(tokStart, i);
      if (tok) {
        pushField(fieldName, parseScalarToken(tok));
      }
    }
  }

  return { msg, nextIdx: i };
}

function parseScalarToken(tok: string): string | number | boolean {
  if (tok === 'true') return true;
  if (tok === 'false') return false;
  if (/^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(tok)) {
    const n = Number(tok);
    if (Number.isFinite(n)) return n;
  }
  return tok;
}

function getLastValue(msg: PbMessage, key: string): PbValue | undefined {
  const arr = msg[key];
  return arr && arr.length > 0 ? arr[arr.length - 1] : undefined;
}

function extractPbTimestamp(msg: PbMessage, key: string): string | null {
  const val = getLastValue(msg, key);
  if (!val || typeof val !== 'object') return null;
  const secVal = getLastValue(val, 'seconds');
  const nanosVal = getLastValue(val, 'nanos');
  const seconds = typeof secVal === 'number' ? secVal : null;
  const nanos = typeof nanosVal === 'number' ? nanosVal : 0;
  return protoTimestampToIso(seconds, nanos);
}

/**
 * Parse the contents of an Antigravity `annotations/<uuid>.pbtxt` file.
 */
export function parseAnnotationPbtxt(content: string): ParsedAnnotation {
  const { msg } = parsePbMessage(content);

  const rawTitle = getLastValue(msg, 'title');
  const title = typeof rawTitle === 'string' && rawTitle.trim() ? rawTitle.trim() : null;

  const lastUserViewAt = extractPbTimestamp(msg, 'last_user_view_time');
  const archivedAt = extractPbTimestamp(msg, 'archival_status_timestamp');

  const archived = getLastValue(msg, 'archived') === true;
  const markedAsUnread = getLastValue(msg, 'marked_as_unread') === true;
  const planExecute = getLastValue(msg, 'plan_execute') === true;

  const sideQuestionIds: string[] = [];
  for (const val of msg.side_question_cascade_ids ?? []) {
    if (typeof val === 'string' && val.trim()) {
      sideQuestionIds.push(val.trim());
    }
  }

  const sideQuestionTitles: Record<string, string> = {};
  for (const entry of msg.side_question_titles ?? []) {
    if (entry && typeof entry === 'object') {
      const k = getLastValue(entry, 'key');
      const v = getLastValue(entry, 'value');
      if (typeof k === 'string' && typeof v === 'string') {
        sideQuestionTitles[k] = v;
      }
    }
  }

  return {
    title,
    lastUserViewAt,
    archived,
    archivedAt,
    markedAsUnread,
    planExecute,
    sideQuestionIds,
    sideQuestionTitles,
  };
}

export function parseAnnotationFile(filePath: string): ParsedAnnotation {
  const content = fs.readFileSync(filePath, 'utf8');
  return parseAnnotationPbtxt(content);
}
