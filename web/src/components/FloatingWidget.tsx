import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BoardResponse, ConversationCard, LaneId, SseEvent } from '@shared/types';
import {
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  Minus,
  Moon,
  Network,
  Pin,
  RotateCcw,
  Sun,
} from 'lucide-react';
import {
  fetchBoard,
  markConversationReviewed,
  patchConversationOverlay,
  reviewConversationsBatch,
  subscribeBoardEvents,
  type SseStatus,
} from '../api';
import { getDesktopBridge, type DesktopState } from '../desktopBridge';
import { dictionaries, loadSavedLocale, type Locale } from '../i18n';
import { formatClockTime, formatRelativeTime } from '../utils';
import { LivePulseDot, PriorityBadge, primaryAttentionReason, priorityRank } from './badges';
import { BrandMark } from './BrandMark';
import type { ThemeMode } from './TopBar';

type WidgetFilter = 'focus' | 'running' | 'swarm' | 'all';

const DRAG_STYLE = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const NO_DRAG_STYLE = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

const COLLAPSED_SIZE = { width: 276, height: 56, expanded: false };
const EXPANDED_SIZE = { width: 392, height: 540, expanded: true };

interface MiniUndoBanner {
  label: string;
  onUndo: () => void;
}

function loadTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem('agmb_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
      return 'dark';
    }
  } catch {
    // ignore
  }
  return 'light';
}

function applyOptimisticReview(card: ConversationCard, reviewedAt: string | null): ConversationCard {
  if (reviewedAt === null) {
    return { ...card, overlay: { ...card.overlay, reviewedAt: null } };
  }
  const remaining = card.attentionReasons.filter(
    (r) => r !== 'unread_update' && r !== 'marked_as_unread',
  );
  const nextAuto: LaneId =
    !card.isRunning && !card.isArchived && remaining.length === 0 && card.autoLane === 'attention'
      ? 'active'
      : card.autoLane;
  return {
    ...card,
    markedAsUnread: false,
    attentionReasons: remaining,
    autoLane: nextAuto,
    lane: card.overlay.manualLane ?? nextAuto,
    overlay: { ...card.overlay, reviewedAt },
  };
}

function recomputeCounts(board: BoardResponse): BoardResponse {
  const byLane: Record<LaneId, number> = {
    running: 0,
    attention: 0,
    active: 0,
    stale: 0,
    archived: 0,
  };
  for (const c of board.conversations) byLane[c.lane] += 1;
  return {
    ...board,
    stats: {
      ...board.stats,
      byLane,
      attentionCount: byLane.attention,
      staleCount: byLane.stale,
      archivedCount: byLane.archived,
    },
  };
}

