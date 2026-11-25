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
import { PushForwardComposer } from '../PushForwardComposer';

/* ==================== 1. Overview Tab ==================== */

function StepIcon({ status }: { status: StepItem['status'] }) {
  switch (status) {
    case 'done':
      return <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#16A34A] dark:text-[#22C55E]" />;
    case 'in_progress':
      return <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[#1C1917] dark:text-[#F2F1EE]" />;
    case 'failed':
      return <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#DC2626] dark:text-[#EF4444]" />;
    case 'skipped':
      return <MinusCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#A8A29E] dark:text-[#666560]" />;
    default:
      return <Circle className="mt-0.5 h-4 w-4 shrink-0 text-[#D6D3D1] dark:text-[#44433F]" />;
  }
}

export function OverviewTab({
  detail,
  onDispatched,
  onDispatchError,
  locale,
  t,
}: {
  detail: ConversationDetail;
  onDispatched?: (message: string) => void;
  onDispatchError?: (message: string) => void;
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
    <div className="space-y-3.5">
      {/* Alert Callouts */}
      {detail.lastError && (
        <div className="rounded-xl border border-[#DC2626]/25 bg-[#FEF2F2]/80 p-3 dark:border-[#EF4444]/25 dark:bg-[#2A1616]/70">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#B91C1C] dark:text-[#FCA5A5]">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{t.drawer.overview.lastErrorTitle}</span>
          </div>
          <p className="mt-1 font-mono text-[11.5px] leading-relaxed break-words whitespace-pre-wrap text-[#991B1B] dark:text-[#FECACA]">
            {detail.lastError}
          </p>
        </div>
      )}

      {detail.pendingQuestionText && (
        <div className="rounded-xl border border-[#D97706]/25 bg-[#FFFBEB]/80 p-3 dark:border-[#F59E0B]/25 dark:bg-[#261E12]/70">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#92400E] dark:text-[#FCD34D]">
            <HelpCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{t.drawer.overview.pendingQuestionTitle}</span>
          </div>
          <p className="mt-1 text-xs leading-relaxed whitespace-pre-wrap text-[#78350F] dark:text-[#FEF3C7]">
            {detail.pendingQuestionText}
          </p>
        </div>
      )}

      {/* Current Focus */}
      <section className="rounded-xl border border-[#1C1917]/[0.07] bg-white p-3.5 dark:border-white/[0.065] dark:bg-[#191917]">
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wider text-[#8C867E] uppercase dark:text-[#6E6D68]">
          <Compass className="h-3.5 w-3.5" />
          <span>{t.drawer.overview.currentFocus}</span>
        </div>
        <p className="mt-1.5 text-xs leading-relaxed text-[#1C1917] dark:text-[#E7E5E0]">
          {detail.currentFocus || (
            <span className="text-[#969088] dark:text-[#666560]">
              {t.drawer.overview.noFocus}
            </span>
          )}
        </p>
      </section>

      {/* Quick Push-Forward Composer */}
      <section className="rounded-xl border border-[#1C1917]/[0.07] bg-white p-3.5 dark:border-white/[0.065] dark:bg-[#191917]">
        <div className="mb-2 text-[10.5px] font-semibold tracking-wider text-[#8C867E] uppercase dark:text-[#6E6D68]">
          {t.widget.pushTitle}
        </div>
        <PushForwardComposer
          conversationId={detail.id}
          onDispatched={(msg) => onDispatched?.(msg)}
          onError={(msg) => onDispatchError?.(msg)}
          t={t}
        />
      </section>

      {/* Steps Checklist */}
      <section className="rounded-xl border border-[#1C1917]/[0.07] bg-white p-3.5 dark:border-white/[0.065] dark:bg-[#191917]">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
            {t.drawer.overview.checklist}
          </span>
          {detail.stepsTotal > 0 && (
            <span className="tabular-nums font-mono text-[11px] font-medium text-[#78716C] dark:text-[#8C8B85]">
              {detail.stepsCompleted} / {detail.stepsTotal} ({progressPct}%)
            </span>
          )}
        </div>

        {detail.steps.length > 0 ? (
          <>
            <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-[#1C1917]/[0.08] dark:bg-white/[0.08]">
              <div
                className={`h-full rounded-full transition-all ${
                  progressPct === 100
                    ? 'bg-[#16A34A] dark:bg-[#22C55E]'
                    : 'bg-[#1C1917] dark:bg-[#E7E5E0]'
                }`}
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <ul className="mt-3 space-y-1.5">
              {detail.steps.map((step, idx) => (
                <li
                  key={`${idx}-${step.title}`}
                  className={`flex items-start gap-2 rounded-lg px-2 py-1.5 text-xs ${
                    step.status === 'in_progress'
                      ? 'bg-[#F6F5F1] font-medium text-[#1C1917] dark:bg-[#232320] dark:text-[#F2F1EE]'
                      : step.status === 'failed'
                        ? 'bg-[#FEF2F2]/70 text-[#B91C1C] dark:bg-[#2A1616]/60 dark:text-[#FCA5A5]'
                        : step.status === 'done'
                          ? 'text-[#78716C] dark:text-[#8C8B85]'
                          : 'text-[#44403C] dark:text-[#D6D3CD]'
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
          <p className="mt-2 text-xs text-[#969088] dark:text-[#666560]">
            {t.drawer.overview.noChecklist}
          </p>
        )}
      </section>

      {/* Token & Model Breakdown */}
      <section className="rounded-xl border border-[#1C1917]/[0.07] bg-white p-3.5 dark:border-white/[0.065] dark:bg-[#191917]">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-xs font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
            <Cpu className="h-3.5 w-3.5 text-[#8C867E]" />
            {t.drawer.overview.tokenBreakdown}
          </span>
          {tokens.totalTokens > 0 && (
            <span className="tabular-nums font-mono text-[11px] font-medium text-[#15803D] dark:text-[#4ADE80]">
              {t.drawer.overview.cacheHitRate} {formatPercent(tokens.cacheHitRate)}
            </span>
          )}
        </div>

        {tokens.totalTokens > 0 ? (
          <>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-[#1C1917]/[0.06] bg-[#FAF9F6] p-2 dark:border-white/[0.055] dark:bg-[#141413]">
                <div className="text-[10.5px] text-[#8C867E] dark:text-[#787771]">
                  {t.drawer.overview.inputTokens}
                </div>
                <div
                  className="tabular-nums mt-0.5 font-mono text-sm font-semibold text-[#1C1917] dark:text-[#F2F1EE]"
                  title={formatExactNumber(tokens.inputTokens)}
                >
                  {formatCompactNumber(tokens.inputTokens)}
                </div>
              </div>
              <div className="rounded-lg border border-[#1C1917]/[0.06] bg-[#FAF9F6] p-2 dark:border-white/[0.055] dark:bg-[#141413]">
                <div className="text-[10.5px] text-[#8C867E] dark:text-[#787771]">
                  {t.drawer.overview.cacheReadTokens}
                </div>
                <div
                  className="tabular-nums mt-0.5 font-mono text-sm font-semibold text-[#15803D] dark:text-[#4ADE80]"
                  title={formatExactNumber(tokens.cacheReadTokens)}
                >
                  {formatCompactNumber(tokens.cacheReadTokens)}
                </div>
              </div>
              <div className="rounded-lg border border-[#1C1917]/[0.06] bg-[#FAF9F6] p-2 dark:border-white/[0.055] dark:bg-[#141413]">
                <div className="text-[10.5px] text-[#8C867E] dark:text-[#787771]">
                  {t.drawer.overview.outputTokens}
                </div>
                <div
                  className="tabular-nums mt-0.5 font-mono text-sm font-semibold text-[#44403C] dark:text-[#D6D3CD]"
                  title={formatExactNumber(tokens.outputTokens)}
                >
                  {formatCompactNumber(tokens.outputTokens)}
                </div>
              </div>
              <div className="rounded-lg border border-[#1C1917]/[0.06] bg-[#FAF9F6] p-2 dark:border-white/[0.055] dark:bg-[#141413]">
                <div className="text-[10.5px] text-[#8C867E] dark:text-[#787771]">
                  {t.drawer.overview.totalTokens}
                </div>
                <div
                  className="tabular-nums mt-0.5 font-mono text-sm font-semibold text-[#1C1917] dark:text-[#F2F1EE]"
                  title={formatExactNumber(tokens.totalTokens)}
                >
                  {formatCompactNumber(tokens.totalTokens)}
                </div>
              </div>
            </div>

            {/* Restrained Stacked Ratio Bar */}
            <div className="mt-2.5 flex h-[3px] w-full overflow-hidden rounded-full bg-[#1C1917]/[0.08] dark:bg-white/[0.08]">
              <div
                className="bg-[#78716C] dark:bg-[#8C8B85]"
                style={{ width: `${inputPct}%` }}
                title={`${t.drawer.overview.inputTokens}: ${inputPct}%`}
              />
              <div
                className="bg-[#16A34A] dark:bg-[#22C55E]"
                style={{ width: `${cachePct}%` }}
                title={`${t.drawer.overview.cacheReadTokens}: ${cachePct}%`}
              />
              <div
                className="bg-[#1C1917] dark:bg-[#F2F1EE]"
                style={{ width: `${outputPct}%` }}
                title={`${t.drawer.overview.outputTokens}: ${outputPct}%`}
              />
            </div>

            {detail.models.length > 0 && (
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-[#8C867E] dark:text-[#787771]">
                  {t.drawer.overview.modelsUsed}:
                </span>
                {detail.models.map((m) => (
                  <span
                    key={m}
                    className="rounded-md bg-[#F2F0EB] px-1.5 py-0.5 font-mono text-[10.5px] text-[#44403C] dark:bg-[#242421] dark:text-[#D6D3CD]"
                  >
                    {shortModelName(m)}
                  </span>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="mt-2 text-xs text-[#969088] dark:text-[#666560]">
            {t.drawer.overview.noTokenData}
          </p>
        )}
      </section>

      {detail.preview && (
        <section className="rounded-xl border border-[#1C1917]/[0.07] bg-white p-3.5 dark:border-white/[0.065] dark:bg-[#191917]">
          <div className="text-xs font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
            {t.drawer.overview.latestPreview}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed whitespace-pre-wrap text-[#57534E] dark:text-[#9F9E98]">
            {detail.preview}
          </p>
        </section>
      )}

      <section className="rounded-xl border border-[#1C1917]/[0.07] bg-white p-3.5 dark:border-white/[0.065] dark:bg-[#191917]">
        <div className="text-xs font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
          {t.drawer.overview.metadata}
        </div>
        <dl className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <div>
            <dt className="text-[11px] text-[#8C867E] dark:text-[#73726C]">
              {t.drawer.overview.createdOrModified}
            </dt>
            <dd className="tabular-nums mt-0.5 font-mono text-[11.5px] text-[#44403C] dark:text-[#D6D3CD]">
              {formatDateTime(detail.lastModifiedAt, locale)}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-[#8C867E] dark:text-[#73726C]">
              {t.drawer.overview.lastUserInput}
            </dt>
            <dd className="tabular-nums mt-0.5 font-mono text-[11.5px] text-[#44403C] dark:text-[#D6D3CD]">
              {detail.lastUserInputAt
                ? formatDateTime(detail.lastUserInputAt, locale)
                : t.drawer.overview.never}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-[#8C867E] dark:text-[#73726C]">
              {t.drawer.overview.lastReviewed}
            </dt>
            <dd className="tabular-nums mt-0.5 font-mono text-[11.5px] text-[#44403C] dark:text-[#D6D3CD]">
              {detail.overlay.reviewedAt
                ? formatDateTime(detail.overlay.reviewedAt, locale)
                : t.drawer.overview.never}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-[#8C867E] dark:text-[#73726C]">
              {t.drawer.overview.stepCount}
            </dt>
            <dd className="tabular-nums mt-0.5 font-mono text-[11.5px] text-[#44403C] dark:text-[#D6D3CD]">
              {detail.stepCount}
            </dd>
          </div>
        </dl>

        {detail.sideQuestions.length > 0 && (
          <div className="mt-3 border-t border-[#1C1917]/[0.06] pt-2.5 dark:border-white/[0.06]">
            <div className="text-[11px] font-medium text-[#78716C] dark:text-[#8C8B85]">
              {t.drawer.overview.sideQuestionsTitle} ({detail.sideQuestions.length})
            </div>
            <ul className="mt-1.5 space-y-1">
              {detail.sideQuestions.map((sq) => (
                <li
                  key={sq.id}
                  className="flex items-center justify-between gap-2 text-[11.5px] text-[#44403C] dark:text-[#D6D3CD]"
                >
                  <span className="truncate">{sq.title || sq.id}</span>
                  <span className="shrink-0 font-mono text-[10px] text-[#8C867E]">
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
      <div className="rounded-xl border border-[#1C1917]/[0.07] bg-[#FAF9F6] p-2.5 dark:border-white/[0.065] dark:bg-[#141413]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            {node.isRunning ? (
              <LivePulseDot />
            ) : (
              <span
                className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                  node.state === 'alive'
                    ? 'bg-[#57534E] dark:bg-[#A1A09A]'
                    : 'bg-[#C7C2BA] dark:bg-[#4A4945]'
                }`}
              />
            )}
            <span className="rounded bg-white px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-[#1C1917] ring-1 ring-[#1C1917]/[0.08] dark:bg-[#222220] dark:text-[#E7E5E0] dark:ring-white/[0.08]">
              {node.typeName || node.role || 'subagent'}
            </span>
            <span className="truncate text-xs font-medium text-[#1C1917] dark:text-[#F2F1EE]">
              {node.title || node.conversationId.slice(0, 8)}
            </span>
          </div>
          <div className="tabular-nums flex shrink-0 items-center gap-2 text-[10.5px] text-[#8C867E]">
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
      <div className="rounded-xl border border-dashed border-[#1C1917]/[0.1] py-14 text-center text-xs text-[#8C867E] dark:border-white/[0.08] dark:text-[#666560]">
        {t.drawer.agents.noAgents}
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {swarm && (
        <>
          <section className="rounded-xl border border-[#1C1917]/[0.07] bg-white p-3.5 dark:border-white/[0.065] dark:bg-[#191917]">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
                <Network className="h-3.5 w-3.5 text-[#8C867E]" />
                <span>{swarm.title || t.drawer.agents.swarmTitle}</span>
              </div>
              <span className="font-mono text-[10.5px] text-[#8C867E]">
                {swarm.swarmId.slice(0, 8)}
              </span>
            </div>
            {(swarm.goalTitle || swarm.goalLine) && (
              <div className="mt-2 border-t border-[#1C1917]/[0.06] pt-2 dark:border-white/[0.06]">
                <div className="flex items-center gap-1 text-[10.5px] font-semibold text-[#8C867E] uppercase">
                  <Target className="h-3 w-3" />
                  <span>{t.drawer.agents.swarmGoal}</span>
                </div>
                {swarm.goalTitle && (
                  <div className="mt-1 text-xs font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
                    {swarm.goalTitle}
                  </div>
                )}
                {swarm.goalLine && (
                  <p className="mt-0.5 text-xs leading-relaxed text-[#57534E] dark:text-[#9F9E98]">
                    {swarm.goalLine}
                  </p>
                )}
              </div>
            )}
          </section>

          {swarm.threads.length > 0 && (
            <section className="rounded-xl border border-[#1C1917]/[0.07] bg-white p-3.5 dark:border-white/[0.065] dark:bg-[#191917]">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
                <GitBranch className="h-3.5 w-3.5 text-[#8C867E]" />
                <span>{t.drawer.agents.threadsTitle}</span>
              </div>
              <div className="mt-2.5 space-y-2">
                {swarm.threads.map((thread) => (
                  <div
                    key={thread.id}
                    className="rounded-lg border border-[#1C1917]/[0.06] bg-[#FAF9F6] p-2.5 dark:border-white/[0.055] dark:bg-[#141413]"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10.5px] font-semibold text-[#78716C] dark:text-[#8C8B85]">
                        {thread.id}
                      </span>
                      <span className="text-xs font-medium text-[#1C1917] dark:text-[#F2F1EE]">
                        {thread.title}
                      </span>
                    </div>
                    {thread.goal && (
                      <p className="mt-1 text-[11.5px] leading-relaxed text-[#57534E] dark:text-[#9F9E98]">
                        {thread.goal}
                      </p>
                    )}
                    {thread.tasks.length > 0 && (
                      <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-[#78716C] dark:text-[#8C8B85]">
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

          {swarm.members.length > 0 && (
            <section className="overflow-hidden rounded-xl border border-[#1C1917]/[0.07] bg-white dark:border-white/[0.065] dark:bg-[#191917]">
              <div className="border-b border-[#1C1917]/[0.06] px-3.5 py-2.5 text-xs font-semibold text-[#1C1917] dark:border-white/[0.06] dark:text-[#F2F1EE]">
                {t.drawer.agents.rosterTitle} ({swarm.members.length})
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-[#1C1917]/[0.06] bg-[#FAF9F6] text-[10.5px] font-medium text-[#8C867E] uppercase dark:border-white/[0.06] dark:bg-[#141413] dark:text-[#6E6D68]">
                      <th className="py-2 pl-3.5 pr-2">{t.drawer.agents.memberName}</th>
                      <th className="py-2 pr-2">{t.drawer.agents.memberState}</th>
                      <th className="py-2 pr-2">{t.drawer.agents.memberModel}</th>
                      <th className="py-2 pr-3.5">{t.drawer.agents.memberTask}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#1C1917]/[0.055] dark:divide-white/[0.055]">
                    {swarm.members.map((m) => (
                      <tr key={m.conversationId || m.name}>
                        <td className="py-2 pl-3.5 pr-2 font-mono font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
                          @{m.name}
                          {m.role === 'coordinator' && (
                            <span className="ml-1.5 rounded bg-[#1C1917] px-1 py-0.5 text-[9px] text-[#F6F5F1] uppercase dark:bg-[#F2F1EE] dark:text-[#111110]">
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
                        <td className="py-2 pr-2 font-mono text-[11px] text-[#78716C] dark:text-[#8C8B85]">
                          {m.model ? shortModelName(m.model) : '—'}
                        </td>
                        <td className="max-w-[240px] truncate py-2 pr-3.5 text-[11.5px] text-[#57534E] dark:text-[#9F9E98]">
                          {m.task || m.phase || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          <section className="rounded-xl border border-[#1C1917]/[0.07] bg-white p-3.5 dark:border-white/[0.065] dark:bg-[#191917]">
            <div className="mb-2.5 flex items-center justify-between text-xs font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
              <span className="flex items-center gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-[#8C867E]" />
                {t.drawer.agents.boardTitle}
              </span>
              <span className="tabular-nums font-normal text-[#8C867E]">
                {swarm.messages.length}
              </span>
            </div>
            {swarm.messages.length === 0 ? (
              <p className="text-xs text-[#969088]">{t.drawer.agents.noBoardMessages}</p>
            ) : (
              <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
                {swarm.messages.map((msg) => (
                  <div
                    key={msg.seq}
                    className="rounded-lg border border-[#1C1917]/[0.06] bg-[#FAF9F6] p-2.5 dark:border-white/[0.055] dark:bg-[#141413]"
                  >
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="tabular-nums font-mono text-[#969088]">
                          #{msg.seq}
                        </span>
                        <span className="font-mono text-[10.5px] font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
                          @{msg.agent}
                        </span>
                        {msg.kind && (
                          <span className="text-[10px] text-[#8C867E]">· {msg.kind}</span>
                        )}
                      </div>
                      <span className="tabular-nums font-mono text-[10px] text-[#969088]">
                        {msg.time}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed break-words whitespace-pre-wrap text-[#44403C] dark:text-[#D6D3CD]">
                      {msg.text}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {detail.subagents.length > 0 && (
        <section className="rounded-xl border border-[#1C1917]/[0.07] bg-white p-3.5 dark:border-white/[0.065] dark:bg-[#191917]">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
            <Users className="h-3.5 w-3.5 text-[#8C867E]" />
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
      <div className="rounded-xl border border-dashed border-[#1C1917]/[0.1] py-14 text-center text-xs text-[#8C867E] dark:border-white/[0.08] dark:text-[#666560]">
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
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[232px_1fr]">
      {/* Artifact List */}
      <div className="space-y-1.5">
        <div className="text-[10.5px] font-semibold tracking-wider text-[#8C867E] uppercase dark:text-[#6E6D68]">
          {t.drawer.artifacts.listTitle} ({artifacts.length})
        </div>
        {artifacts.map((art) => {
          const active = selectedFile === art.relativePath;
          return (
            <button
              key={art.relativePath}
              type="button"
              onClick={() => setSelectedFile(art.relativePath)}
              className={`w-full rounded-xl border p-2.5 text-left transition-colors ${
                active
                  ? 'border-[#1C1917]/35 bg-white shadow-xs dark:border-[#F2F1EE]/30 dark:bg-[#222220]'
                  : 'border-[#1C1917]/[0.07] bg-white/70 hover:border-[#1C1917]/[0.16] hover:bg-white dark:border-white/[0.06] dark:bg-[#171715] dark:hover:border-white/[0.13]'
              }`}
            >
              <div className="flex items-start justify-between gap-1.5">
                <div className="flex min-w-0 items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-[#8C867E]" />
                  <span className="truncate font-mono text-xs font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
                    {art.fileName}
                  </span>
                </div>
                {art.requestFeedback && (
                  <span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-[#B45309] dark:text-[#FBBF24]">
                    <FileCheck2 className="h-3 w-3" />
                  </span>
                )}
              </div>
              {art.summary && (
                <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-[#78716C] dark:text-[#8C8B85]">
                  {art.summary}
                </p>
              )}
              <div className="tabular-nums mt-1.5 flex items-center justify-between text-[10px] text-[#969088]">
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

      {/* Inline Editorial Markdown Viewer */}
      <div className="flex min-h-[340px] flex-col overflow-hidden rounded-xl border border-[#1C1917]/[0.08] bg-white dark:border-white/[0.07] dark:bg-[#191917]">
        {!selectedFile ? (
          <div className="flex flex-1 items-center justify-center p-6 text-xs text-[#969088]">
            {t.drawer.artifacts.selectPrompt}
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1C1917]/[0.07] bg-[#FAF9F6] px-3.5 py-2 dark:border-white/[0.06] dark:bg-[#151513]">
              <span className="truncate font-mono text-xs font-semibold text-[#1C1917] dark:text-[#E7E5E0]">
                {selectedFile}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRawMode((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-md border border-[#1C1917]/[0.1] bg-white px-2 py-0.5 text-[11px] font-medium text-[#57534E] hover:text-[#1C1917] dark:border-white/[0.09] dark:bg-[#222220] dark:text-[#D6D3CD]"
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
                  className="inline-flex items-center gap-1 rounded-md border border-[#1C1917]/[0.1] bg-white px-2 py-0.5 text-[11px] font-medium text-[#57534E] hover:text-[#1C1917] disabled:opacity-40 dark:border-white/[0.09] dark:bg-[#222220] dark:text-[#D6D3CD]"
                >
                  {copied ? (
                    <Check className="h-3 w-3 text-[#16A34A]" />
                  ) : (
                    <Copy className="h-3 w-3" />
                  )}
                  <span>{copied ? t.drawer.copied : t.drawer.artifacts.copyContent}</span>
                </button>
              </div>
            </div>

            {contentRes?.truncated && (
              <div className="flex items-center gap-1.5 border-b border-[#D97706]/20 bg-[#FFFBEB] px-3.5 py-1.5 text-[11px] text-[#92400E] dark:border-[#F59E0B]/20 dark:bg-[#261E12] dark:text-[#FCD34D]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                <span>{t.drawer.artifacts.truncatedNotice}</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-4">
              {loading ? (
                <div className="flex items-center gap-2 py-8 text-xs text-[#8C867E]">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{t.drawer.artifacts.loading}</span>
                </div>
              ) : error ? (
                <div className="rounded-lg border border-[#DC2626]/25 bg-[#FEF2F2] p-3 text-xs text-[#B91C1C] dark:border-[#EF4444]/25 dark:bg-[#2A1616] dark:text-[#FCA5A5]">
                  {t.drawer.artifacts.loadError}: {error}
                </div>
              ) : contentRes ? (
                rawMode ? (
                  <pre className="overflow-x-auto font-mono text-xs leading-relaxed whitespace-pre-wrap text-[#1C1917] dark:text-[#E7E5E0]">
                    {contentRes.content}
                  </pre>
                ) : (
                  <div className="agmb-prose text-[#292524] dark:text-[#E7E5E0]">
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
      badge: 'bg-[#1C1917] text-[#F6F5F1] dark:bg-[#F2F1EE] dark:text-[#111110]',
      border: 'border-[#1C1917]/[0.075] dark:border-white/[0.065]',
    },
    assistant: {
      label: t.drawer.timeline.roleAssistant,
      Icon: Bot,
      badge: 'bg-[#F2F0EB] text-[#44403C] dark:bg-[#252522] dark:text-[#D6D3CD]',
      border: 'border-[#1C1917]/[0.075] dark:border-white/[0.065]',
    },
    error: {
      label: t.drawer.timeline.roleError,
      Icon: AlertCircle,
      badge: 'bg-[#FEF2F2] text-[#B91C1C] dark:bg-[#2A1616] dark:text-[#FCA5A5]',
      border: 'border-[#DC2626]/25 dark:border-[#EF4444]/30',
    },
    system: {
      label: t.drawer.timeline.roleSystem,
      Icon: Terminal,
      badge: 'bg-[#F2F0EB] text-[#78716C] dark:bg-[#222220] dark:text-[#8C8B85]',
      border: 'border-[#1C1917]/[0.065] dark:border-white/[0.055]',
    },
  }[role];

  const Icon = roleConfig.Icon;

  return (
    <div
      className={`rounded-xl border bg-white p-3 dark:bg-[#191917] ${roleConfig.border}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold ${roleConfig.badge}`}
          >
            <Icon className="h-3 w-3" />
            <span>{roleConfig.label}</span>
          </span>
          <span className="tabular-nums font-mono text-[10.5px] text-[#969088]">
            {t.drawer.timeline.stepIndex(turn.stepIndex)}
          </span>
          {turn.model && (
            <span className="font-mono text-[10px] text-[#8C867E] dark:text-[#787771]">
              · {shortModelName(turn.model)}
            </span>
          )}
        </div>
        <span className="tabular-nums font-mono text-[10.5px] text-[#969088]">
          {formatDateTime(turn.createdAt, locale)}
        </span>
      </div>

      {turn.toolNames.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          <Wrench className="h-3 w-3 text-[#969088]" />
          {turn.toolNames.map((tool, i) => (
            <span
              key={`${tool}-${i}`}
              className="rounded bg-[#F2F0EB] px-1.5 py-0.5 font-mono text-[10px] text-[#57534E] dark:bg-[#242421] dark:text-[#A1A09A]"
            >
              {tool}
            </span>
          ))}
        </div>
      )}

      {turn.thinkingSummary && (
        <div className="mt-2">
          <button
            type="button"
            onClick={() => setShowThinking((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-[#78716C] hover:text-[#1C1917] dark:text-[#8C8B85] dark:hover:text-[#F2F1EE]"
          >
            {showThinking ? (
              <ChevronDown className="h-3 w-3" />
            ) : (
              <ChevronRight className="h-3 w-3" />
            )}
            <span>{t.drawer.timeline.thinking}</span>
          </button>
          {showThinking && (
            <p className="mt-1 rounded-lg bg-[#FAF9F6] p-2 text-[11px] leading-relaxed whitespace-pre-wrap text-[#78716C] dark:bg-[#141413] dark:text-[#8C8B85]">
              {turn.thinkingSummary}
            </p>
          )}
        </div>
      )}

      {visibleBody && (
        <p
          className={`mt-2 text-xs leading-relaxed break-words whitespace-pre-wrap ${
            role === 'error'
              ? 'font-mono text-[#B91C1C] dark:text-[#FCA5A5]'
              : 'text-[#44403C] dark:text-[#D6D3CD]'
          }`}
        >
          {visibleBody}
        </p>
      )}

      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-[11px] font-medium text-[#1C1917] underline underline-offset-2 dark:text-[#F2F1EE]"
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
      <div className="rounded-xl border border-dashed border-[#1C1917]/[0.1] py-14 text-center text-xs text-[#8C867E] dark:border-white/[0.08] dark:text-[#666560]">
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
