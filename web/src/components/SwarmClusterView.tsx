import { useMemo } from 'react';
import type { ConversationCard } from '@shared/types';
import {
  ArrowUpRight,
  Folder,
  GitBranch,
  MessageSquare,
  Network,
  Target,
  Users,
} from 'lucide-react';
import type { Dictionary } from '../i18n';
import { formatRelativeTime, shortModelName } from '../utils';
import { LanePill, LivePulseDot, SwarmStateBadge } from './badges';

interface SwarmClusterViewProps {
  conversations: ConversationCard[];
  onOpenDetail: (id: string, tab: 'agents') => void;
  t: Dictionary;
}

export function SwarmClusterView({
  conversations,
  onOpenDetail,
  t,
}: SwarmClusterViewProps) {
  const { swarmClusters, subagentOnlyCards } = useMemo(() => {
    const swarms: ConversationCard[] = [];
    const subOnly: ConversationCard[] = [];
    for (const c of conversations) {
      if (c.swarm !== null) {
        swarms.push(c);
      } else if (c.subagentCount > 0) {
        subOnly.push(c);
      }
    }

    swarms.sort((a, b) => {
      const aActive =
        (a.swarm?.workingCount ?? 0) + a.activeSubagentCount + (a.isRunning ? 1 : 0);
      const bActive =
        (b.swarm?.workingCount ?? 0) + b.activeSubagentCount + (b.isRunning ? 1 : 0);
      if (aActive !== bActive) return bActive - aActive;
      return Date.parse(b.lastModifiedAt) - Date.parse(a.lastModifiedAt);
    });

    subOnly.sort((a, b) => {
      const aActive = a.activeSubagentCount + (a.isRunning ? 1 : 0);
      const bActive = b.activeSubagentCount + (b.isRunning ? 1 : 0);
      if (aActive !== bActive) return bActive - aActive;
      return Date.parse(b.lastModifiedAt) - Date.parse(a.lastModifiedAt);
    });

    return { swarmClusters: swarms, subagentOnlyCards: subOnly };
  }, [conversations]);

  const totalClusters = swarmClusters.length + subagentOnlyCards.length;

  const summary = useMemo(() => {
    let activeClusters = 0;
    let workingAgents = 0;
    let totalSubagents = 0;
    for (const c of [...swarmClusters, ...subagentOnlyCards]) {
      const w = c.swarm?.workingCount ?? 0;
      workingAgents += w + c.activeSubagentCount;
      totalSubagents += c.subagentCount;
      if (c.isRunning || w > 0 || c.activeSubagentCount > 0) {
        activeClusters += 1;
      }
    }
    return { activeClusters, workingAgents, totalSubagents };
  }, [swarmClusters, subagentOnlyCards]);

  if (totalClusters === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-white px-6 py-20 text-center dark:border-[#222733] dark:bg-[#13161D]">
        <div className="rounded-xl bg-zinc-100 p-3 text-zinc-400 dark:bg-[#1A1F2B] dark:text-zinc-500">
          <Network className="h-6 w-6" />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
          {t.swarmView.emptyTitle}
        </h3>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-zinc-500 dark:text-zinc-400">
          {t.swarmView.emptyDesc}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200/80 bg-white px-4 py-3 dark:border-[#222733] dark:bg-[#13161D]">
        <div>
          <h2 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-100">
            {t.swarmView.title}
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {t.swarmView.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">
              {t.swarmView.activeClusters}
            </div>
            <div className="tabular-nums text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {summary.activeClusters}
              <span className="text-xs font-normal text-zinc-400"> / {totalClusters}</span>
            </div>
          </div>
          <div className="h-7 w-px bg-zinc-200 dark:bg-[#222733]" />
          <div className="text-right">
            <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">
              {t.swarmView.workingAgents}
            </div>
            <div className="tabular-nums text-base font-semibold text-emerald-600 dark:text-emerald-400">
              {summary.workingAgents}
            </div>
          </div>
          <div className="h-7 w-px bg-zinc-200 dark:bg-[#222733]" />
          <div className="text-right">
            <div className="text-[10.5px] text-zinc-500 dark:text-zinc-400">
              {t.swarmView.totalSubagents}
            </div>
            <div className="tabular-nums text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {summary.totalSubagents}
            </div>
          </div>
        </div>
      </div>

      {/* Primary Section: Full Swarm Clusters (sorted first, items-start prevents vertical voids) */}
      {swarmClusters.length > 0 && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          {swarmClusters.map((card) => {
            const swarm = card.swarm!;
            const hasWorking = swarm.workingCount > 0 || card.activeSubagentCount > 0;

            return (
              <section
                key={card.id}
                className={`flex flex-col rounded-xl border bg-white transition-colors dark:bg-[#13161D] ${
                  hasWorking
                    ? 'border-emerald-300/80 dark:border-emerald-500/35'
                    : 'border-zinc-200/90 dark:border-[#222733]'
                }`}
              >
                {/* Cluster Header */}
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-[#1E2330]">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {hasWorking ? (
                        <LivePulseDot />
                      ) : (
                        <Network className="h-3.5 w-3.5 text-zinc-400" />
                      )}
                      <h3 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                        {swarm.title || card.title || t.card.untitled}
                      </h3>
                      <LanePill lane={card.lane} t={t} isRunning={card.isRunning} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                      {swarm.title && card.title && swarm.title !== card.title && (
                        <span className="truncate">{card.title}</span>
                      )}
                      {card.workspace && (
                        <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-[#1B202C] dark:text-zinc-400">
                          <Folder className="h-2.5 w-2.5" />
                          {card.workspace}
                        </span>
                      )}
                      <span className="tabular-nums">
                        {formatRelativeTime(card.lastModifiedAt, t)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenDetail(card.id, 'agents')}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium whitespace-nowrap text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-[#2A3040] dark:bg-[#181C25] dark:text-zinc-200 dark:hover:border-[#394257]"
                  >
                    <span>{t.swarmView.openDetail}</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="space-y-4 p-4">
                  {/* Swarm Plan Goal */}
                  {(swarm.goalTitle || swarm.goalLine) && (
                    <div className="rounded-lg border border-zinc-200/70 bg-zinc-50/70 p-3 dark:border-[#222733] dark:bg-[#0F1218]">
                      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                        <Target className="h-3 w-3 text-sky-500" />
                        <span>{t.swarmView.goal}</span>
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

                  {/* Threads from plan.json */}
                  {swarm.threads.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                        <GitBranch className="h-3.5 w-3.5 text-zinc-400" />
                        <span>
                          {t.swarmView.threads} ({swarm.threads.length})
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {swarm.threads.map((thread) => (
                          <div
                            key={thread.id}
                            className="rounded-lg border border-zinc-200/70 bg-white p-2.5 dark:border-[#222733] dark:bg-[#10131A]"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-600 dark:bg-[#1C212E] dark:text-zinc-400">
                                {thread.id}
                              </span>
                              <span className="truncate text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                                {thread.title}
                              </span>
                            </div>
                            {thread.goal && (
                              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                                {thread.goal}
                              </p>
                            )}
                            {thread.tasks.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1">
                                {thread.tasks.slice(0, 3).map((task, idx) => (
                                  <span
                                    key={idx}
                                    className="max-w-full truncate rounded bg-zinc-100/80 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-[#1B202C] dark:text-zinc-400"
                                  >
                                    {task}
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Worker Roster Cards */}
                  {swarm.members.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                        <span className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 text-zinc-400" />
                          {t.swarmView.workers} ({swarm.members.length})
                        </span>
                        <span className="tabular-nums font-normal text-zinc-400 dark:text-zinc-500">
                          {swarm.workingCount} {t.swarmView.statusWorking} ·{' '}
                          {swarm.waitingCount} {t.swarmView.statusWaiting} ·{' '}
                          {swarm.killedCount} {t.swarmView.statusKilled}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {swarm.members.map((member) => (
                          <div
                            key={member.conversationId || member.name}
                            className="flex flex-col justify-between rounded-lg border border-zinc-200/75 bg-zinc-50/40 p-2.5 dark:border-[#222733] dark:bg-[#0F1218]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                                  @{member.name}
                                </span>
                                {member.role === 'coordinator' && (
                                  <span className="rounded bg-zinc-900 px-1 py-0.5 text-[9px] font-semibold text-white uppercase dark:bg-zinc-200 dark:text-zinc-950">
                                    coord
                                  </span>
                                )}
                              </div>
                              <SwarmStateBadge
                                state={member.state}
                                isRunning={member.isRunning}
                                t={t}
                              />
                            </div>
                            {member.task && (
                              <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-zinc-600 dark:text-zinc-400">
                                {member.task}
                              </p>
                            )}
                            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-zinc-400 dark:text-zinc-500">
                              <span className="truncate font-mono">
                                {member.model ? shortModelName(member.model) : '—'}
                              </span>
                              {member.workspaceMode && (
                                <span className="rounded bg-zinc-100 px-1 py-0.5 font-mono text-[9.5px] text-zinc-500 dark:bg-[#1B202C] dark:text-zinc-400">
                                  {member.workspaceMode}
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recent Board Highlights */}
                  {swarm.recentMessages.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                        <span className="flex items-center gap-1.5">
                          <MessageSquare className="h-3.5 w-3.5 text-zinc-400" />
                          {t.swarmView.recentBoard}
                        </span>
                        <span className="tabular-nums text-[10.5px] font-normal text-zinc-400">
                          {t.swarmView.boardMessagesCount(swarm.messageCount)}
                        </span>
                      </div>
                      <div className="space-y-1.5 rounded-lg border border-zinc-200/70 bg-zinc-50/50 p-2.5 dark:border-[#222733] dark:bg-[#0E1117]">
                        {swarm.recentMessages.slice(-4).map((msg) => (
                          <div
                            key={msg.seq}
                            className="flex items-start gap-2 text-[11.5px] leading-relaxed"
                          >
                            <span className="tabular-nums mt-0.5 shrink-0 font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                              #{msg.seq}
                            </span>
                            <span className="mt-0.5 shrink-0 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] font-semibold text-zinc-700 ring-1 ring-zinc-200/80 dark:bg-[#181C25] dark:text-zinc-300 dark:ring-[#2A3040]">
                              {msg.agent}
                            </span>
                            <p className="line-clamp-2 min-w-0 flex-1 text-zinc-600 dark:text-zinc-300">
                              {msg.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Subagents attached to this Swarm conversation */}
                  {card.subagentsPreview.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-zinc-600 dark:text-zinc-400">
                        <Users className="h-3.5 w-3.5 text-zinc-400" />
                        <span>
                          {t.swarmView.subagents} ({card.subagentCount})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {card.subagentsPreview.map((sub) => (
                          <div
                            key={sub.conversationId}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-zinc-200/80 bg-zinc-50 px-2 py-1 text-[11px] dark:border-[#222733] dark:bg-[#0F1218]"
                          >
                            {sub.isRunning ? (
                              <LivePulseDot />
                            ) : (
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  sub.state === 'alive'
                                    ? 'bg-sky-500'
                                    : sub.state === 'killed'
                                      ? 'bg-zinc-400/60'
                                      : 'bg-zinc-400'
                                }`}
                              />
                            )}
                            <span className="font-mono text-[10.5px] font-semibold text-zinc-800 dark:text-zinc-200">
                              {sub.typeName || sub.role || 'subagent'}
                            </span>
                            {sub.title && (
                              <span className="max-w-[180px] truncate text-zinc-500 dark:text-zinc-400">
                                {sub.title}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Secondary Section: Compact Subagent-Only Sessions */}
      {subagentOnlyCards.length > 0 && (
        <section className="space-y-2.5">
          <div className="flex items-center gap-2 px-0.5 text-xs font-semibold text-zinc-600 dark:text-zinc-400">
            <Users className="h-3.5 w-3.5 text-zinc-400" />
            <span>
              {t.swarmView.subagents} ({subagentOnlyCards.length})
            </span>
          </div>
          <div className="grid grid-cols-1 items-start gap-3 md:grid-cols-2 xl:grid-cols-3">
            {subagentOnlyCards.map((card) => {
              const hasWorking = card.activeSubagentCount > 0 || card.isRunning;
              return (
                <div
                  key={card.id}
                  className={`flex flex-col rounded-xl border bg-white p-3.5 transition-colors dark:bg-[#13161D] ${
                    hasWorking
                      ? 'border-emerald-300/80 dark:border-emerald-500/35'
                      : 'border-zinc-200/90 dark:border-[#222733]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {hasWorking && <LivePulseDot />}
                        <h3 className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                          {card.title || t.card.untitled}
                        </h3>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10.5px] text-zinc-500 dark:text-zinc-400">
                        <LanePill lane={card.lane} t={t} isRunning={card.isRunning} />
                        {card.workspace && (
                          <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-[#1B202C] dark:text-zinc-400">
                            <Folder className="h-2.5 w-2.5" />
                            {card.workspace}
                          </span>
                        )}
                        <span className="tabular-nums">
                          {formatRelativeTime(card.lastModifiedAt, t)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenDetail(card.id, 'agents')}
                      className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 text-[11px] font-medium whitespace-nowrap text-zinc-700 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-[#2A3040] dark:bg-[#181C25] dark:text-zinc-200"
                    >
                      <span>{t.swarmView.openDetail}</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </div>

                  {card.subagentsPreview.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-zinc-100 pt-2.5 dark:border-[#1E2330]">
                      {card.subagentsPreview.map((sub) => (
                        <div
                          key={sub.conversationId}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-zinc-200/80 bg-zinc-50 px-2 py-1 text-[11px] dark:border-[#222733] dark:bg-[#0F1218]"
                        >
                          {sub.isRunning ? (
                            <LivePulseDot />
                          ) : (
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                sub.state === 'alive'
                                  ? 'bg-sky-500'
                                  : sub.state === 'killed'
                                    ? 'bg-zinc-400/60'
                                    : 'bg-zinc-400'
                              }`}
                            />
                          )}
                          <span className="font-mono text-[10.5px] font-semibold text-zinc-800 dark:text-zinc-200">
                            {sub.typeName || sub.role || 'subagent'}
                          </span>
                          {sub.title && (
                            <span className="max-w-[160px] truncate text-zinc-500 dark:text-zinc-400">
                              {sub.title}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
