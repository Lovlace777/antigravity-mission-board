import { Fragment, useMemo, useState } from 'react';
import type { ConversationCard, LaneId } from '@shared/types';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Layers,
  Network,
  Pin,
  Users,
} from 'lucide-react';
import type { Dictionary, Locale } from '../i18n';
import {
  formatCompactNumber,
  formatDateTime,
  formatPercent,
  formatRelativeTime,
} from '../utils';
import {
  LANE_ORDER,
  LanePill,
  LivePulseDot,
  PriorityBadge,
  primaryAttentionReason,
  priorityRank,
} from './badges';

export type MatrixGroupBy = 'none' | 'workspace' | 'tag' | 'lane';
export type MatrixSortBy = 'lastActive' | 'attention' | 'steps' | 'tokens' | 'priority';

interface MatrixViewProps {
  conversations: ConversationCard[];
  totalCount: number;
  selectedId: string | null;
  onSelectConversation: (id: string) => void;
  onTogglePin: (card: ConversationCard) => void;
  onMarkReviewed: (card: ConversationCard) => void;
  onOpenMoveMenu: (card: ConversationCard, x: number, y: number) => void;
  locale: Locale;
  t: Dictionary;
}

export function MatrixView({
  conversations,
  totalCount,
  selectedId,
  onSelectConversation,
  onTogglePin,
  onMarkReviewed,
  onOpenMoveMenu,
  locale,
  t,
}: MatrixViewProps) {
  const [groupBy, setGroupBy] = useState<MatrixGroupBy>('workspace');
  const [sortBy, setSortBy] = useState<MatrixSortBy>('lastActive');
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const toggleSort = (field: MatrixSortBy) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
    } else {
      setSortBy(field);
      setSortDir('desc');
    }
  };

  const sorted = useMemo(() => {
    const dir = sortDir === 'desc' ? 1 : -1;
    return [...conversations].sort((a, b) => {
      if (a.overlay.pinned !== b.overlay.pinned) return a.overlay.pinned ? -1 : 1;

      let diff = 0;
      switch (sortBy) {
        case 'lastActive':
          diff = Date.parse(b.lastModifiedAt) - Date.parse(a.lastModifiedAt);
          break;
        case 'attention': {
          const score = (c: ConversationCard) =>
            (c.hasError ? 100 : 0) +
            (c.hasPendingQuestion ? 60 : 0) +
            (c.pendingFeedbackCount > 0 ? 40 : 0) +
            c.attentionReasons.length * 20 +
            (c.isRunning ? 10 : 0);
          diff = score(b) - score(a);
          break;
        }
        case 'steps':
          diff = b.stepCount - a.stepCount;
          break;
        case 'tokens':
          diff = b.tokens.totalTokens - a.tokens.totalTokens;
          break;
        case 'priority':
          diff = priorityRank(b.overlay.priority) - priorityRank(a.overlay.priority);
          break;
      }
      if (diff !== 0) return diff * dir;
      return Date.parse(b.lastModifiedAt) - Date.parse(a.lastModifiedAt);
    });
  }, [conversations, sortBy, sortDir]);

  const groups = useMemo(() => {
    if (groupBy === 'none') {
      return [{ key: '__all__', label: '', items: sorted }];
    }

    const buckets = new Map<string, ConversationCard[]>();
    const add = (key: string, item: ConversationCard) => {
      const list = buckets.get(key) ?? [];
      list.push(item);
      buckets.set(key, list);
    };

    for (const card of sorted) {
      if (groupBy === 'workspace') {
        add(card.workspace || t.noWorkspace, card);
      } else if (groupBy === 'lane') {
        add(card.lane, card);
      } else if (groupBy === 'tag') {
        if (card.overlay.tags.length === 0) {
          add(t.matrix.untagged, card);
        } else {
          for (const tag of card.overlay.tags) {
            add(`#${tag}`, card);
          }
        }
      }
    }

    const entries = Array.from(buckets.entries());
    if (groupBy === 'lane') {
      entries.sort(
        ([a], [b]) =>
          LANE_ORDER.indexOf(a as LaneId) - LANE_ORDER.indexOf(b as LaneId),
      );
      return entries.map(([lane, items]) => ({
        key: lane,
        label: t.lanes[lane as LaneId] ?? lane,
        items,
      }));
    }

    entries.sort(([aKey, aItems], [bKey, bItems]) => {
      if (aKey === t.noWorkspace || aKey === t.matrix.untagged) return 1;
      if (bKey === t.noWorkspace || bKey === t.matrix.untagged) return -1;
      return bItems.length - aItems.length;
    });

    return entries.map(([key, items]) => ({ key, label: key, items }));
  }, [sorted, groupBy, t]);

  const toggleGroupCollapse = (key: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Editorial Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#1C1917]/[0.075] bg-white px-3.5 py-2 shadow-[0_1px_2px_rgba(28,25,23,0.03)] dark:border-white/[0.065] dark:bg-[#1A1A18] dark:shadow-none">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-[#8C867E]" />
            <span className="text-[11px] font-medium text-[#78716C] dark:text-[#8C8B85]">
              {t.matrix.groupBy}
            </span>
            <div className="inline-flex rounded-lg border border-[#1C1917]/[0.08] bg-[#EFECE6]/90 p-0.5 dark:border-white/[0.07] dark:bg-[#141413]">
              {(
                [
                  ['none', t.matrix.groupNone],
                  ['workspace', t.matrix.groupWorkspace],
                  ['tag', t.matrix.groupTag],
                  ['lane', t.matrix.groupLane],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setGroupBy(value)}
                  className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    groupBy === value
                      ? 'bg-[#1C1917] text-[#F6F5F1] dark:bg-[#F2F1EE] dark:text-[#111110]'
                      : 'text-[#57534E] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:text-[#F2F1EE]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden h-4 w-px bg-[#1C1917]/[0.09] sm:block dark:bg-white/[0.08]" />

          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-[#78716C] dark:text-[#8C8B85]">
              {t.matrix.sortBy}
            </span>
            <div className="flex flex-wrap items-center gap-1">
              {(
                [
                  ['lastActive', t.matrix.sortLastActive],
                  ['attention', t.matrix.sortAttention],
                  ['priority', t.matrix.sortPriority],
                  ['steps', t.matrix.sortSteps],
                  ['tokens', t.matrix.sortTokens],
                ] as const
              ).map(([field, label]) => {
                const active = sortBy === field;
                return (
                  <button
                    key={field}
                    type="button"
                    onClick={() => toggleSort(field)}
                    className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      active
                        ? 'bg-[#1C1917] text-[#F6F5F1] dark:bg-[#F2F1EE] dark:text-[#111110]'
                        : 'text-[#57534E] hover:bg-[#1C1917]/[0.05] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:bg-white/[0.06] dark:hover:text-[#F2F1EE]'
                    }`}
                  >
                    <span>{label}</span>
                    {active &&
                      (sortDir === 'desc' ? (
                        <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUp className="h-3 w-3" />
                      ))}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <span className="tabular-nums text-[11px] text-[#78716C] dark:text-[#8C8B85]">
          {t.matrix.showingCount(conversations.length, totalCount)}
        </span>
      </div>

      {/* Editorial Table */}
      <div className="overflow-hidden rounded-2xl border border-[#1C1917]/[0.08] bg-white shadow-[0_1px_2px_rgba(28,25,23,0.03)] dark:border-white/[0.07] dark:bg-[#1A1A18] dark:shadow-none">
        {conversations.length === 0 ? (
          <div className="py-16 text-center text-xs text-[#8C867E] dark:text-[#787771]">
            {t.matrix.empty}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[#1C1917]/[0.075] bg-[#FAF9F6] text-[10.5px] font-semibold tracking-wider text-[#8C867E] uppercase dark:border-white/[0.065] dark:bg-[#151513] dark:text-[#6E6D68]">
                  <th className="w-14 py-2.5 pl-3.5 pr-2"> </th>
                  <th className="py-2.5 pr-3">{t.matrix.colConversation}</th>
                  <th className="w-32 py-2.5 pr-3">{t.matrix.colLane}</th>
                  <th className="w-48 py-2.5 pr-3">{t.matrix.colWorkspace}</th>
                  <th className="w-28 py-2.5 pr-3">{t.matrix.colProgress}</th>
                  <th className="w-24 py-2.5 pr-3">{t.matrix.colAgents}</th>
                  <th className="w-28 py-2.5 pr-3 text-right whitespace-nowrap">{t.matrix.colTokens}</th>
                  <th className="w-28 py-2.5 pr-3 text-right whitespace-nowrap">{t.matrix.colLastActive}</th>
                  <th className="w-32 py-2.5 pr-3.5 text-right whitespace-nowrap">{t.matrix.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1C1917]/[0.055] text-xs dark:divide-white/[0.055]">
                {groups.map((group) => {
                  const collapsed = Boolean(collapsedGroups[group.key]);
                  const runningInGroup = group.items.filter((c) => c.isRunning).length;
                  const attentionInGroup = group.items.filter(
                    (c) => c.attentionReasons.length > 0,
                  ).length;

                  return (
                    <Fragment key={group.key}>
                      {groupBy !== 'none' && (
                        <tr className="bg-[#F6F5F1]/90 dark:bg-[#151513]">
                          <td colSpan={9} className="px-3.5 py-2">
                            <button
                              type="button"
                              onClick={() => toggleGroupCollapse(group.key)}
                              className="flex w-full items-center gap-2 text-left"
                            >
                              {collapsed ? (
                                <ChevronRight className="h-3.5 w-3.5 text-[#8C867E]" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-[#8C867E]" />
                              )}
                              <span className="text-xs font-semibold text-[#1C1917] dark:text-[#E7E5E0]">
                                {group.label}
                              </span>
                              <span className="tabular-nums text-[11px] text-[#8C867E] dark:text-[#6E6D68]">
                                {group.items.length}
                              </span>
                              {runningInGroup > 0 && (
                                <span className="tabular-nums inline-flex items-center gap-1.5 text-[11px] font-medium text-[#15803D] dark:text-[#4ADE80]">
                                  <LivePulseDot />
                                  {runningInGroup}
                                </span>
                              )}
                              {attentionInGroup > 0 && (
                                <span className="tabular-nums text-[11px] font-medium text-[#B45309] dark:text-[#FBBF24]">
                                  · {attentionInGroup} {t.lanes.attention}
                                </span>
                              )}
                            </button>
                          </td>
                        </tr>
                      )}

                      {!collapsed &&
                        group.items.map((card) => {
                          const selected = selectedId === card.id;
                          const progressPct =
                            card.stepsTotal > 0
                              ? Math.round((card.stepsCompleted / card.stepsTotal) * 100)
                              : 0;
                          const needsReview =
                            card.attentionReasons.length > 0 || card.lane === 'attention';
                          const topReason = primaryAttentionReason(card.attentionReasons);
                          const secondary = card.currentFocus || card.preview;

                          return (
                            <tr
                              key={`${group.key}-${card.id}`}
                              onClick={() => onSelectConversation(card.id)}
                              onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                onOpenMoveMenu(card, e.clientX, e.clientY);
                              }}
                              className={`group cursor-pointer transition-colors ${
                                selected
                                  ? 'bg-[#EFECE6]/75 dark:bg-[#232320]'
                                  : 'hover:bg-[#FAF9F6] dark:hover:bg-[#1F1F1D]'
                              }`}
                            >
                              {/* Pin & Priority */}
                              <td className="py-2.5 pl-3.5 pr-2 align-middle">
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onTogglePin(card);
                                    }}
                                    title={card.overlay.pinned ? t.card.unpin : t.card.pin}
                                    className={`rounded p-1 transition-colors ${
                                      card.overlay.pinned
                                        ? 'text-[#1C1917] dark:text-[#F2F1EE]'
                                        : 'text-[#C7C2BA] opacity-0 group-hover:opacity-100 hover:text-[#57534E] dark:text-[#4E4D48] dark:hover:text-[#D6D3CD]'
                                    }`}
                                  >
                                    <Pin
                                      className={`h-3.5 w-3.5 ${
                                        card.overlay.pinned ? 'fill-current' : ''
                                      }`}
                                    />
                                  </button>
                                  <PriorityBadge priority={card.overlay.priority} compact />
                                </div>
                              </td>

                              {/* Title + single calm secondary status/focus line */}
                              <td className="max-w-[460px] py-2.5 pr-3 align-middle">
                                <div className="truncate font-medium tracking-[-0.01em] text-[#1C1917] dark:text-[#F2F1EE]">
                                  {card.title || t.card.untitled}
                                </div>
                                {(topReason || secondary) && (
                                  <div className="mt-0.5 truncate text-[11.5px] text-[#78716C] dark:text-[#9F9E98]">
                                    {topReason && (
                                      <span
                                        className={`font-medium ${
                                          topReason === 'error'
                                            ? 'text-[#DC2626] dark:text-[#F87171]'
                                            : 'text-[#B45309] dark:text-[#FBBF24]'
                                        }`}
                                      >
                                        {t.attentionReasons[topReason]}
                                      </span>
                                    )}
                                    {topReason && secondary && (
                                      <span className="mx-1 opacity-45">·</span>
                                    )}
                                    {secondary && <span>{secondary}</span>}
                                  </div>
                                )}
                              </td>

                              {/* Lane */}
                              <td className="py-2.5 pr-3 align-middle">
                                <div className="flex flex-col items-start gap-0.5">
                                  <LanePill
                                    lane={card.lane}
                                    t={t}
                                    isRunning={card.isRunning}
                                  />
                                  {card.isManualLane && (
                                    <span className="pl-1 text-[10px] text-[#969088] dark:text-[#666560]">
                                      {t.lanes.manualBadge}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Plain Workspace & Tags */}
                              <td className="py-2.5 pr-3 align-middle">
                                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
                                  {card.workspace && (
                                    <span className="max-w-[140px] truncate text-[#57534E] dark:text-[#A1A09A]">
                                      {card.workspace}
                                    </span>
                                  )}
                                  {card.overlay.tags.slice(0, 2).map((tag) => (
                                    <span
                                      key={tag}
                                      className="text-[#8C867E] dark:text-[#73726C]"
                                    >
                                      #{tag}
                                    </span>
                                  ))}
                                  {card.overlay.tags.length > 2 && (
                                    <span className="tabular-nums text-[10px] text-[#A8A29E]">
                                      +{card.overlay.tags.length - 2}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Whisper-thin 2px Checklist Progress */}
                              <td className="py-2.5 pr-3 align-middle">
                                {card.stepsTotal > 0 ? (
                                  <div className="flex items-center gap-2">
                                    <div className="h-[2px] w-14 overflow-hidden rounded-full bg-[#1C1917]/[0.08] dark:bg-white/[0.08]">
                                      <div
                                        className={`h-full rounded-full ${
                                          card.hasError
                                            ? 'bg-[#DC2626]'
                                            : progressPct === 100
                                              ? 'bg-[#16A34A]'
                                              : 'bg-[#1C1917] dark:bg-[#E7E5E0]'
                                        }`}
                                        style={{ width: `${progressPct}%` }}
                                      />
                                    </div>
                                    <span className="tabular-nums text-[11px] text-[#57534E] dark:text-[#9F9E98]">
                                      {card.stepsCompleted}/{card.stepsTotal}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="tabular-nums text-[11px] text-[#969088] dark:text-[#666560]">
                                    {card.stepCount} {t.card.steps}
                                  </span>
                                )}
                              </td>

                              {/* Swarm / Subagents */}
                              <td className="py-2.5 pr-3 align-middle">
                                {card.swarm ? (
                                  <span className="tabular-nums inline-flex items-center gap-1 text-[11px] text-[#44403C] dark:text-[#D6D3CD]">
                                    <Network className="h-3 w-3 opacity-65" />
                                    <span>
                                      {card.swarm.workingCount}/{card.swarm.totalMembers}
                                    </span>
                                  </span>
                                ) : card.subagentCount > 0 ? (
                                  <span className="tabular-nums inline-flex items-center gap-1 text-[11px] text-[#78716C] dark:text-[#9F9E98]">
                                    <Users className="h-3 w-3 opacity-65" />
                                    <span>{card.subagentCount}</span>
                                  </span>
                                ) : (
                                  <span className="text-[#D6D3D1] dark:text-[#3A3936]">—</span>
                                )}
                              </td>

                              {/* Tokens */}
                              <td className="tabular-nums py-2.5 pr-3 text-right align-middle">
                                {card.tokens.totalTokens > 0 ? (
                                  <div>
                                    <div className="text-[11.5px] font-medium text-[#1C1917] dark:text-[#E7E5E0]">
                                      {formatCompactNumber(card.tokens.totalTokens)}
                                    </div>
                                    <div className="text-[10px] text-[#8C867E] dark:text-[#787771]">
                                      {formatPercent(card.tokens.cacheHitRate)}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-[#D6D3D1] dark:text-[#3A3936]">—</span>
                                )}
                              </td>

                              {/* Last Active */}
                              <td
                                className="tabular-nums py-2.5 pr-3 text-right align-middle text-[11px] whitespace-nowrap text-[#78716C] dark:text-[#8C8B85]"
                                title={formatDateTime(card.lastModifiedAt, locale)}
                              >
                                {formatRelativeTime(card.lastModifiedAt, t)}
                              </td>

                              {/* Quick Actions */}
                              <td className="py-2.5 pr-3.5 text-right align-middle whitespace-nowrap">
                                <div className="inline-flex items-center justify-end gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      const rect = e.currentTarget.getBoundingClientRect();
                                      onOpenMoveMenu(card, rect.left - 150, rect.bottom + 4);
                                    }}
                                    title={t.moveMenu.triggerTooltip}
                                    aria-label={t.moveMenu.triggerTooltip}
                                    className="rounded-md p-1 text-[#8C867E] opacity-0 transition-all group-hover:opacity-100 hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] focus:opacity-100 dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
                                  >
                                    <ArrowLeftRight className="h-3.5 w-3.5" />
                                  </button>
                                  {needsReview ? (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        onMarkReviewed(card);
                                      }}
                                      className="inline-flex items-center gap-1 rounded-md border border-[#1C1917]/[0.1] bg-white px-2 py-1 text-[10.5px] font-medium whitespace-nowrap text-[#44403C] transition-colors hover:border-[#1C1917]/30 hover:bg-[#1C1917] hover:text-[#F6F5F1] dark:border-white/[0.1] dark:bg-[#222220] dark:text-[#D6D3CD] dark:hover:bg-[#F2F1EE] dark:hover:text-[#111110]"
                                    >
                                      <CheckCheck className="h-3 w-3 shrink-0" />
                                      <span>{t.card.markReviewed}</span>
                                    </button>
                                  ) : (
                                    <span className="text-[10.5px] whitespace-nowrap text-[#A8A29E] dark:text-[#575652]">
                                      {t.card.reviewed}
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
