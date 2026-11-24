import { useEffect, useState } from 'react';
import type {
  ArtifactContentResponse,
  ArtifactInfo,
  ConversationDetail,
  StepItem,
  SubagentInfo,
  TimelineTurn,
} from '@shared/types';
import {
  AlertCircle,
  AlertTriangle,
  Bot,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Code2,
  Compass,
  Copy,
  Cpu,
  FileCheck2,
  FileText,
  GitBranch,
  HelpCircle,
  Loader2,
  MessageSquare,
  MinusCircle,
  Network,
  Target,
  Terminal,
  User,
  Users,
  Wrench,
  XCircle,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchArtifactContent } from '../../api';
import type { Dictionary, Locale } from '../../i18n';
import {
  copyToClipboard,
  formatCompactNumber,
  formatDateTime,
  formatExactNumber,
  formatPercent,
  formatRelativeTime,
  shortModelName,
} from '../../utils';
import { LivePulseDot, SwarmStateBadge } from '../badges';

/* ==================== 1. Overview Tab ==================== */

function StepIcon({ status }: { status: StepItem['status'] }) {
  switch (status) {
    case 'done':
      return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />;
    case 'in_progress':
      return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-sky-500" />;
    case 'failed':
      return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />;
    case 'skipped':
      return <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-400" />;
    default:
      return <Circle className="mt-0.5 h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" />;
  }
}

