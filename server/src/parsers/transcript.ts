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
  timeline: TimelineTurn[];
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
 * Look up the untruncated `update_steps` / `ask_question` payload from `transcript_full.jsonl`.
 * Uses fast substring pre-filtering so large transcripts scan in a few milliseconds.
 */
function resolveFromFullTranscript(
  fullTranscriptPath: string,
  targetUpdateStepsIdx: number | null,
  targetAskQuestionIdx: number | null,
): { steps: StepItem[] | null; questionText: string | null } {
  let content: string;
  try {
    content = fs.readFileSync(fullTranscriptPath, 'utf8');
  } catch {
    return { steps: null, questionText: null };
  }

  let resolvedSteps: StepItem[] | null = null;
  let resolvedQuestion: string | null = null;

  const lines = content.split(/\r?\n/);
  // Walk backwards so we hit the latest update_steps / ask_question immediately
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
 * Parse `transcript.jsonl` content, with optional fallback path to `transcript_full.jsonl`
 * whenever `update_steps` or `ask_question` was truncated in the compact transcript.
 */
export function parseTranscriptContent(
  content: string,
  fullTranscriptPath?: string | null,
): ParsedTranscript {
  let inputTokens = 0;
  let cacheReadTokens = 0;
  let outputTokens = 0;

  const modelSet = new Set<string>();
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

    const truncatedToolCalls =
      Array.isArray(entry.truncated_fields) && entry.truncated_fields.includes('tool_calls');

    const toolNames: string[] = [];
    let calledAskQuestionThisStep = false;

    if (Array.isArray(entry.tool_calls)) {
      for (const tc of entry.tool_calls) {
        if (!tc || typeof tc !== 'object') continue;
        const tcName = typeof tc.name === 'string' ? tc.name : typeof tc.tool_name === 'string' ? tc.tool_name : '';
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
            // Valid even when tool_calls marked truncated, keep parsed as baseline
            // and still check full transcript in case array items were truncated.
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

    // Track whether conversation moved past ask_question
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

    // Build timeline turns for meaningful events
    if (
      type === 'USER_INPUT' ||
      type === 'PLANNER_RESPONSE' ||
      type === 'ERROR_MESSAGE' ||
      status === 'ERROR'
    ) {
      const text = truncateText(entry.content, MAX_TURN_TEXT_LEN);
      const thinkingSummary = entry.thinking
        ? truncateText(entry.thinking, MAX_THINKING_SUMMARY_LEN)
        : undefined;
      const errorMessage =
        type === 'ERROR_MESSAGE' || status === 'ERROR'
          ? extractErrorString(entry.error, entry.content)
          : undefined;

      // Skip completely empty non-error tool-free turns
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

  // Fallback to transcript_full.jsonl only when needed
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

  return {
    steps: latestSteps,
    currentFocus,
    tokens: finalizeTokenUsage(inputTokens, cacheReadTokens, outputTokens),
    models: Array.from(modelSet),
    hasPendingQuestion,
    pendingQuestionText: hasPendingQuestion ? pendingQuestionText : null,
    hasError,
    lastError: hasError ? lastSubstantiveError : null,
    timeline: timeline.length > MAX_TIMELINE_TURNS ? timeline.slice(-MAX_TIMELINE_TURNS) : timeline,
  };
}

export function parseTranscriptFile(transcriptPath: string): ParsedTranscript {
  const content = fs.readFileSync(transcriptPath, 'utf8');
  const fullPath = path.join(path.dirname(transcriptPath), 'transcript_full.jsonl');
  const resolvedFullPath = fs.existsSync(fullPath) ? fullPath : null;
  return parseTranscriptContent(content, resolvedFullPath);
}
