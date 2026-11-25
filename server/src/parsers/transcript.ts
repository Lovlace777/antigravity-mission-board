import fs from 'node:fs';
import path from 'node:path';
import type { StepItem, StepStatus, TimelineTurn, TokenUsage } from '../../../shared/types.js';
import { normalizeTimestamp } from '../utils/time.js';

export interface ParsedTranscript {
  steps: StepItem[];
  currentFocus: string | null;
  tokens: TokenUsage;
  models: string[];
  hasPendingQuestion: boolean;
  pendingQuestionText: string | null;
  hasError: boolean;
  lastError: string | null;
  latestMessagePreview: string | null;
  timeline: TimelineTurn[];
}

export interface ParseTranscriptOptions {
  /**
   * Summary mode used during board polling: skips building the 80-turn `timeline`
   * array and reads only a fast tail window (256 KB) for huge files (>256 KB)
   * while streaming-scanning prefix token counters with flat 64 KB RAM.
   */
  tailOnly?: boolean;
  maxTailBytes?: number;
}

interface RawToolCall {
  name?: string;
  tool_name?: string;
  args?: Record<string, unknown> | string;
}

interface RawTranscriptLine {
  step_index?: number;
  source?: string;
  type?: string;
  status?: string;
  created_at?: string;
  content?: string;
  thinking?: string;
  tool_calls?: RawToolCall[];
  truncated_fields?: string[];
  error?: string | { message?: string };
  model?: string;
  input_tokens?: number;
  cache_read_tokens?: number;
  output_tokens?: number;
}

const VALID_STEP_STATUSES = new Set<StepStatus>([
  'pending',
  'in_progress',
  'done',
  'skipped',
  'failed',
]);

const SUBSTANTIVE_TYPES = new Set([
  'USER_INPUT',
  'PLANNER_RESPONSE',
  'ERROR_MESSAGE',
  'SYSTEM_MESSAGE',
  'GENERIC',
]);

const MAX_TIMELINE_TURNS = 80;
const MAX_TURN_TEXT_LEN = 2500;
const MAX_THINKING_SUMMARY_LEN = 400;
const MAX_PREVIEW_LEN = 180;
export const DEFAULT_TAIL_WINDOW_BYTES = 256 * 1024;
const TOKEN_SCAN_CHUNK_BYTES = 64 * 1024;

export function createEmptyTokenUsage(): TokenUsage {
  return {
    inputTokens: 0,
    cacheReadTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    cacheHitRate: 0,
  };
}

export function finalizeTokenUsage(
  inputTokens: number,
  cacheReadTokens: number,
  outputTokens: number,
): TokenUsage {
  const safeIn = Math.max(0, Math.round(inputTokens));
  const safeCache = Math.max(0, Math.round(cacheReadTokens));
  const safeOut = Math.max(0, Math.round(outputTokens));
  const totalTokens = safeIn + safeCache + safeOut;
  const cacheDenom = safeIn + safeCache;
  const cacheHitRate = cacheDenom > 0 ? Math.min(1, Number((safeCache / cacheDenom).toFixed(4))) : 0;

  return {
    inputTokens: safeIn,
    cacheReadTokens: safeCache,
    outputTokens: safeOut,
    totalTokens,
    cacheHitRate,
  };
}

export function createEmptyTranscript(): ParsedTranscript {
  return {
    steps: [],
    currentFocus: null,
    tokens: createEmptyTokenUsage(),
    models: [],
    hasPendingQuestion: false,
    pendingQuestionText: null,
    hasError: false,
    lastError: null,
    latestMessagePreview: null,
    timeline: [],
  };
}