export function OverviewTab({
  detail,
  locale,
  t,
}: {
  detail: ConversationDetail;
  locale: Locale;
  t: Dictionary;
}) {
  const { tokens } = detail;
  const totalTok = Math.max(1, tokens.inputTokens + tokens.cacheReadTokens + tokens.outputTokens);
  const inputPct = Math.round((tokens.inputTokens / totalTok) * 100);
  const cachePct = Math.round((tokens.cacheReadTokens / totalTok) * 100);
  const outputPct = Math.max(0, 100 - inputPct - cachePct);
  const progressPct =
    detail.stepsTotal > 0
      ? Math.round((detail.stepsCompleted / detail.stepsTotal) * 100)
      : 0;

  return (
    <div className="space-y-4">
      {/* High-priority Alert Callouts */}
      {detail.lastError && (
        <div className="rounded-lg border border-rose-200 bg-rose-50/75 p-3 dark:border-rose-500/30 dark:bg-rose-500/10">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-rose-700 dark:text-rose-300">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{t.drawer.overview.lastErrorTitle}</span>
          </div>
          <p className="mt-1 font-mono text-[11.5px] leading-relaxed break-words whitespace-pre-wrap text-rose-800 dark:text-rose-200">
            {detail.lastError}
          </p>
        </div>
      )}

      {detail.pendingQuestionText && (
        <div className="rounded-lg border border-amber-200 bg-amber-50/75 p-3 dark:border-amber-500/30 dark:bg-amber-500/10">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-800 dark:text-amber-300">
            <HelpCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{t.drawer.overview.pendingQuestionTitle}</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed whitespace-pre-wrap text-amber-900 dark:text-amber-100">
            {detail.pendingQuestionText}
          </p>
        </div>
      )}

      {/* Current Focus */}
      <section className="rounded-lg border border-zinc-200/80 bg-zinc-50/60 p-3.5 dark:border-[#222733] dark:bg-[#0F1218]">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
          <Compass className="h-3.5 w-3.5 text-sky-500" />
          <span>{t.drawer.overview.currentFocus}</span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-zinc-800 dark:text-zinc-200">
          {detail.currentFocus || (
            <span className="text-zinc-400 dark:text-zinc-500">
              {t.drawer.overview.noFocus}
            </span>
          )}
        </p>
      </section>

      {/* Steps Checklist */}
      <section className="rounded-lg border border-zinc-200/80 bg-white p-3.5 dark:border-[#222733] dark:bg-[#13161D]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            {t.drawer.overview.checklist}
          </span>
          {detail.stepsTotal > 0 && (
            <span className="tabular-nums font-mono text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              {detail.stepsCompleted} / {detail.stepsTotal} ({progressPct}%)
            </span>
          )}
        </div>

        {detail.steps.length > 0 ? (
          <>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-[#1E2330]">
              <div
                className={`h-full rounded-full transition-all ${
                  progressPct === 100 ? 'bg-emerald-500' : 'bg-sky-500'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <ul className="mt-3 space-y-2">
              {detail.steps.map((step, idx) => (
                <li
                  key={`${idx}-${step.title}`}
                  className={`flex items-start gap-2 rounded-md px-2 py-1.5 text-xs ${
                    step.status === 'in_progress'
                      ? 'bg-sky-50/70 text-zinc-900 dark:bg-sky-500/10 dark:text-zinc-100'
                      : step.status === 'failed'
                        ? 'bg-rose-50/70 text-rose-800 dark:bg-rose-500/10 dark:text-rose-200'
                        : step.status === 'done'
                          ? 'text-zinc-500 dark:text-zinc-400'
                          : 'text-zinc-700 dark:text-zinc-300'
                  }`}
                >
                  <StepIcon status={step.status} />
                  <span className={step.status === 'skipped' ? 'line-through opacity-70' : ''}>
                    {step.title}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
            {t.drawer.overview.noChecklist}
          </p>
        )}
      </section>

      {/* Token & Model Breakdown */}
      <section className="rounded-lg border border-zinc-200/80 bg-white p-3.5 dark:border-[#222733] dark:bg-[#13161D]">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            <Cpu className="h-3.5 w-3.5 text-zinc-400" />
            {t.drawer.overview.tokenBreakdown}
          </span>
          {tokens.totalTokens > 0 && (
            <span className="tabular-nums rounded bg-emerald-50 px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
              {t.drawer.overview.cacheHitRate} {formatPercent(tokens.cacheHitRate)}
            </span>
          )}
        </div>

        {tokens.totalTokens > 0 ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-md border border-zinc-100 bg-zinc-50/70 p-2 dark:border-[#1E2330] dark:bg-[#0F1218]">
                <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">
                  {t.drawer.overview.inputTokens}
                </div>
                <div
                  className="tabular-nums mt-0.5 font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                  title={formatExactNumber(tokens.inputTokens)}
                >
                  {formatCompactNumber(tokens.inputTokens)}
                </div>
              </div>
              <div className="rounded-md border border-zinc-100 bg-zinc-50/70 p-2 dark:border-[#1E2330] dark:bg-[#0F1218]">
                <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">
                  {t.drawer.overview.cacheReadTokens}
                </div>
                <div
                  className="tabular-nums mt-0.5 font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400"
                  title={formatExactNumber(tokens.cacheReadTokens)}
                >
                  {formatCompactNumber(tokens.cacheReadTokens)}
                </div>
              </div>
              <div className="rounded-md border border-zinc-100 bg-zinc-50/70 p-2 dark:border-[#1E2330] dark:bg-[#0F1218]">
                <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">
                  {t.drawer.overview.outputTokens}
                </div>
                <div
                  className="tabular-nums mt-0.5 font-mono text-sm font-semibold text-sky-600 dark:text-sky-400"
                  title={formatExactNumber(tokens.outputTokens)}
                >
                  {formatCompactNumber(tokens.outputTokens)}
                </div>
              </div>
              <div className="rounded-md border border-zinc-100 bg-zinc-50/70 p-2 dark:border-[#1E2330] dark:bg-[#0F1218]">
                <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">
                  {t.drawer.overview.totalTokens}
                </div>
                <div
                  className="tabular-nums mt-0.5 font-mono text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                  title={formatExactNumber(tokens.totalTokens)}
                >
                  {formatCompactNumber(tokens.totalTokens)}
                </div>
              </div>
            </div>

            {/* Stacked Ratio Bar */}
            <div className="mt-2.5 flex h-1.5 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-[#1E2330]">
              <div
                className="bg-zinc-500 dark:bg-zinc-400"
                style={{ width: `${inputPct}%` }}
                title={`${t.drawer.overview.inputTokens}: ${inputPct}%`}
              />
              <div
                className="bg-emerald-500"
                style={{ width: `${cachePct}%` }}
                title={`${t.drawer.overview.cacheReadTokens}: ${cachePct}%`}
              />
              <div
                className="bg-sky-500"
                style={{ width: `${outputPct}%` }}
                title={`${t.drawer.overview.outputTokens}: ${outputPct}%`}
              />
            </div>

            {detail.models.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  {t.drawer.overview.modelsUsed}:
                </span>
                {detail.models.map((m) => (
                  <span
                    key={m}
                    className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10.5px] text-zinc-700 dark:bg-[#1B202C] dark:text-zinc-300"
                  >
                    {shortModelName(m)}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="mt-2 text-xs text-zinc-400 dark:text-zinc-500">
            {t.drawer.overview.noTokenData}
          </p>
        )}
      </section>

      {/* Latest Preview & Timestamps */}
      {detail.preview && (
        <section className="rounded-lg border border-zinc-200/80 bg-white p-3.5 dark:border-[#222733] dark:bg-[#13161D]">
          <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            {t.drawer.overview.latestPreview}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap text-zinc-600 dark:text-zinc-400">
            {detail.preview}
          </p>
        </section>
      )}

      <section className="rounded-lg border border-zinc-200/80 bg-white p-3.5 dark:border-[#222733] dark:bg-[#13161D]">
        <div className="text-xs font-semibold text-zinc-800 dark:text-zinc-200">
          {t.drawer.overview.metadata}
        </div>
        <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <dt className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {t.drawer.overview.createdOrModified}
            </dt>
            <dd className="tabular-nums mt-0.5 font-mono text-[11.5px] text-zinc-700 dark:text-zinc-300">
              {formatDateTime(detail.lastModifiedAt, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {t.drawer.overview.lastUserInput}
            </dt>
            <dd className="tabular-nums mt-0.5 font-mono text-[11.5px] text-zinc-700 dark:text-zinc-300">
              {detail.lastUserInputAt
                ? formatDateTime(detail.lastUserInputAt, locale)
                : t.drawer.overview.never}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {t.drawer.overview.lastReviewed}
            </dt>
            <dd className="tabular-nums mt-0.5 font-mono text-[11.5px] text-zinc-700 dark:text-zinc-300">
              {detail.overlay.reviewedAt
                ? formatDateTime(detail.overlay.reviewedAt, locale)
                : t.drawer.overview.never}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-zinc-400 dark:text-zinc-500">
              {t.drawer.overview.stepCount}
            </dt>
            <dd className="tabular-nums mt-0.5 font-mono text-[11.5px] text-zinc-700 dark:text-zinc-300">
              {detail.stepCount}
            </dd>
          </div>
        </dl>

        {detail.sideQuestions.length > 0 && (
          <div className="mt-3 border-t border-zinc-100 pt-2.5 dark:border-[#1E2330]">
            <div className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              {t.drawer.overview.sideQuestionsTitle} ({detail.sideQuestions.length})
            </div>
            <ul className="mt-1.5 space-y-1">
              {detail.sideQuestions.map((sq) => (
                <li
                  key={sq.id}
                  className="flex items-center justify-between gap-2 text-[11.5px] text-zinc-600 dark:text-zinc-300"
                >
                  <span className="truncate">{sq.title || sq.id}</span>
                  <span className="shrink-0 font-mono text-[10px] text-zinc-400">
                    {sq.id.slice(0, 8)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}

/* ==================== 2. Swarm & Subagents Tab ==================== */

function SubagentTreeNode({
  node,
  depth = 0,
  t,
}: {
  node: SubagentInfo;
  depth?: number;
  t: Dictionary;
}) {
  return (
    <div style={{ marginLeft: depth > 0 ? 16 : 0 }} className="mt-2">
      <div className="rounded-lg border border-zinc-200/80 bg-zinc-50/60 p-2.5 dark:border-[#222733] dark:bg-[#0F1218]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {node.isRunning ? (
              <LivePulseDot />
            ) : (
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  node.state === 'alive'
                    ? 'bg-sky-500'
                    : node.state === 'killed'
                      ? 'bg-zinc-400/50'
                      : 'bg-zinc-400'
                }`}
              />
            )}
            <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-zinc-800 ring-1 ring-zinc-200/80 dark:bg-[#181C25] dark:text-zinc-200 dark:ring-[#2A3040]">
              {node.typeName || node.role || 'subagent'}
            </span>
            <span className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
              {node.title || node.conversationId.slice(0, 8)}
            </span>
          </div>
          <div className="tabular-nums flex shrink-0 items-center gap-2 text-[10.5px] text-zinc-400">
            <span>
              {node.stepCount} {t.card.steps}
            </span>
            <span>{formatRelativeTime(node.lastModifiedAt, t)}</span>
          </div>
        </div>
      </div>
      {node.children.map((child) => (
        <SubagentTreeNode key={child.conversationId} node={child} depth={depth + 1} t={t} />
      ))}
    </div>
  );
}

export function AgentsTab({
  detail,
  t,
}: {
  detail: ConversationDetail;
  t: Dictionary;
}) {
  const swarm = detail.swarmDetail;
  const hasAny = Boolean(swarm) || detail.subagents.length > 0;

  if (!hasAny) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 py-14 text-center text-xs text-zinc-400 dark:border-[#222733] dark:text-zinc-500">
        {t.drawer.agents.noAgents}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {swarm && (
        <>
          {/* Swarm Goal */}
          <section className="rounded-lg border border-zinc-200/80 bg-zinc-50/60 p-3.5 dark:border-[#222733] dark:bg-[#0F1218]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                <Network className="h-3.5 w-3.5 text-sky-500" />
                <span>{swarm.title || t.drawer.agents.swarmTitle}</span>
              </div>
              <span className="font-mono text-[10.5px] text-zinc-400">
                {swarm.swarmId.slice(0, 8)}
              </span>
            </div>
            {(swarm.goalTitle || swarm.goalLine) && (
              <div className="mt-2 border-t border-zinc-200/70 pt-2 dark:border-[#222733]">
                <div className="flex items-center gap-1 text-[10.5px] font-semibold text-zinc-500 uppercase dark:text-zinc-400">
                  <Target className="h-3 w-3 text-sky-500" />
                  <span>{t.drawer.agents.swarmGoal}</span>
                </div>
                {swarm.goalTitle && (
                  <div className="mt-1 text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {swarm.goalTitle}
                  </div>
                )}
                {swarm.goalLine && (
                  <p className="mt-0.5 text-xs leading-relaxed text-zinc-600 dark:text-zinc-400">
                    {swarm.goalLine}
                  </p>
                )}
              </div>
            )}
          </section>

          {/* Threads */}
          {swarm.threads.length > 0 && (
            <section className="rounded-lg border border-zinc-200/80 bg-white p-3.5 dark:border-[#222733] dark:bg-[#13161D]">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                <GitBranch className="h-3.5 w-3.5 text-zinc-400" />
                <span>{t.drawer.agents.threadsTitle}</span>
              </div>
              <div className="mt-2.5 space-y-2">
                {swarm.threads.map((thread) => (
                  <div
                    key={thread.id}
                    className="rounded-md border border-zinc-100 bg-zinc-50/70 p-2.5 dark:border-[#1E2330] dark:bg-[#0F1218]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-zinc-200/70 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-700 dark:bg-[#1E2330] dark:text-zinc-300">
                        {thread.id}
                      </span>
                      <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                        {thread.title}
                      </span>
                    </div>
                    {thread.goal && (
                      <p className="mt-1 text-[11.5px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                        {thread.goal}
                      </p>
                    )}
                    {thread.tasks.length > 0 && (
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-zinc-500 dark:text-zinc-400">
                        {thread.tasks.map((task, idx) => (
                          <li key={idx}>{task}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Worker Roster Table */}
          {swarm.members.length > 0 && (
            <section className="overflow-hidden rounded-lg border border-zinc-200/80 bg-white dark:border-[#222733] dark:bg-[#13161D]">
              <div className="border-b border-zinc-100 px-3.5 py-2.5 text-xs font-semibold text-zinc-800 dark:border-[#1E2330] dark:text-zinc-200">
                {t.drawer.agents.rosterTitle} ({swarm.members.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-zinc-100 bg-zinc-50/70 text-[10.5px] font-medium text-zinc-500 uppercase dark:border-[#1E2330] dark:bg-[#0F1218] dark:text-zinc-400">
                      <th className="py-2 pl-3.5 pr-2">{t.drawer.agents.memberName}</th>
                      <th className="py-2 pr-2">{t.drawer.agents.memberState}</th>
                      <th className="py-2 pr-2">{t.drawer.agents.memberModel}</th>
                      <th className="py-2 pr-3.5">{t.drawer.agents.memberTask}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-[#1D222E]">
                    {swarm.members.map((m) => (
                      <tr key={m.conversationId || m.name}>
                        <td className="py-2 pl-3.5 pr-2 font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                          @{m.name}
                          {m.role === 'coordinator' && (
                            <span className="ml-1.5 rounded bg-zinc-900 px-1 py-0.5 text-[9px] text-white uppercase dark:bg-zinc-200 dark:text-zinc-900">
                              coord
                            </span>
                          )}
                        </td>
                        <td className="py-2 pr-2">
                          <SwarmStateBadge
                            state={m.state}
                            isRunning={m.isRunning}
                            t={t}
                          />
                        </td>
                        <td className="py-2 pr-2 font-mono text-[11px] text-zinc-500 dark:text-zinc-400">
                          {m.model ? shortModelName(m.model) : '—'}
                        </td>
                        <td className="max-w-[240px] truncate py-2 pr-3.5 text-[11.5px] text-zinc-600 dark:text-zinc-400">
                          {m.task || m.phase || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Board Messages Feed */}
          <section className="rounded-lg border border-zinc-200/80 bg-white p-3.5 dark:border-[#222733] dark:bg-[#13161D]">
            <div className="mb-2.5 flex items-center justify-between text-xs font-semibold text-zinc-800 dark:text-zinc-200">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-zinc-400" />
                {t.drawer.agents.boardTitle}
              </span>
              <span className="tabular-nums font-normal text-zinc-400">
                {swarm.messages.length}
              </span>
            </div>
            {swarm.messages.length === 0 ? (
              <p className="text-xs text-zinc-400">{t.drawer.agents.noBoardMessages}</p>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {swarm.messages.map((msg) => (
                  <div
                    key={msg.seq}
                    className="rounded-md border border-zinc-100 bg-zinc-50/70 p-2.5 dark:border-[#1E2330] dark:bg-[#0F1218]"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="tabular-nums font-mono text-zinc-400">
                          #{msg.seq}
                        </span>
                        <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-zinc-800 ring-1 ring-zinc-200/80 dark:bg-[#181C25] dark:text-zinc-200 dark:ring-[#2A3040]">
                          @{msg.agent}
                        </span>
                        {msg.kind && (
                          <span className="rounded bg-zinc-200/60 px-1 py-0.5 text-[9.5px] text-zinc-500 dark:bg-[#1E2330] dark:text-zinc-400">
                            {msg.kind}
                          </span>
                        )}
                      </div>
                      <span className="tabular-nums font-mono text-[10px] text-zinc-400">
                        {msg.time}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed break-words whitespace-pre-wrap text-zinc-700 dark:text-zinc-300">
                      {msg.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {/* Subagent Tree */}
      {detail.subagents.length > 0 && (
        <section className="rounded-lg border border-zinc-200/80 bg-white p-3.5 dark:border-[#222733] dark:bg-[#13161D]">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
            <Users className="h-3.5 w-3.5 text-zinc-400" />
            <span>
              {t.drawer.agents.subagentsTitle} ({detail.subagentCount})
            </span>
          </div>
          <div className="mt-1">
            {detail.subagents.map((sub) => (
              <SubagentTreeNode key={sub.conversationId} node={sub} t={t} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/* ==================== 3. Artifacts Tab ==================== */

export function ArtifactsTab({
  conversationId,
  artifacts,
  locale,
  t,
}: {
  conversationId: string;
  artifacts: ArtifactInfo[];
  locale: Locale;
  t: Dictionary;
}) {
  const [selectedFile, setSelectedFile] = useState<string | null>(
    artifacts[0]?.relativePath ?? null,
  );
  const [contentRes, setContentRes] = useState<ArtifactContentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rawMode, setRawMode] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (artifacts.length === 0) {
      setSelectedFile(null);
      setContentRes(null);
      return;
    }
    const stillExists = artifacts.some((a) => a.relativePath === selectedFile);
    if (!stillExists) {
      setSelectedFile(artifacts[0].relativePath);
    }
  }, [artifacts, selectedFile]);

  useEffect(() => {
    if (!selectedFile) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchArtifactContent(conversationId, selectedFile)
      .then((res) => {
        if (!cancelled) setContentRes(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : t.drawer.artifacts.loadError);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId, selectedFile, t.drawer.artifacts.loadError]);

  if (artifacts.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 py-14 text-center text-xs text-zinc-400 dark:border-[#222733] dark:text-zinc-500">
        {t.drawer.artifacts.empty}
      </div>
    );
  }

  const handleCopy = async () => {
    if (!contentRes) return;
    const ok = await copyToClipboard(contentRes.content);
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[240px_1fr]">
      {/* Artifact List */}
      <div className="space-y-1.5">
        <div className="text-[11px] font-semibold text-zinc-500 uppercase dark:text-zinc-400">
          {t.drawer.artifacts.listTitle} ({artifacts.length})
        </div>
        {artifacts.map((art) => {
          const active = selectedFile === art.relativePath;
          return (
            <button
              key={art.relativePath}
              type="button"
              onClick={() => setSelectedFile(art.relativePath)}
              className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                active
                  ? 'border-sky-500/70 bg-sky-50/70 dark:border-sky-400/50 dark:bg-sky-500/10'
                  : 'border-zinc-200/80 bg-white hover:border-zinc-300 dark:border-[#222733] dark:bg-[#13161D] dark:hover:border-[#343C4F]'
              }`}
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
                  <span className="truncate font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                    {art.fileName}
                  </span>
                </div>
                {art.requestFeedback && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                    <FileCheck2 className="h-2.5 w-2.5" />
                    {t.drawer.artifacts.requestFeedback}
                  </span>
                )}
              </div>
              {art.summary && (
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-zinc-500 dark:text-zinc-400">
                  {art.summary}
                </p>
              )}
              <div className="tabular-nums mt-1.5 flex items-center justify-between text-[10px] text-zinc-400">
                <span>{art.updatedAt ? formatDateTime(art.updatedAt, locale) : '—'}</span>
                <span className="font-mono">
                  {art.sizeBytes > 1024
                    ? `${(art.sizeBytes / 1024).toFixed(1)} KB`
                    : `${art.sizeBytes} B`}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Inline Markdown Viewer */}
      <div className="flex min-h-[340px] flex-col overflow-hidden rounded-lg border border-zinc-200/80 bg-white dark:border-[#222733] dark:bg-[#13161D]">
        {!selectedFile ? (
          <div className="flex flex-1 items-center justify-center p-6 text-xs text-zinc-400">
            {t.drawer.artifacts.selectPrompt}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 bg-zinc-50/70 px-3.5 py-2 dark:border-[#1E2330] dark:bg-[#0F1218]">
              <span className="truncate font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                {selectedFile}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRawMode((v) => !v)}
                  className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:text-zinc-900 dark:border-[#2A3040] dark:bg-[#181C25] dark:text-zinc-300"
                >
                  <Code2 className="h-3 w-3" />
                  <span>
                    {rawMode
                      ? t.drawer.artifacts.renderedToggle
                      : t.drawer.artifacts.rawToggle}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={handleCopy}
                  disabled={!contentRes}
                  className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-600 hover:text-zinc-900 disabled:opacity-40 dark:border-[#2A3040] dark:bg-[#181C25] dark:text-zinc-300"
                >
                  {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
                  <span>{copied ? t.drawer.copied : t.drawer.artifacts.copyContent}</span>
                </button>
              </div>
            </div>

            {contentRes?.truncated && (
              <div className="flex items-center gap-1.5 border-b border-amber-200/70 bg-amber-50/70 px-3.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>{t.drawer.artifacts.truncatedNotice}</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="flex items-center gap-2 py-8 text-xs text-zinc-400">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t.drawer.artifacts.loading}</span>
                </div>
              ) : error ? (
                <div className="rounded-md border border-rose-200 bg-rose-50/70 p-3 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
                  {t.drawer.artifacts.loadError}: {error}
                </div>
              ) : contentRes ? (
                rawMode ? (
                  <pre className="overflow-x-auto font-mono text-xs leading-relaxed whitespace-pre-wrap text-zinc-800 dark:text-zinc-200">
                    {contentRes.content}
                  </pre>
                ) : (
                  <div className="agmb-prose text-zinc-800 dark:text-zinc-200">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {contentRes.content}
                    </ReactMarkdown>
                  </div>
                )
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ==================== 4. Timeline Tab ==================== */

function classifyTurnRole(turn: TimelineTurn): 'user' | 'assistant' | 'error' | 'system' {
  const typeU = turn.type.toUpperCase();
  const srcU = turn.source.toUpperCase();
  if (turn.errorMessage || typeU.includes('ERROR') || turn.status.toUpperCase() === 'ERROR') {
    return 'error';
  }
  if (typeU.includes('USER') || srcU.includes('USER')) return 'user';
  if (typeU.includes('PLANNER') || srcU.includes('MODEL') || srcU.includes('ASSISTANT')) {
    return 'assistant';
  }
  return 'system';
}

function TimelineTurnCard({
  turn,
  locale,
  t,
}: {
  turn: TimelineTurn;
  locale: Locale;
  t: Dictionary;
}) {
  const [expanded, setExpanded] = useState(false);
  const [showThinking, setShowThinking] = useState(false);
  const role = classifyTurnRole(turn);
  const body = turn.errorMessage || turn.text || '';
  const isLong = body.length > 360;
  const visibleBody = isLong && !expanded ? `${body.slice(0, 360)}…` : body;

  const roleConfig = {
    user: {
      label: t.drawer.timeline.roleUser,
      Icon: User,
      badge:
        'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/25',
      border: 'border-zinc-200/80 dark:border-[#222733]',
    },
    assistant: {
      label: t.drawer.timeline.roleAssistant,
      Icon: Bot,
      badge:
        'bg-zinc-100 text-zinc-700 ring-zinc-500/15 dark:bg-[#1D222E] dark:text-zinc-300 dark:ring-zinc-600/30',
      border: 'border-zinc-200/80 dark:border-[#222733]',
    },
    error: {
      label: t.drawer.timeline.roleError,
      Icon: AlertCircle,
      badge:
        'bg-rose-50 text-rose-700 ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25',
      border: 'border-rose-200/90 dark:border-rose-500/30',
    },
    system: {
      label: t.drawer.timeline.roleSystem,
      Icon: Terminal,
      badge:
        'bg-zinc-100 text-zinc-500 ring-zinc-500/15 dark:bg-[#181C25] dark:text-zinc-400 dark:ring-zinc-700/30',
      border: 'border-zinc-200/70 dark:border-[#1E2330]',
    },
  }[role];

  const Icon = roleConfig.Icon;

  return (
    <div
      className={`rounded-lg border bg-white p-3 dark:bg-[#13161D] ${roleConfig.border}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-semibold ring-1 ring-inset ${roleConfig.badge}`}
          >
            <Icon className="h-3 w-3" />
            <span>{roleConfig.label}</span>
          </span>
          <span className="tabular-nums font-mono text-[10.5px] text-zinc-400">
            {t.drawer.timeline.stepIndex(turn.stepIndex)}
          </span>
          {turn.model && (
            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:bg-[#1B202C] dark:text-zinc-400">
              {shortModelName(turn.model)}
            </span>
          )}
        </div>
        <span className="tabular-nums font-mono text-[10.5px] text-zinc-400">
          {formatDateTime(turn.createdAt, locale)}
        </span>
      </div>

      {/* Tool Call Tags */}
      {turn.toolNames.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Wrench className="h-3 w-3 text-zinc-400" />
          {turn.toolNames.map((tool, i) => (
            <span
              key={`${tool}-${i}`}
              className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-[#1B202C] dark:text-zinc-300"
            >
              {tool}
            </span>
          ))}
        </div>
      )}

      {/* Optional Thinking Summary */}
      {turn.thinkingSummary && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowThinking((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
          >
            {showThinking ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>{t.drawer.timeline.thinking}</span>
          </button>
          {showThinking && (
            <p className="mt-1 rounded bg-zinc-50 p-2 text-[11px] leading-relaxed whitespace-pre-wrap text-zinc-500 dark:bg-[#0F1218] dark:text-zinc-400">
              {turn.thinkingSummary}
            </p>
          )}
        </div>
      )}

      {/* Main Text */}
      {visibleBody && (
        <p
          className={`mt-2 text-xs leading-relaxed break-words whitespace-pre-wrap ${
            role === 'error'
              ? 'font-mono text-rose-700 dark:text-rose-300'
              : 'text-zinc-700 dark:text-zinc-300'
          }`}
        >
          {visibleBody}
        </p>
      )}

      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[11px] font-medium text-sky-600 hover:underline dark:text-sky-400"
        >
          {expanded ? t.drawer.timeline.collapse : t.drawer.timeline.expand}
        </button>
      )}
    </div>
  );
}

export function TimelineTab({
  timeline,
  locale,
  t,
}: {
  timeline: TimelineTurn[];
  locale: Locale;
  t: Dictionary;
}) {
  if (timeline.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-zinc-200 py-14 text-center text-xs text-zinc-400 dark:border-[#222733] dark:text-zinc-500">
        {t.drawer.timeline.empty}
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {timeline.map((turn, idx) => (
        <TimelineTurnCard
          key={`${turn.stepIndex}-${idx}`}
          turn={turn}
          locale={locale}
          t={t}
        />
      ))}
    </div>
  );
}
