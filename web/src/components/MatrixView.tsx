import { Fragment, useMemo, useState } from 'react';
import type { ConversationCard, LaneId } from '@shared/types';
import {
  ArrowDown,
  ArrowUp,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Compass,
  Folder,
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
  AttentionReasonBadge,
  LANE_ORDER,
  LanePill,
  LivePulseDot,
  PriorityBadge,
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
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200/80 bg-white px-3.5 py-2 dark:border-[#222733] dark:bg-[#13161D]">
        <div className="flex flex-wrap items-center gap-3">
          {/* Group by */}
          <div className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-zinc-400" />
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
              {t.matrix.groupBy}
            </span>
            <div className="inline-flex rounded-md border border-zinc-200/80 bg-zinc-50 p-0.5 dark:border-[#242A37] dark:bg-[#0E1117]">
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
                  className={`rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    groupBy === value
                      ? 'bg-white text-zinc-900 shadow-xs dark:bg-[#1E2330] dark:text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="hidden h-4 w-px bg-zinc-200 sm:block dark:bg-[#222733]" />

          {/* Sort by */}
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
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
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-950'
                        : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-[#1C212E] dark:hover:text-zinc-200'
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

        <span className="tabular-nums text-[11px] text-zinc-500 dark:text-zinc-400">
          {t.matrix.showingCount(conversations.length, totalCount)}
        </span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-zinc-200/90 bg-white dark:border-[#222733] dark:bg-[#13161D]">
        {conversations.length === 0 ? (
          <div className="py-16 text-center text-xs text-zinc-500 dark:text-zinc-400">
            {t.matrix.empty}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left">
              <thead>
                <tr className="border-b border-zinc-200/80 bg-zinc-50/80 text-[11px] font-semibold tracking-wide text-zinc-500 uppercase dark:border-[#222733] dark:bg-[#0F1218] dark:text-zinc-400">
                  <th className="w-14 py-2.5 pl-3.5 pr-2"> </th>
                  <th className="py-2.5 pr-3">{t.matrix.colConversation}</th>
                  <th className="w-32 py-2.5 pr-3">{t.matrix.colLane}</th>
                  <th className="w-48 py-2.5 pr-3">{t.matrix.colWorkspace}</th>
                  <th className="w-28 py-2.5 pr-3">{t.matrix.colProgress}</th>
                  <th className="w-28 py-2.5 pr-3">{t.matrix.colAgents}</th>
                  <th className="w-28 py-2.5 pr-3 text-right whitespace-nowrap">{t.matrix.colTokens}</th>
                  <th className="w-28 py-2.5 pr-3 text-right whitespace-nowrap">{t.matrix.colLastActive}</th>
                  <th className="w-32 py-2.5 pr-3.5 text-right whitespace-nowrap">{t.matrix.colActions}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 text-xs dark:divide-[#1D222E]">
                {groups.map((group) => {
                  const collapsed = Boolean(collapsedGroups[group.key]);
                  const runningInGroup = group.items.filter((c) => c.isRunning).length;
                  const attentionInGroup = group.items.filter(
                    (c) => c.attentionReasons.length > 0,
                  ).length;

                  return (
                    <Fragment key={group.key}>
                      {groupBy !== 'none' && (
                        <tr className="bg-zinc-50/90 dark:bg-[#10131A]">
                          <td colSpan={9} className="px-3.5 py-2">
                            <button
                              type="button"
                              onClick={() => toggleGroupCollapse(group.key)}
                              className="flex w-full items-center gap-2 text-left"
                            >
                              {collapsed ? (
                                <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                              )}
                              <span className="font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                                {group.label}
                              </span>
                              <span className="tabular-nums rounded-full bg-zinc-200/70 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 dark:bg-[#1E2330] dark:text-zinc-400">
                                {group.items.length}
                              </span>
                              {runningInGroup > 0 && (
                                <span className="tabular-nums inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-300">
                                  <LivePulseDot />
                                  {runningInGroup}
                                </span>
                              )}
                              {attentionInGroup > 0 && (
                                <span className="tabular-nums rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-500/12 dark:text-amber-300">
                                  {attentionInGroup} {t.lanes.attention}
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

                          return (
                            <tr
                              key={`${group.key}-${card.id}`}
                              onClick={() => onSelectConversation(card.id)}
                              className={`group cursor-pointer transition-colors ${
                                selected
                                  ? 'bg-sky-50/70 dark:bg-sky-500/10'
                                  : 'hover:bg-zinc-50/90 dark:hover:bg-[#171B24]'
                              }`}
                            >
                              {/* Pin & Priority */}
                              <td className="py-2.5 pl-3.5 pr-2 align-middle">
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onTogglePin(card);
                                    }}
                                    title={card.overlay.pinned ? t.card.unpin : t.card.pin}
                                    className={`rounded p-1 transition-colors ${
                                      card.overlay.pinned
                                        ? 'text-amber-500 dark:text-amber-400'
                                        : 'text-zinc-300 opacity-0 group-hover:opacity-100 hover:text-zinc-600 dark:text-zinc-600 dark:hover:text-zinc-300'
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

                              {/* Title + Focus + Attention badges */}
                              <td className="max-w-[460px] py-2.5 pr-3 align-middle">
                                <div className="truncate font-semibold text-zinc-900 dark:text-zinc-100">
                                  {card.title || t.card.untitled}
                                </div>
                                {(card.attentionReasons.length > 0 ||
                                  card.currentFocus ||
                                  card.preview) && (
                                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                    {card.attentionReasons.slice(0, 2).map((r) => (
                                      <AttentionReasonBadge key={r} reason={r} t={t} />
                                    ))}
                                    {(card.currentFocus || card.preview) && (
                                      <div className="flex min-w-0 flex-1 items-center gap-1 text-[11px] text-zinc-500 dark:text-zinc-400">
                                        {card.currentFocus && (
                                          <Compass className="h-3 w-3 shrink-0 text-sky-500/80" />
                                        )}
                                        <span className="truncate">
                                          {card.currentFocus || card.preview}
                                        </span>
                                      </div>
                                    )}
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
                                    <span className="pl-1 text-[10px] text-zinc-400 dark:text-zinc-500">
                                      {t.lanes.manualBadge}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Workspace & Tags */}
                              <td className="py-2.5 pr-3 align-middle">
                                <div className="flex flex-wrap items-center gap-1">
                                  {card.workspace && (
                                    <span className="inline-flex max-w-[140px] items-center gap-1 truncate rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10.5px] text-zinc-600 dark:bg-[#1B202C] dark:text-zinc-400">
                                      <Folder className="h-2.5 w-2.5 shrink-0 text-zinc-400" />
                                      <span className="truncate">{card.workspace}</span>
                                    </span>
                                  )}
                                  {card.overlay.tags.slice(0, 2).map((tag) => (
                                    <span
                                      key={tag}
                                      className="rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-500/12 dark:text-sky-300"
                                    >
                                      #{tag}
                                    </span>
                                  ))}
                                  {card.overlay.tags.length > 2 && (
                                    <span className="tabular-nums text-[10px] text-zinc-400">
                                      +{card.overlay.tags.length - 2}
                                    </span>
                                  )}
                                </div>
                              </td>

                              {/* Checklist Progress & Steps */}
                              <td className="py-2.5 pr-3 align-middle">
                                {card.stepsTotal > 0 ? (
                                  <div className="flex items-center gap-2">
                                    <div className="h-1.5 w-14 overflow-hidden rounded-full bg-zinc-100 dark:bg-[#1E2330]">
                                      <div
                                        className={`h-full rounded-full ${
                                          progressPct === 100
                                            ? 'bg-emerald-500'
                                            : 'bg-sky-500'
                                        }`}
                                        style={{ width: `${progressPct}%` }}
                                      />
                                    </div>
                                    <span className="tabular-nums font-mono text-[11px] text-zinc-600 dark:text-zinc-400">
                                      {card.stepsCompleted}/{card.stepsTotal}
                                    </span>
                                  </div>
                                ) : (
                                  <span className="tabular-nums text-[11px] text-zinc-400 dark:text-zinc-500">
                                    {card.stepCount} {t.card.steps}
                                  </span>
                                )}
                              </td>

                              {/* Swarm / Subagents */}
                              <td className="py-2.5 pr-3 align-middle">
                                {card.swarm ? (
                                  <span className="tabular-nums inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10.5px] font-medium text-indigo-700 dark:bg-indigo-500/12 dark:text-indigo-300">
                                    <Network className="h-3 w-3" />
                                    <span>
                                      {card.swarm.workingCount}/{card.swarm.totalMembers}
                                    </span>
                                  </span>
                                ) : card.subagentCount > 0 ? (
                                  <span className="tabular-nums inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10.5px] font-medium text-zinc-600 dark:bg-[#1E2330] dark:text-zinc-300">
                                    <Users className="h-3 w-3" />
                                    <span>{card.subagentCount}</span>
                                  </span>
                                ) : (
                                  <span className="text-zinc-300 dark:text-zinc-700">—</span>
                                )}
                              </td>

                              {/* Tokens */}
                              <td className="tabular-nums py-2.5 pr-3 text-right align-middle">
                                {card.tokens.totalTokens > 0 ? (
                                  <div>
                                    <div className="font-mono text-[11.5px] font-medium text-zinc-800 dark:text-zinc-200">
                                      {formatCompactNumber(card.tokens.totalTokens)}
                                    </div>
                                    <div className="text-[10px] text-emerald-600 dark:text-emerald-400">
                                      {formatPercent(card.tokens.cacheHitRate)}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-zinc-300 dark:text-zinc-700">—</span>
                                )}
                              </td>

                              {/* Last Active */}
                              <td
                                className="tabular-nums py-2.5 pr-3 text-right align-middle text-[11px] whitespace-nowrap text-zinc-500 dark:text-zinc-400"
                                title={formatDateTime(card.lastModifiedAt, locale)}
                              >
                                {formatRelativeTime(card.lastModifiedAt, t)}
                              </td>

                              {/* Quick Actions */}
                              <td className="py-2.5 pr-3.5 text-right align-middle whitespace-nowrap">
                                {needsReview ? (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onMarkReviewed(card);
                                    }}
                                    className="inline-flex items-center gap-1 rounded border border-zinc-200 bg-white px-2 py-1 text-[10.5px] font-medium whitespace-nowrap text-zinc-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 dark:border-[#2A3040] dark:bg-[#181C25] dark:text-zinc-300 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-300"
                                  >
                                    <CheckCheck className="h-3 w-3 shrink-0" />
                                    <span>{t.card.markReviewed}</span>
                                  </button>
                                ) : (
                                  <span className="text-[10.5px] whitespace-nowrap text-zinc-400 dark:text-zinc-600">
                                    {t.card.reviewed}
                                  </span>
                                )}
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