function parseToolArgs(rawArgs: Record<string, unknown> | string | undefined): Record<string, unknown> | null {
  if (!rawArgs) return null;
  if (typeof rawArgs === 'object' && !Array.isArray(rawArgs)) {
    return rawArgs;
  }
  if (typeof rawArgs === 'string') {
    try {
      const parsed = JSON.parse(rawArgs);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Parse `update_steps` argument (`args.steps`), which may be either an array
 * (in `transcript_full.jsonl`) or a JSON-encoded string (in compact `transcript.jsonl`).
 * Returns `null` if truncated or unparseable so the caller can fall back to `transcript_full.jsonl`.
 */
export function parseStepsArg(rawSteps: unknown): StepItem[] | null {
  let arr: unknown = rawSteps;
  if (typeof rawSteps === 'string') {
    try {
      arr = JSON.parse(rawSteps);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(arr)) return null;

  const result: StepItem[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const title = typeof rec.title === 'string' ? rec.title.trim() : '';
    const rawStatus = typeof rec.status === 'string' ? rec.status.trim() : 'pending';
    const status: StepStatus = VALID_STEP_STATUSES.has(rawStatus as StepStatus)
      ? (rawStatus as StepStatus)
      : 'pending';
    if (title) {
      result.push({ title, status });
    }
  }
  return result;
}

function extractAskQuestionText(args: Record<string, unknown> | null): string | null {
  if (!args) return null;
  let questions: unknown = args.questions;
  if (typeof questions === 'string') {
    const rawStr = questions;
    try {
      questions = JSON.parse(rawStr);
    } catch {
      return rawStr.slice(0, 300);
    }
  }
  if (Array.isArray(questions) && questions.length > 0) {
    const first = questions[0];
    if (first && typeof first === 'object') {
      const q = (first as Record<string, unknown>).question;
      if (typeof q === 'string' && q.trim()) {
        return q.trim().slice(0, 400);
      }
    }
  }
  if (typeof args.question === 'string' && args.question.trim()) {
    return args.question.trim().slice(0, 400);
  }
  return null;
}

function extractErrorString(err: RawTranscriptLine['error'], fallbackContent?: string): string {
  if (typeof err === 'string' && err.trim()) {
    return err.trim().slice(0, 500);
  }
  if (err && typeof err === 'object' && typeof err.message === 'string' && err.message.trim()) {
    return err.message.trim().slice(0, 500);
  }
  if (typeof fallbackContent === 'string' && fallbackContent.trim()) {
    return fallbackContent.trim().slice(0, 500);
  }
  return 'Execution error';
}

function truncateText(text: string | undefined, maxLen: number): string {
  if (!text) return '';
  const trimmed = text.trim();
  if (trimmed.length <= maxLen) return trimmed;
  return `${trimmed.slice(0, maxLen)}…`;
}

/**
 * Build a clean single-paragraph preview excerpt (~180 chars) stripped of noisy markdown fences/headings.
 */
export function buildCompactPreview(raw: string | null | undefined, maxLen = MAX_PREVIEW_LEN): string | null {
  if (!raw) return null;
  const cleaned = raw
    .replace(/```[\s\S]*?```/g, ' [code] ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return null;
  return cleaned.length <= maxLen ? cleaned : `${cleaned.slice(0, maxLen - 1).trimEnd()}…`;
}

/**
 * Look up the untruncated `update_steps` / `ask_question` payload from `transcript_full.jsonl`.
 * Reads a bounded tail window first for huge files so memory stays flat.
 */
function resolveFromFullTranscript(
  fullTranscriptPath: string,
  targetUpdateStepsIdx: number | null,
  targetAskQuestionIdx: number | null,
): { steps: StepItem[] | null; questionText: string | null } {
  let content: string;
  try {
    const stat = fs.statSync(fullTranscriptPath);
    const maxRead = 2 * 1024 * 1024; // 2 MB tail cap covers recent update_steps safely
    if (stat.size > maxRead) {
      const buf = Buffer.allocUnsafe(maxRead);
      const fd = fs.openSync(fullTranscriptPath, 'r');
      try {
        fs.readSync(fd, buf, 0, maxRead, stat.size - maxRead);
      } finally {
        fs.closeSync(fd);
      }
      const raw = buf.toString('utf8');
      const firstNl = raw.indexOf('\n');
      content = firstNl >= 0 ? raw.slice(firstNl + 1) : raw;
    } else {
      content = fs.readFileSync(fullTranscriptPath, 'utf8');
    }
  } catch {
    return { steps: null, questionText: null };
  }

  let resolvedSteps: StepItem[] | null = null;
  let resolvedQuestion: string | null = null;

  const lines = content.split(/\r?\n/);
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (!line) continue;

    const wantsSteps = targetUpdateStepsIdx !== null && resolvedSteps === null && line.includes('update_steps');
    const wantsQuestion =
      targetAskQuestionIdx !== null && resolvedQuestion === null && line.includes('ask_question');

    if (!wantsSteps && !wantsQuestion) continue;

    let entry: RawTranscriptLine;
    try {
      entry = JSON.parse(line) as RawTranscriptLine;
    } catch {
      continue;
    }

    if (!Array.isArray(entry.tool_calls)) continue;

    if (wantsSteps && (entry.step_index === targetUpdateStepsIdx || targetUpdateStepsIdx === -1)) {
      for (let j = entry.tool_calls.length - 1; j >= 0; j--) {
        const tc = entry.tool_calls[j];
        const tcName = tc?.name ?? tc?.tool_name;
        if (tcName === 'update_steps') {
          const args = parseToolArgs(tc.args);
          const parsed = args ? parseStepsArg(args.steps) : null;
          if (parsed && parsed.length > 0) {
            resolvedSteps = parsed;
            break;
          }
        }
      }
    }

    if (wantsQuestion && entry.step_index === targetAskQuestionIdx) {
      for (let j = entry.tool_calls.length - 1; j >= 0; j--) {
        const tc = entry.tool_calls[j];
        const tcName = tc?.name ?? tc?.tool_name;
        if (tcName === 'ask_question') {
          const args = parseToolArgs(tc.args);
          const text = extractAskQuestionText(args);
          if (text) {
            resolvedQuestion = text;
            break;
          }
        }
      }
    }

    if (
      (targetUpdateStepsIdx === null || resolvedSteps !== null) &&
      (targetAskQuestionIdx === null || resolvedQuestion !== null)
    ) {
      break;
    }
  }

  return { steps: resolvedSteps, questionText: resolvedQuestion };
}

/**
 * Low-RAM streaming counter for token totals & models over the prefix `[0, endOffset)`
 * of a large `transcript.jsonl` file using a reusable 64 KB buffer.
 */
function scanPrefixTokensLowRam(
  fd: number,
  endOffset: number,
): { inputTokens: number; cacheReadTokens: number; outputTokens: number; models: string[] } {
  let inputTokens = 0;
  let cacheReadTokens = 0;
  let outputTokens = 0;
  const models = new Set<string>();

  const buf = Buffer.allocUnsafe(TOKEN_SCAN_CHUNK_BYTES);
  let pos = 0;
  let carry = '';

  const inRe = /"input_tokens"\s*:\s*(\d+)/g;
  const cacheRe = /"cache_read_tokens"\s*:\s*(\d+)/g;
  const outRe = /"output_tokens"\s*:\s*(\d+)/g;
  const modelRe = /"model"\s*:\s*"([^"]{2,80})"/g;

  while (pos < endOffset) {
    const toRead = Math.min(TOKEN_SCAN_CHUNK_BYTES, endOffset - pos);
    const bytesRead = fs.readSync(fd, buf, 0, toRead, pos);
    if (bytesRead <= 0) break;
    pos += bytesRead;

    const text = carry + buf.toString('utf8', 0, bytesRead);
    const lastNl = text.lastIndexOf('\n');
    const slice = lastNl >= 0 ? text.slice(0, lastNl + 1) : pos >= endOffset ? text : '';
    carry = lastNl >= 0 ? text.slice(lastNl + 1) : pos >= endOffset ? '' : text;

    if (!slice) continue;

    let m: RegExpExecArray | null;
    inRe.lastIndex = 0;
    while ((m = inRe.exec(slice)) !== null) inputTokens += Number(m[1]);
    cacheRe.lastIndex = 0;
    while ((m = cacheRe.exec(slice)) !== null) cacheReadTokens += Number(m[1]);
    outRe.lastIndex = 0;
    while ((m = outRe.exec(slice)) !== null) outputTokens += Number(m[1]);
    modelRe.lastIndex = 0;
    while ((m = modelRe.exec(slice)) !== null) {
      if (m[1]) models.add(m[1]);
    }
  }

  return { inputTokens, cacheReadTokens, outputTokens, models: Array.from(models) };
}

/**
 * Parse `transcript.jsonl` content, with optional fallback path to `transcript_full.jsonl`
 * whenever `update_steps` or `ask_question` was truncated in the compact transcript.
 */
export function parseTranscriptContent(
  content: string,
  fullTranscriptPath?: string | null,
  options?: {
    includeTimeline?: boolean;
    prefixTokens?: { inputTokens: number; cacheReadTokens: number; outputTokens: number; models: string[] };
  },
): ParsedTranscript {
  const includeTimeline = options?.includeTimeline !== false;

  let inputTokens = options?.prefixTokens?.inputTokens ?? 0;
  let cacheReadTokens = options?.prefixTokens?.cacheReadTokens ?? 0;
  let outputTokens = options?.prefixTokens?.outputTokens ?? 0;

  const modelSet = new Set<string>(options?.prefixTokens?.models ?? []);
  let latestSteps: StepItem[] = [];
  let currentFocus: string | null = null;

  let truncatedUpdateStepsIdx: number | null = null;
  let latestAskQuestionStepIdx: number | null = null;
  let pendingQuestionText: string | null = null;
  let truncatedAskQuestionIdx: number | null = null;
  let lastUserOrPlannerAfterQuestion = false;

  let lastSubstantiveType: string | null = null;
  let lastSubstantiveStatus: string | null = null;
  let lastSubstantiveError: string | null = null;

  let latestPlannerContent: string | null = null;
  let latestUserContent: string | null = null;

  const timeline: TimelineTurn[] = [];

  const lines = content.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i].trim();
    if (!rawLine) continue;

    let entry: RawTranscriptLine;
    try {
      entry = JSON.parse(rawLine) as RawTranscriptLine;
    } catch {
      continue;
    }

    const stepIndex = typeof entry.step_index === 'number' ? entry.step_index : i;
    const type = typeof entry.type === 'string' ? entry.type : '';
    const source = typeof entry.source === 'string' ? entry.source : '';
    const status = typeof entry.status === 'string' ? entry.status : '';
    const createdAt = normalizeTimestamp(entry.created_at);

    if (typeof entry.input_tokens === 'number' && Number.isFinite(entry.input_tokens)) {
      inputTokens += entry.input_tokens;
    }
    if (typeof entry.cache_read_tokens === 'number' && Number.isFinite(entry.cache_read_tokens)) {
      cacheReadTokens += entry.cache_read_tokens;
    }
    if (typeof entry.output_tokens === 'number' && Number.isFinite(entry.output_tokens)) {
      outputTokens += entry.output_tokens;
    }
    if (typeof entry.model === 'string' && entry.model.trim()) {
      modelSet.add(entry.model.trim());
    }

    if (typeof entry.content === 'string' && entry.content.trim()) {
      if (type === 'PLANNER_RESPONSE') {
        latestPlannerContent = entry.content;
      } else if (type === 'USER_INPUT') {
        latestUserContent = entry.content;
      }
    }

    const truncatedToolCalls =
      Array.isArray(entry.truncated_fields) && entry.truncated_fields.includes('tool_calls');

    const toolNames: string[] = [];
    let calledAskQuestionThisStep = false;

    if (Array.isArray(entry.tool_calls)) {
      for (const tc of entry.tool_calls) {
        if (!tc || typeof tc !== 'object') continue;
        const tcName =
          typeof tc.name === 'string'
            ? tc.name
            : typeof tc.tool_name === 'string'
              ? tc.tool_name
              : '';
        if (!tcName) continue;
        toolNames.push(tcName);

        const args = parseToolArgs(tc.args);

        if (tcName === 'update_focus') {
          const focus = args?.focus;
          if (typeof focus === 'string' && focus.trim()) {
            currentFocus = focus.trim();
          }
        } else if (tcName === 'update_steps') {
          const parsed = args ? parseStepsArg(args.steps) : null;
          if (parsed && parsed.length > 0 && !truncatedToolCalls) {
            latestSteps = parsed;
            truncatedUpdateStepsIdx = null;
          } else if (parsed && parsed.length > 0) {
            latestSteps = parsed;
            truncatedUpdateStepsIdx = stepIndex;
          } else {
            truncatedUpdateStepsIdx = stepIndex;
          }
        } else if (tcName === 'ask_question') {
          calledAskQuestionThisStep = true;
          latestAskQuestionStepIdx = stepIndex;
          lastUserOrPlannerAfterQuestion = false;
          const qText = extractAskQuestionText(args);
          if (qText) {
            pendingQuestionText = qText;
            truncatedAskQuestionIdx = null;
          } else if (truncatedToolCalls) {
            truncatedAskQuestionIdx = stepIndex;
          }
        }
      }
    }

    if (
      latestAskQuestionStepIdx !== null &&
      !calledAskQuestionThisStep &&
      (type === 'USER_INPUT' || type === 'PLANNER_RESPONSE')
    ) {
      lastUserOrPlannerAfterQuestion = true;
    }

    if (SUBSTANTIVE_TYPES.has(type)) {
      lastSubstantiveType = type;
      lastSubstantiveStatus = status;
      if (type === 'ERROR_MESSAGE' || status === 'ERROR') {
        lastSubstantiveError = extractErrorString(entry.error, entry.content);
      } else {
        lastSubstantiveError = null;
      }
    }

    if (
      includeTimeline &&
      (type === 'USER_INPUT' ||
        type === 'PLANNER_RESPONSE' ||
        type === 'ERROR_MESSAGE' ||
        status === 'ERROR')
    ) {
      const text = truncateText(entry.content, MAX_TURN_TEXT_LEN);
      const thinkingSummary = entry.thinking
        ? truncateText(entry.thinking, MAX_THINKING_SUMMARY_LEN)
        : undefined;
      const errorMessage =
        type === 'ERROR_MESSAGE' || status === 'ERROR'
          ? extractErrorString(entry.error, entry.content)
          : undefined;

      if (text || toolNames.length > 0 || errorMessage || thinkingSummary) {
        timeline.push({
          stepIndex,
          source,
          type,
          status,
          createdAt,
          text,
          thinkingSummary,
          toolNames: Array.from(new Set(toolNames)),
          model: typeof entry.model === 'string' ? entry.model : undefined,
          errorMessage,
        });
      }
    }
  }

  const hasPendingQuestion =
    latestAskQuestionStepIdx !== null && !lastUserOrPlannerAfterQuestion;

  if (
    fullTranscriptPath &&
    (truncatedUpdateStepsIdx !== null || (hasPendingQuestion && truncatedAskQuestionIdx !== null))
  ) {
    const fallback = resolveFromFullTranscript(
      fullTranscriptPath,
      truncatedUpdateStepsIdx,
      hasPendingQuestion ? truncatedAskQuestionIdx : null,
    );
    if (fallback.steps && fallback.steps.length > 0) {
      latestSteps = fallback.steps;
    }
    if (fallback.questionText) {
      pendingQuestionText = fallback.questionText;
    }
  }

  const hasError = lastSubstantiveType === 'ERROR_MESSAGE' || lastSubstantiveStatus === 'ERROR';
  const lastError = hasError ? lastSubstantiveError : null;
  const effectivePendingQuestion = hasPendingQuestion ? pendingQuestionText : null;

  const latestMessagePreview =
    buildCompactPreview(lastError) ??
    buildCompactPreview(effectivePendingQuestion) ??
    buildCompactPreview(latestPlannerContent) ??
    buildCompactPreview(latestUserContent);

  return {
    steps: latestSteps,
    currentFocus,
    tokens: finalizeTokenUsage(inputTokens, cacheReadTokens, outputTokens),
    models: Array.from(modelSet),
    hasPendingQuestion,
    pendingQuestionText: effectivePendingQuestion,
    hasError,
    lastError,
    latestMessagePreview,
    timeline: timeline.length > MAX_TIMELINE_TURNS ? timeline.slice(-MAX_TIMELINE_TURNS) : timeline,
  };
}