export function FloatingWidget() {
  const bridge = getDesktopBridge();
  const isElectron = Boolean(bridge);

  const [locale, setLocale] = useState<Locale>(loadSavedLocale);
  const [theme, setTheme] = useState<ThemeMode>(loadTheme);
  const [expanded, setExpanded] = useState<boolean>(() => {
    const param = new URLSearchParams(window.location.search).get('expanded');
    return param === '1' || param === 'true';
  });
  const [filter, setFilter] = useState<WidgetFilter>('focus');
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [sseStatus, setSseStatus] = useState<SseStatus>('connecting');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [undoBanner, setUndoBanner] = useState<MiniUndoBanner | null>(null);
  const undoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setClockTick] = useState(0);

  const t = dictionaries[locale];

  // Configure transparent canvas classes for widget mode
  useEffect(() => {
    document.documentElement.classList.add('widget-mode');
    if (isElectron) {
      document.documentElement.classList.add('desktop-electron');
    }
    return () => {
      document.documentElement.classList.remove('widget-mode', 'desktop-electron');
    };
  }, [isElectron]);

  // Apply theme & sync with Electron nativeTheme + localStorage
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    try {
      localStorage.setItem('agmb_theme', theme);
    } catch {
      // ignore
    }
    bridge?.setTheme?.(theme);
  }, [theme, bridge]);

  // Listen for cross-window theme/locale storage sync
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'agmb_theme' && (e.newValue === 'light' || e.newValue === 'dark')) {
        setTheme(e.newValue);
      }
      if (e.key === 'agmb_locale' && (e.newValue === 'zh' || e.newValue === 'en')) {
        setLocale(e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Sync Electron desktop state (alwaysOnTop etc.)
  useEffect(() => {
    if (!bridge) return;
    bridge
      .getDesktopState()
      .then((s: DesktopState) => setAlwaysOnTop(s.alwaysOnTop))
      .catch(() => {});
    return bridge.onDesktopStateChange((s) => setAlwaysOnTop(s.alwaysOnTop));
  }, [bridge]);

  // Resize frameless Electron window whenever expanded state changes
  useEffect(() => {
    if (!bridge) return;
    void bridge.resizeWidget(expanded ? EXPANDED_SIZE : COLLAPSED_SIZE);
  }, [expanded, bridge]);

  // Initial load + SSE live updates
  useEffect(() => {
    void fetchBoard()
      .then((res) => {
        setBoard(res);
        setLastSyncedAt(new Date());
      })
      .catch(() => {});

    const unsub = subscribeBoardEvents({
      onStatusChange: setSseStatus,
      onEvent: (ev: SseEvent) => {
        if (ev.type === 'board_update') {
          setBoard(ev.board);
          setLastSyncedAt(new Date());
        } else if (ev.type === 'connected') {
          setLastSyncedAt(new Date());
        }
      },
    });
    return unsub;
  }, []);

  // Sync tray tooltip counts whenever board updates
  useEffect(() => {
    if (!board || !bridge) return;
    bridge.updateTraySummary({
      running: board.stats.runningCount,
      attention: board.stats.attentionCount,
    });
  }, [board, bridge]);

  // 30s ticker for relative timestamps
  useEffect(() => {
    const id = setInterval(() => setClockTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const showUndo = useCallback((banner: MiniUndoBanner) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndoBanner(banner);
    undoTimerRef.current = setTimeout(() => setUndoBanner(null), 6500);
  }, []);

  const handleOpenMainBoard = useCallback(
    (conversationId?: string) => {
      if (bridge) {
        void bridge.openMainBoard(conversationId);
        return;
      }
      const targetUrl = conversationId
        ? `${window.location.origin}/#conv=${encodeURIComponent(conversationId)}`
        : window.location.origin + '/';
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
    },
    [bridge],
  );

  const handleToggleAlwaysOnTop = useCallback(async () => {
    const next = !alwaysOnTop;
    setAlwaysOnTop(next);
    if (bridge) {
      try {
        const applied = await bridge.setAlwaysOnTop(next);
        setAlwaysOnTop(applied);
      } catch {
        setAlwaysOnTop(!next);
      }
    }
  }, [alwaysOnTop, bridge]);

  const handleMarkReviewed = useCallback(
    async (card: ConversationCard) => {
      const prevReviewedAt = card.overlay.reviewedAt;
      const nowIso = new Date().toISOString();
      setBoard((prev) => {
        if (!prev) return prev;
        return recomputeCounts({
          ...prev,
          conversations: prev.conversations.map((c) =>
            c.id === card.id ? applyOptimisticReview(c, nowIso) : c,
          ),
        });
      });

      try {
        const res = await markConversationReviewed(card.id);
        if (res.card) {
          setBoard((prev) => {
            if (!prev) return prev;
            return recomputeCounts({
              ...prev,
              conversations: prev.conversations.map((c) =>
                c.id === card.id ? res.card! : c,
              ),
            });
          });
        }
        const short =
          card.title.length > 18 ? `${card.title.slice(0, 18)}…` : card.title;
        showUndo({
          label: t.toasts.markedReviewed(short || t.card.untitled),
          onUndo: () => {
            setUndoBanner(null);
            void patchConversationOverlay(card.id, {
              reviewedAt: prevReviewedAt,
            }).then(() => fetchBoard().then(setBoard).catch(() => {}));
          },
        });
      } catch {
        void fetchBoard().then(setBoard).catch(() => {});
      }
    },
    [showUndo, t],
  );

  const attentionCards = useMemo(
    () => (board?.conversations ?? []).filter((c) => c.lane === 'attention'),
    [board],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (attentionCards.length === 0) return;
    const ids = attentionCards.map((c) => c.id);
    const idSet = new Set(ids);
    const nowIso = new Date().toISOString();
    setBoard((prev) => {
      if (!prev) return prev;
      return recomputeCounts({
        ...prev,
        conversations: prev.conversations.map((c) =>
          idSet.has(c.id) ? applyOptimisticReview(c, nowIso) : c,
        ),
      });
    });

    try {
      const res = await reviewConversationsBatch({ ids });
      const map = new Map(res.cards.map((c) => [c.id, c]));
      setBoard((prev) => {
        if (!prev) return prev;
        return recomputeCounts({
          ...prev,
          conversations: prev.conversations.map((c) => map.get(c.id) ?? c),
        });
      });
      showUndo({
        label: t.toasts.markedAllReviewed(res.updatedCount || ids.length),
        onUndo: () => {
          setUndoBanner(null);
          void reviewConversationsBatch({ ids, reviewedAt: null }).then((uRes) => {
            const uMap = new Map(uRes.cards.map((c) => [c.id, c]));
            setBoard((prev) => {
              if (!prev) return prev;
              return recomputeCounts({
                ...prev,
                conversations: prev.conversations.map((c) => uMap.get(c.id) ?? c),
              });
            });
          });
        },
      });
    } catch {
      void fetchBoard().then(setBoard).catch(() => {});
    }
  }, [attentionCards, showUndo, t]);

  const runningCount = board?.stats.runningCount ?? 0;
  const attentionCount = board?.stats.attentionCount ?? 0;
  const allClear = runningCount === 0 && attentionCount === 0;

  const visibleItems = useMemo(() => {
    const list = board?.conversations ?? [];
    const filtered = list.filter((c) => {
      if (filter === 'focus') {
        return c.isRunning || c.lane === 'running' || c.lane === 'attention';
      }
      if (filter === 'running') {
        return c.isRunning || c.lane === 'running';
      }
      if (filter === 'swarm') {
        return c.swarm !== null || c.subagentCount > 0;
      }
      return c.lane !== 'archived';
    });

    return [...filtered].sort((a, b) => {
      if (a.isRunning !== b.isRunning) return a.isRunning ? -1 : 1;
      if ((a.lane === 'attention') !== (b.lane === 'attention')) {
        return a.lane === 'attention' ? -1 : 1;
      }
      const pDiff = priorityRank(b.overlay.priority) - priorityRank(a.overlay.priority);
      if (pDiff !== 0) return pDiff;
      return Date.parse(b.lastModifiedAt) - Date.parse(a.lastModifiedAt);
    });
  }, [board, filter]);

  const outerStageClass = isElectron
    ? 'flex h-screen w-screen items-center justify-center bg-transparent select-none'
    : 'flex h-screen w-screen items-center justify-center bg-[#E8E5DE] p-6 select-none dark:bg-[#0B0B0A]';

  /* ==================== STATE 1: COLLAPSED FLOATING CAPSULE ==================== */
  if (!expanded) {
    return (
      <div className={outerStageClass}>
        <div
          style={DRAG_STYLE}
          data-testid="widget-pill"
          className="flex h-[44px] w-[264px] items-center justify-between gap-1.5 rounded-full border border-[#1C1917]/[0.12] bg-white/96 pr-1.5 pl-2.5 text-[#1C1917] shadow-[0_10px_28px_-6px_rgba(28,25,23,0.22),0_1px_2px_rgba(28,25,23,0.08)] backdrop-blur-xl dark:border-white/[0.12] dark:bg-[#181816]/96 dark:text-[#F2F1EE] dark:shadow-[0_14px_34px_-6px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.06)]"
        >
          {/* Clickable status summary expands widget */}
          <button
            type="button"
            style={NO_DRAG_STYLE}
            onClick={() => setExpanded(true)}
            title={t.widget.expandTooltip}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-full py-1 text-left transition-opacity hover:opacity-85"
          >
            <BrandMark className="h-5 w-5" />

            {allClear ? (
              <span className="inline-flex items-center gap-1.5 truncate text-xs font-medium text-[#44403C] dark:text-[#D6D3CD]">
                <Check className="h-3.5 w-3.5 text-[#16A34A] dark:text-[#22C55E]" />
                <span>{t.widget.allClear}</span>
              </span>
            ) : (
              <div className="tabular-nums flex min-w-0 items-center gap-2 text-[11.5px] font-medium">
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  {runningCount > 0 ? (
                    <LivePulseDot />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-[#A8A29E] dark:bg-[#666560]" />
                  )}
                  <span>{t.widget.runningShort(runningCount)}</span>
                </span>
                <span className="text-[#D6D3D1] dark:text-[#3A3936]">·</span>
                <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      attentionCount > 0
                        ? 'bg-[#D97706] dark:bg-[#F59E0B]'
                        : 'bg-[#A8A29E] dark:bg-[#666560]'
                    }`}
                  />
                  <span>{t.widget.attentionShort(attentionCount)}</span>
                </span>
              </div>
            )}
          </button>

          {/* Compact expand + open main board icons */}
          <div style={NO_DRAG_STYLE} className="flex shrink-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setExpanded(true)}
              title={t.widget.expandTooltip}
              aria-label={t.widget.expandTooltip}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[#78716C] transition-colors hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
            >
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => handleOpenMainBoard()}
              title={t.widget.openBoardTooltip}
              aria-label={t.widget.openBoardTooltip}
              className="flex h-7 w-7 items-center justify-center rounded-full text-[#78716C] transition-colors hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ==================== STATE 2: EXPANDED FLOATING TRIAGE PANEL ==================== */
  return (
    <div className={outerStageClass}>
      <div
        data-testid="widget-panel"
        className="flex h-[520px] w-[376px] flex-col overflow-hidden rounded-2xl border border-[#1C1917]/[0.11] bg-[#FAF9F6] text-[#1C1917] shadow-[0_22px_54px_-12px_rgba(28,25,23,0.28),0_2px_6px_rgba(28,25,23,0.06)] dark:border-white/[0.11] dark:bg-[#161614] dark:text-[#F2F1EE] dark:shadow-[0_26px_64px_-12px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.06)]"
      >
        {/* Draggable Top Bar */}
        <header
          style={DRAG_STYLE}
          className="flex shrink-0 items-center justify-between gap-2 border-b border-[#1C1917]/[0.07] bg-white/80 px-3.5 py-2.5 backdrop-blur-md dark:border-white/[0.06] dark:bg-[#1B1B19]/90"
        >
          <div className="flex min-w-0 items-center gap-2">
            <BrandMark className="h-5 w-5" />
            <span className="truncate text-xs font-semibold tracking-[-0.01em]">
              Mission Board
            </span>
            {sseStatus === 'connected' ? (
              <LivePulseDot />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-[#D97706]" />
            )}
          </div>

          <div style={NO_DRAG_STYLE} className="flex shrink-0 items-center gap-0.5">
            {/* Always-on-Top Pin toggle */}
            <button
              type="button"
              onClick={() => void handleToggleAlwaysOnTop()}
              title={t.widget.pinTopTooltip}
              aria-label={t.widget.pinTopTooltip}
              className={`flex h-6.5 w-6.5 items-center justify-center rounded-md transition-colors ${
                alwaysOnTop
                  ? 'bg-[#1C1917] text-[#F6F5F1] dark:bg-[#F2F1EE] dark:text-[#111110]'
                  : 'text-[#78716C] hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]'
              }`}
            >
              <Pin className={`h-3 w-3 ${alwaysOnTop ? 'fill-current' : ''}`} />
            </button>

            {/* Theme toggle */}
            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              title={theme === 'dark' ? t.theme.switchToLight : t.theme.switchToDark}
              aria-label={theme === 'dark' ? t.theme.switchToLight : t.theme.switchToDark}
              className="flex h-6.5 w-6.5 items-center justify-center rounded-md text-[#78716C] transition-colors hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
            >
              {theme === 'dark' ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Open Full Board */}
            <button
              type="button"
              onClick={() => handleOpenMainBoard()}
              title={t.widget.openBoardTooltip}
              aria-label={t.widget.openBoardTooltip}
              className="flex h-6.5 w-6.5 items-center justify-center rounded-md text-[#78716C] transition-colors hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>

            {/* Collapse to Pill */}
            <button
              type="button"
              onClick={() => setExpanded(false)}
              title={t.widget.collapseTooltip}
              aria-label={t.widget.collapseTooltip}
              className="flex h-6.5 w-6.5 items-center justify-center rounded-md text-[#78716C] transition-colors hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Quiet Segmented Filter */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[#1C1917]/[0.06] px-3 py-2 dark:border-white/[0.05]">
          <div className="inline-flex w-full items-center rounded-lg bg-[#EFECE6]/85 p-0.5 dark:bg-[#1D1D1B]">
            {(
              [
                {
                  id: 'focus' as const,
                  label: t.widget.tabFocus,
                  count: runningCount + attentionCount,
                },
                {
                  id: 'running' as const,
                  label: t.widget.tabRunning,
                  count: runningCount,
                },
                {
                  id: 'swarm' as const,
                  label: t.widget.tabSwarm,
                  count: (board?.conversations ?? []).filter(
                    (c) => c.swarm !== null || c.subagentCount > 0,
                  ).length,
                },
                {
                  id: 'all' as const,
                  label: t.widget.tabAll,
                  count: (board?.conversations ?? []).filter((c) => c.lane !== 'archived')
                    .length,
                },
              ] as const
            ).map(({ id, label, count }) => {
              const active = filter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-[#1C1917] text-[#F6F5F1] shadow-xs dark:bg-[#F2F1EE] dark:text-[#111110]'
                      : 'text-[#57534E] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:text-[#F2F1EE]'
                  }`}
                >
                  <span>{label}</span>
                  <span className="tabular-nums font-mono text-[10px] opacity-65">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Triage List */}
        <div className="flex-1 overflow-y-auto px-2.5 py-2">
          {visibleItems.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center px-6 text-center">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#EFECE6] text-[#78716C] dark:bg-[#222220] dark:text-[#8C8B85]">
                <Check className="h-4 w-4" />
              </div>
              <p className="mt-2.5 text-xs text-[#78716C] dark:text-[#8C8B85]">
                {filter === 'focus' ? t.widget.emptyFocus : t.widget.emptyTab}
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {visibleItems.map((card) => {
                const topReason = primaryAttentionReason(card.attentionReasons);
                const needsReview =
                  card.attentionReasons.length > 0 || card.lane === 'attention';
                const progressPct =
                  card.stepsTotal > 0
                    ? Math.min(100, Math.round((card.stepsCompleted / card.stepsTotal) * 100))
                    : 0;
                const dotColor = card.hasError
                  ? 'bg-[#DC2626] dark:bg-[#EF4444]'
                  : card.lane === 'attention'
                    ? 'bg-[#D97706] dark:bg-[#F59E0B]'
                    : 'bg-[#A8A29E] dark:bg-[#666560]';

                return (
                  <div
                    key={card.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => handleOpenMainBoard(card.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleOpenMainBoard(card.id);
                      }
                    }}
                    className="group relative cursor-pointer rounded-xl border border-[#1C1917]/[0.065] bg-white px-3 py-2.5 transition-all hover:border-[#1C1917]/[0.15] hover:shadow-[0_4px_14px_-6px_rgba(28,25,23,0.12)] dark:border-white/[0.065] dark:bg-[#1D1D1B] dark:hover:border-white/[0.14] dark:hover:bg-[#222220]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {card.isRunning ? (
                          <LivePulseDot />
                        ) : (
                          <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
                        )}
                        <span className="truncate text-[12.5px] font-medium tracking-[-0.01em] text-[#1C1917] dark:text-[#F2F1EE]">
                          {card.title || t.card.untitled}
                        </span>
                      </div>

                      {/* 1-click hover Mark Reviewed button */}
                      {needsReview ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleMarkReviewed(card);
                          }}
                          className="shrink-0 rounded-md border border-[#1C1917]/[0.1] bg-[#FAF9F6] px-1.5 py-0.5 text-[10.5px] font-medium text-[#15803D] opacity-0 transition-opacity group-hover:opacity-100 hover:bg-[#16A34A]/10 focus:opacity-100 dark:border-white/[0.1] dark:bg-[#252522] dark:text-[#4ADE80] dark:hover:bg-[#22C55E]/15"
                        >
                          {t.widget.markReadShort}
                        </button>
                      ) : (
                        <span className="tabular-nums shrink-0 text-[10.5px] text-[#969088] dark:text-[#666560]">
                          {formatRelativeTime(card.lastModifiedAt, t)}
                        </span>
                      )}
                    </div>

                    {/* Secondary line: reason / focus */}
                    {(topReason || card.currentFocus || card.preview) && (
                      <p className="mt-1 line-clamp-1 pl-3.5 text-[11.5px] text-[#57534E] dark:text-[#9F9E98]">
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
                        {topReason && (card.currentFocus || card.preview) && (
                          <span className="mx-1 opacity-50">·</span>
                        )}
                        <span>{card.currentFocus || card.preview}</span>
                      </p>
                    )}

                    {/* Meta + whisper-thin 2px progress track */}
                    <div className="mt-1.5 flex items-center gap-2 pl-3.5 text-[10.5px] text-[#8C867E] dark:text-[#73726C]">
                      {card.workspace && (
                        <span className="max-w-[115px] truncate font-mono">
                          {card.workspace}
                        </span>
                      )}
                      <PriorityBadge priority={card.overlay.priority} compact />
                      {card.swarm && (
                        <span className="tabular-nums inline-flex items-center gap-0.5 font-mono">
                          <Network className="h-2.5 w-2.5" />
                          {card.swarm.workingCount}/{card.swarm.totalMembers}
                        </span>
                      )}

                      {card.stepsTotal > 0 ? (
                        <div className="ml-auto flex items-center gap-1.5">
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
                          <span className="tabular-nums font-mono text-[10px]">
                            {card.stepsCompleted}/{card.stepsTotal}
                          </span>
                        </div>
                      ) : (
                        <span className="tabular-nums ml-auto text-[10px]">
                          {formatRelativeTime(card.lastModifiedAt, t)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Inline Mini Undo Banner */}
        {undoBanner && (
          <div className="mx-2.5 mb-2 flex items-center justify-between gap-2 rounded-lg border border-[#1C1917]/[0.1] bg-[#1C1917] px-3 py-1.5 text-[11px] text-[#F6F5F1] dark:border-white/[0.12] dark:bg-[#262623] dark:text-[#F2F1EE]">
            <span className="truncate">{undoBanner.label}</span>
            <button
              type="button"
              onClick={undoBanner.onUndo}
              className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-amber-300 transition-colors hover:bg-white/10"
            >
              <RotateCcw className="h-3 w-3" />
              <span>{t.toasts.undo}</span>
            </button>
          </div>
        )}

        {/* Subtle Bottom Footer Bar */}
        <footer className="flex shrink-0 items-center justify-between border-t border-[#1C1917]/[0.07] bg-white/80 px-3.5 py-2 text-[11px] dark:border-white/[0.06] dark:bg-[#1B1B19]/90">
          {attentionCards.length > 0 ? (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              className="inline-flex items-center gap-1 font-medium text-[#57534E] transition-colors hover:text-[#1C1917] dark:text-[#A1A09A] dark:hover:text-[#F2F1EE]"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>{t.lanes.markAllRead}</span>
            </button>
          ) : (
            <span className="tabular-nums font-mono text-[10.5px] text-[#969088] dark:text-[#666560]">
              {formatClockTime(lastSyncedAt)}
            </span>
          )}

          <button
            type="button"
            onClick={() => handleOpenMainBoard()}
            className="inline-flex items-center gap-1 font-medium text-[#1C1917] transition-opacity hover:opacity-75 dark:text-[#F2F1EE]"
          >
            <span>{t.widget.openFullBoard}</span>
            <ArrowUpRight className="h-3.5 w-3.5" />
          </button>
        </footer>
      </div>
    </div>
  );
}
