import { useMemo } from 'react';
import type { ConversationCard } from '@shared/types';
import {
  ArrowUpRight,
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
      <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#1C1917]/[0.12] bg-white px-6 py-20 text-center dark:border-white/[0.08] dark:bg-[#1A1A18]">
        <div className="rounded-xl bg-[#F2F0EB] p-3 text-[#8C867E] dark:bg-[#242421] dark:text-[#787771]">
          <Network className="h-6 w-6" />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
          {t.swarmView.emptyTitle}
        </h3>
        <p className="mt-1 max-w-md text-xs leading-relaxed text-[#78716C] dark:text-[#8C8B85]">
          {t.swarmView.emptyDesc}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Calm Header Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#1C1917]/[0.075] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(28,25,23,0.03)] dark:border-white/[0.065] dark:bg-[#1A1A18] dark:shadow-none">
        <div>
          <h2 className="text-sm font-semibold tracking-[-0.015em] text-[#1C1917] dark:text-[#F2F1EE]">
            {t.swarmView.title}
          </h2>
          <p className="mt-0.5 text-xs text-[#78716C] dark:text-[#8C8B85]">
            {t.swarmView.subtitle}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[10.5px] text-[#8C867E] dark:text-[#787771]">
              {t.swarmView.activeClusters}
            </div>
            <div className="tabular-nums text-base font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
              {summary.activeClusters}
              <span className="text-xs font-normal text-[#969088]"> / {totalClusters}</span>
            </div>
          </div>
          <div className="h-7 w-px bg-[#1C1917]/[0.08] dark:bg-white/[0.08]" />
          <div className="text-right">
            <div className="text-[10.5px] text-[#8C867E] dark:text-[#787771]">
              {t.swarmView.workingAgents}
            </div>
            <div className="tabular-nums text-base font-semibold text-[#16A34A] dark:text-[#22C55E]">
              {summary.workingAgents}
            </div>
          </div>
          <div className="h-7 w-px bg-[#1C1917]/[0.08] dark:bg-white/[0.08]" />
          <div className="text-right">
            <div className="text-[10.5px] text-[#8C867E] dark:text-[#787771]">
              {t.swarmView.totalSubagents}
            </div>
            <div className="tabular-nums text-base font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
              {summary.totalSubagents}
            </div>
          </div>
        </div>
      </div>

      {/* Primary Section: Full Swarm Clusters */}
      {swarmClusters.length > 0 && (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-2">
          {swarmClusters.map((card) => {
            const swarm = card.swarm!;
            const hasWorking = swarm.workingCount > 0 || card.activeSubagentCount > 0;

            return (
              <section
                key={card.id}
                className="flex flex-col rounded-2xl border border-[#1C1917]/[0.08] bg-white shadow-[0_1px_2px_rgba(28,25,23,0.03)] dark:border-white/[0.075] dark:bg-[#1A1A18] dark:shadow-none"
              >
                {/* Cluster Header */}
                <div className="flex flex-wrap items-start justify-between gap-2 border-b border-[#1C1917]/[0.065] px-4 py-3 dark:border-white/[0.06]">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {hasWorking ? (
                        <LivePulseDot />
                      ) : (
                        <Network className="h-3.5 w-3.5 text-[#8C867E]" />
                      )}
                      <h3 className="truncate text-sm font-semibold tracking-[-0.01em] text-[#1C1917] dark:text-[#F2F1EE]">
                        {swarm.title || card.title || t.card.untitled}
                      </h3>
                      <LanePill lane={card.lane} t={t} isRunning={card.isRunning} />
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-[#78716C] dark:text-[#8C8B85]">
                      {swarm.title && card.title && swarm.title !== card.title && (
                        <span className="truncate">{card.title}</span>
                      )}
                      {card.workspace && (
                        <span className="text-[10.5px]">
                          · {card.workspace}
                        </span>
                      )}
                      <span className="tabular-nums">
                        · {formatRelativeTime(card.lastModifiedAt, t)}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => onOpenDetail(card.id, 'agents')}
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#1C1917]/[0.1] bg-[#FAF9F6] px-2.5 py-1 text-xs font-medium whitespace-nowrap text-[#44403C] transition-colors hover:border-[#1C1917]/25 hover:text-[#1C1917] dark:border-white/[0.09] dark:bg-[#222220] dark:text-[#D6D3CD] dark:hover:border-white/[0.18] dark:hover:text-[#F2F1EE]"
                  >
                    <span>{t.swarmView.openDetail}</span>
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </button>
                </div>

                <div className="space-y-4 p-4">
                  {/* Swarm Plan Goal */}
                  {(swarm.goalTitle || swarm.goalLine) && (
                    <div className="rounded-xl border border-[#1C1917]/[0.06] bg-[#F6F5F1]/80 p-3 dark:border-white/[0.055] dark:bg-[#141413]">
                      <div className="flex items-center gap-1.5 text-[10.5px] font-semibold tracking-wider text-[#8C867E] uppercase dark:text-[#6E6D68]">
                        <Target className="h-3 w-3" />
                        <span>{t.swarmView.goal}</span>
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

                  {/* Threads from plan.json */}
                  {swarm.threads.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-[#57534E] dark:text-[#9F9E98]">
                        <GitBranch className="h-3.5 w-3.5 opacity-70" />
                        <span>
                          {t.swarmView.threads} ({swarm.threads.length})
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {swarm.threads.map((thread) => (
                          <div
                            key={thread.id}
                            className="rounded-xl border border-[#1C1917]/[0.065] bg-[#FAF9F6]/70 p-2.5 dark:border-white/[0.06] dark:bg-[#151513]"
                          >
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10.5px] font-semibold text-[#78716C] dark:text-[#8C8B85]">
                                {thread.id}
                              </span>
                              <span className="truncate text-xs font-medium text-[#1C1917] dark:text-[#F2F1EE]">
                                {thread.title}
                              </span>
                            </div>
                            {thread.goal && (
                              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-[#78716C] dark:text-[#8C8B85]">
                                {thread.goal}
                              </p>
                            )}
                            {thread.tasks.length > 0 && (
                              <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10.5px] text-[#78716C] dark:text-[#787771]">
                                {thread.tasks.slice(0, 3).map((task, idx) => (
                                  <span key={idx} className="max-w-full truncate">
                                    · {task}
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
                      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-[#57534E] dark:text-[#9F9E98]">
                        <span className="flex items-center gap-1.5">
                          <Users className="h-3.5 w-3.5 opacity-70" />
                          {t.swarmView.workers} ({swarm.members.length})
                        </span>
                        <span className="tabular-nums font-normal text-[#8C867E] dark:text-[#73726C]">
                          {swarm.workingCount} {t.swarmView.statusWorking} ·{' '}
                          {swarm.waitingCount} {t.swarmView.statusWaiting} ·{' '}
                          {swarm.killedCount} {t.swarmView.statusKilled}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {swarm.members.map((member) => (
                          <div
                            key={member.conversationId || member.name}
                            className="flex flex-col justify-between rounded-xl border border-[#1C1917]/[0.065] bg-[#FAF9F6]/70 p-2.5 dark:border-white/[0.06] dark:bg-[#151513]"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-1.5">
                                <span className="truncate text-xs font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
                                  @{member.name}
                                </span>
                                {member.role === 'coordinator' && (
                                  <span className="rounded bg-[#1C1917] px-1 py-0.5 text-[9px] font-semibold text-[#F6F5F1] uppercase dark:bg-[#F2F1EE] dark:text-[#111110]">
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
                              <p className="mt-1.5 line-clamp-2 text-[11px] leading-snug text-[#57534E] dark:text-[#9F9E98]">
                                {member.task}
                              </p>
                            )}
                            <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-[#8C867E] dark:text-[#6E6D68]">
                              <span className="truncate">
                                {member.model ? shortModelName(member.model) : '—'}
                              </span>
                              {member.workspaceMode && (
                                <span className="text-[9.5px] opacity-80">
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
                      <div className="mb-2 flex items-center justify-between text-[11px] font-semibold text-[#57534E] dark:text-[#9F9E98]">
                        <span className="flex items-center gap-1.5">
                          <MessageSquare className="h-3.5 w-3.5 opacity-70" />
                          {t.swarmView.recentBoard}
                        </span>
                        <span className="tabular-nums text-[10.5px] font-normal text-[#8C867E]">
                          {t.swarmView.boardMessagesCount(swarm.messageCount)}
                        </span>
                      </div>
                      <div className="space-y-1.5 rounded-xl border border-[#1C1917]/[0.06] bg-[#F6F5F1]/75 p-2.5 dark:border-white/[0.055] dark:bg-[#141413]">
                        {swarm.recentMessages.slice(-4).map((msg) => (
                          <div
                            key={msg.seq}
                            className="flex items-start gap-2 text-[11.5px] leading-relaxed"
                          >
                            <span className="tabular-nums mt-0.5 shrink-0 text-[10px] text-[#969088] dark:text-[#666560]">
                              #{msg.seq}
                            </span>
                            <span className="mt-0.5 shrink-0 text-[10.5px] font-semibold text-[#44403C] dark:text-[#D6D3CD]">
                              @{msg.agent}
                            </span>
                            <p className="line-clamp-2 min-w-0 flex-1 text-[#57534E] dark:text-[#9F9E98]">
                              {msg.text}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Subagents attached to this Swarm */}
                  {card.subagentsPreview.length > 0 && (
                    <div>
                      <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-[#57534E] dark:text-[#9F9E98]">
                        <Users className="h-3.5 w-3.5 opacity-70" />
                        <span>
                          {t.swarmView.subagents} ({card.subagentCount})
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {card.subagentsPreview.map((sub) => (
                          <div
                            key={sub.conversationId}
                            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[#1C1917]/[0.07] bg-[#FAF9F6] px-2 py-1 text-[11px] dark:border-white/[0.06] dark:bg-[#151513]"
                          >
                            {sub.isRunning ? (
                              <LivePulseDot />
                            ) : (
                              <span
                                className={`h-1.5 w-1.5 rounded-full ${
                                  sub.state === 'alive'
                                    ? 'bg-[#57534E] dark:bg-[#A1A09A]'
                                    : 'bg-[#C7C2BA] dark:bg-[#4E4D48]'
                                }`}
                              />
                            )}
                            <span className="text-[10.5px] font-medium text-[#1C1917] dark:text-[#E7E5E0]">
                              {sub.typeName || sub.role || 'subagent'}
                            </span>
                            {sub.title && (
                              <span className="max-w-[180px] truncate text-[#78716C] dark:text-[#8C8B85]">
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
          <div className="flex items-center gap-2 px-0.5 text-xs font-semibold text-[#57534E] dark:text-[#9F9E98]">
            <Users className="h-3.5 w-3.5 opacity-70" />
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
                  className="flex flex-col rounded-2xl border border-[#1C1917]/[0.08] bg-white p-3.5 shadow-[0_1px_2px_rgba(28,25,23,0.03)] dark:border-white/[0.075] dark:bg-[#1A1A18] dark:shadow-none"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {hasWorking && <LivePulseDot />}
                        <h3 className="truncate text-xs font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
                          {card.title || t.card.untitled}
                        </h3>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-[10.5px] text-[#78716C] dark:text-[#8C8B85]">
                        <LanePill lane={card.lane} t={t} isRunning={card.isRunning} />
                        {card.workspace && (
                          <span className="font-medium">{card.workspace}</span>
                        )}
                        <span className="tabular-nums">
                          {formatRelativeTime(card.lastModifiedAt, t)}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onOpenDetail(card.id, 'agents')}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[#1C1917]/[0.1] bg-[#FAF9F6] px-2 py-1 text-[11px] font-medium whitespace-nowrap text-[#44403C] transition-colors hover:border-[#1C1917]/25 hover:text-[#1C1917] dark:border-white/[0.09] dark:bg-[#222220] dark:text-[#D6D3CD]"
                    >
                      <span>{t.swarmView.openDetail}</span>
                      <ArrowUpRight className="h-3 w-3" />
                    </button>
                  </div>

                  {card.subagentsPreview.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#1C1917]/[0.06] pt-2.5 dark:border-white/[0.06]">
                      {card.subagentsPreview.map((sub) => (
                        <div
                          key={sub.conversationId}
                          className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-[#1C1917]/[0.07] bg-[#FAF9F6] px-2 py-1 text-[11px] dark:border-white/[0.06] dark:bg-[#151513]"
                        >
                          {sub.isRunning ? (
                            <LivePulseDot />
                          ) : (
                            <span
                              className={`h-1.5 w-1.5 rounded-full ${
                                sub.state === 'alive'
                                  ? 'bg-[#57534E] dark:bg-[#A1A09A]'
                                  : 'bg-[#C7C2BA] dark:bg-[#4E4D48]'
                              }`}
                            />
                          )}
                          <span className="text-[10.5px] font-medium text-[#1C1917] dark:text-[#E7E5E0]">
                            {sub.typeName || sub.role || 'subagent'}
                          </span>
                          {sub.title && (
                            <span className="max-w-[160px] truncate text-[#78716C] dark:text-[#8C8B85]">
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