export function parseTranscriptFile(
  transcriptPath: string,
  options: ParseTranscriptOptions = {},
): ParsedTranscript {
  const fullPath = path.join(path.dirname(transcriptPath), 'transcript_full.jsonl');
  const resolvedFullPath = fs.existsSync(fullPath) ? fullPath : null;
  const tailOnly = options.tailOnly === true;
  const maxTailBytes = options.maxTailBytes ?? DEFAULT_TAIL_WINDOW_BYTES;

  if (tailOnly) {
    const stat = fs.statSync(transcriptPath);
    if (stat.size > maxTailBytes) {
      const fd = fs.openSync(transcriptPath, 'r');
      try {
        const tailStart = stat.size - maxTailBytes;
        const tailBuf = Buffer.allocUnsafe(maxTailBytes);
        fs.readSync(fd, tailBuf, 0, maxTailBytes, tailStart);

        // Find the first newline inside tailBuf so we start on a clean JSONL line boundary
        const firstNlByte = tailBuf.indexOf(0x0a);
        const alignedTailOffset = firstNlByte >= 0 ? tailStart + firstNlByte + 1 : tailStart;
        const tailContent =
          firstNlByte >= 0 ? tailBuf.toString('utf8', firstNlByte + 1) : tailBuf.toString('utf8');

        const prefixTokens = scanPrefixTokensLowRam(fd, alignedTailOffset);

        return parseTranscriptContent(tailContent, resolvedFullPath, {
          includeTimeline: false,
          prefixTokens,
        });
      } finally {
        fs.closeSync(fd);
      }
    }
  }

  const content = fs.readFileSync(transcriptPath, 'utf8');
  return parseTranscriptContent(content, resolvedFullPath, {
    includeTimeline: !tailOnly,
  });
}
