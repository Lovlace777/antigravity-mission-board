import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AttentionReason,
  BoardResponse,
  ConversationCard,
  LaneId,
  OverlayPatch,
  Priority,
  SseEvent,
  StepItem,
} from '@shared/types';
import {
  Archive,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Circle,
  Compass,
  CornerDownLeft,
  FileCheck2,
  Loader2,
  Lock,
  MessageSquare,
  MinusCircle,
  Moon,
  Network,
  Pin,
  RotateCcw,
  Sun,
  X,
  XCircle,
} from 'lucide-react';
import {
  fetchBoard,
  markConversationReviewed,
  patchConversationOverlay,
  reviewConversationsBatch,
  subscribeBoardEvents,
  type SseStatus,
} from '../api';
import {
  WIDGET_PRESET_SIZES,
  getDesktopBridge,
  parseUrlWidgetPreset,
  type DesktopState,
  type WidgetLayoutState,
  type WidgetPreset,
} from '../desktopBridge';
import { dictionaries, loadSavedLocale, type Dictionary, type Locale } from '../i18n';
import { formatClockTime, formatRelativeTime } from '../utils';
import {
  LANE_ORDER,
  LivePulseDot,
  PriorityBadge,
  laneAccentDot,
  primaryAttentionReason,
  priorityRank,
} from './badges';
import { BrandMark } from './BrandMark';
import { PushForwardComposer } from './PushForwardComposer';
import { TaskMoveMenu, type TaskMoveMenuState } from './TaskMoveMenu';
import type { ThemeMode } from './TopBar';

type WidgetFilter = 'open' | 'running' | 'attention' | 'swarm' | 'archived';

const OPEN_LANES: LaneId[] = ['running', 'attention', 'active', 'stale'];

const DRAG_STYLE = { WebkitAppRegion: 'drag' } as React.CSSProperties;
const NO_DRAG_STYLE = { WebkitAppRegion: 'no-drag' } as React.CSSProperties;

interface MiniToast {
  label: string;
  tone?: 'info' | 'success' | 'error';
  onUndo?: () => void;
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

function loadSavedPreset(): WidgetPreset {
  const fromUrl = parseUrlWidgetPreset();
  if (fromUrl) return fromUrl;
  try {
    const saved = localStorage.getItem('agmb_widget_preset');
    if (saved === 'S' || saved === 'M' || saved === 'L') return saved;
  } catch {
    // ignore
  }
  return 'M';
}

function parseUrlHoverId(): string | null {
  if (typeof window === 'undefined') return null;
  const val = new URLSearchParams(window.location.search).get('hover');
  return val && val.trim() ? val.trim() : null;
}

function applyOptimisticOverlay(
  card: ConversationCard,
  patch: OverlayPatch,
): ConversationCard {
  const nextOverlay = {
    ...card.overlay,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  const nextManualLane =
    patch.manualLane !== undefined ? patch.manualLane : card.overlay.manualLane;
  const nextLane: LaneId = nextManualLane ?? card.autoLane;

  let nextReasons: AttentionReason[] = card.attentionReasons.filter(
    (r) => r !== 'manual_attention',
  );
  if (nextManualLane === 'attention' && nextReasons.length === 0) {
    nextReasons = ['manual_attention'];
  }

  return {
    ...card,
    lane: nextLane,
    isManualLane: nextManualLane !== null,
    attentionReasons: nextReasons,
    overlay: nextOverlay,
  };
}

function applyOptimisticReview(
  card: ConversationCard,
  reviewedAt: string | null,
): ConversationCard {
  if (reviewedAt === null) {
    return { ...card, overlay: { ...card.overlay, reviewedAt: null } };
  }
  const remaining = card.attentionReasons.filter(
    (r) =>
      r !== 'unread_update' &&
      r !== 'marked_as_unread' &&
      r !== 'manual_attention',
  );
  const clearedManual =
    card.overlay.manualLane === 'attention' ? null : card.overlay.manualLane;
  const nextAuto: LaneId =
    !card.isRunning &&
    !card.isArchived &&
    remaining.length === 0 &&
    card.autoLane === 'attention'
      ? 'active'
      : card.autoLane;
  return {
    ...card,
    markedAsUnread: false,
    attentionReasons: remaining,
    autoLane: nextAuto,
    lane: clearedManual ?? nextAuto,
    isManualLane: clearedManual !== null,
    overlay: { ...card.overlay, reviewedAt, manualLane: clearedManual },
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

function shortReasonText(reason: AttentionReason | null, t: Dictionary): string | null {
  if (!reason) return null;
  switch (reason) {
    case 'error':
      return t.widget.shortError;
    case 'request_feedback':
      return t.widget.shortFeedback;
    case 'needs_input':
      return t.widget.shortDecision;
    case 'follow_up_due':
      return t.widget.shortDue;
    case 'manual_attention':
      return t.widget.shortFlagged;
    case 'unread_update':
    case 'marked_as_unread':
      return t.widget.shortUnread;
    default:
      return null;
  }
}

function shortenTitle(title: string, fallback: string): string {
  const clean = (title || fallback).trim();
  return clean.length > 20 ? `${clean.slice(0, 20)}…` : clean;
}

function MiniStepIcon({ status }: { status: StepItem['status'] }) {
  switch (status) {
    case 'done':
      return <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-[#16A34A] dark:text-[#22C55E]" />;
    case 'in_progress':
      return <Loader2 className="mt-0.5 h-3 w-3 shrink-0 animate-spin text-[#1C1917] dark:text-[#F2F1EE]" />;
    case 'failed':
      return <XCircle className="mt-0.5 h-3 w-3 shrink-0 text-[#DC2626] dark:text-[#EF4444]" />;
    case 'skipped':
      return <MinusCircle className="mt-0.5 h-3 w-3 shrink-0 text-[#A8A29E] dark:text-[#666560]" />;
    default:
      return <Circle className="mt-0.5 h-3 w-3 shrink-0 text-[#D6D3D1] dark:text-[#44433F]" />;
  }
}

/* ==================== Memoized Ultra-Dense Draggable Radar Title Row ==================== */

interface RadarTitleRowProps {
  card: ConversationCard;
  dense: boolean;
  isActive: boolean;
  isLocked: boolean;
  isDragging: boolean;
  onHover: (id: string) => void;
  onToggleLock: (id: string) => void;
  onMarkReviewed: (card: ConversationCard) => void;
  onOpenDetail: (id: string) => void;
  onOpenMoveMenu: (card: ConversationCard, x: number, y: number) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  t: Dictionary;
}

const RadarTitleRow = memo(function RadarTitleRow({
  card,
  dense,
  isActive,
  isLocked,
  isDragging,
  onHover,
  onToggleLock,
  onMarkReviewed,
  onOpenDetail,
  onOpenMoveMenu,
  onDragStart,
  onDragEnd,
  t,
}: RadarTitleRowProps) {
  const topReason = primaryAttentionReason(card.attentionReasons);
  const shortStatus = shortReasonText(topReason, t);
  const needsReview = card.attentionReasons.length > 0 || card.lane === 'attention';

  const dotColor = card.hasError
    ? 'bg-[#DC2626] dark:bg-[#EF4444]'
    : card.lane === 'attention' || card.attentionReasons.length > 0
      ? 'bg-[#D97706] dark:bg-[#F59E0B]'
      : card.lane === 'active'
        ? 'bg-[#78716C] dark:bg-[#8C8B85]'
        : 'bg-[#C7C2BA] dark:bg-[#4E4D48]';

  const statusTone =
    topReason === 'error'
      ? 'text-[#DC2626] dark:text-[#F87171]'
      : topReason
        ? 'text-[#B45309] dark:text-[#FBBF24]'
        : 'text-[#969088] dark:text-[#6E6D68]';

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, card.id)}
      onDragEnd={onDragEnd}
      role="button"
      tabIndex={0}
      data-testid={`radar-row-${card.id}`}
      onMouseEnter={() => onHover(card.id)}
      onFocus={() => onHover(card.id)}
      onClick={() => onToggleLock(card.id)}
      onDoubleClick={() => onOpenDetail(card.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenMoveMenu(card, e.clientX, e.clientY);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleLock(card.id);
        }
      }}
      className={`group flex cursor-pointer items-center gap-2 rounded-lg px-2 transition-colors select-none ${
        dense ? 'h-[26px]' : 'h-[28px]'
      } ${
        isLocked
          ? 'bg-[#1C1917]/[0.09] text-[#1C1917] ring-1 ring-inset ring-[#1C1917]/[0.12] dark:bg-white/[0.11] dark:text-[#F2F1EE] dark:ring-white/[0.14]'
          : isActive
            ? 'bg-[#1C1917]/[0.055] text-[#1C1917] dark:bg-white/[0.065] dark:text-[#F2F1EE]'
            : 'text-[#44403C] hover:bg-[#1C1917]/[0.045] dark:text-[#D6D3CD] dark:hover:bg-white/[0.055]'
      } ${isDragging ? 'opacity-40' : ''}`}
    >
      {/* 6px semantic status dot */}
      {card.isRunning ? (
        <LivePulseDot />
      ) : (
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
      )}

      {/* Crisp humanist title */}
      <span
        className={`min-w-0 flex-1 truncate tracking-[-0.01em] ${
          dense ? 'text-[12px]' : 'text-[12.5px]'
        } ${
          card.isRunning || card.lane === 'attention' || isActive
            ? 'font-medium text-[#1C1917] dark:text-[#F2F1EE]'
            : 'font-normal'
        }`}
      >
        {card.title || t.card.untitled}
      </span>

      {/* Subtle pin / lock indicators */}
      {card.overlay.pinned && (
        <Pin className="h-2.5 w-2.5 shrink-0 fill-current text-[#8C867E] dark:text-[#787771]" />
      )}
      {isLocked && (
        <Lock className="h-2.5 w-2.5 shrink-0 text-[#78716C] dark:text-[#A1A09A]" />
      )}

      {/* Hover quick icons (⇄ Move + ✓ Mark Reviewed) or right whisper */}
      <div className="flex shrink-0 items-center gap-0.5">
        <button
          type="button"
          data-testid={`radar-move-btn-${card.id}`}
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            onOpenMoveMenu(card, rect.left - 140, rect.bottom + 4);
          }}
          title={t.moveMenu.triggerTooltip}
          aria-label={t.moveMenu.triggerTooltip}
          className="hidden h-5 w-5 items-center justify-center rounded text-[#78716C] transition-colors group-hover:inline-flex hover:bg-[#1C1917]/[0.08] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:bg-white/[0.1] dark:hover:text-[#F2F1EE]"
        >
          <ArrowLeftRight className="h-3 w-3" />
        </button>

        {needsReview && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onMarkReviewed(card);
            }}
            title={t.card.markReviewed}
            aria-label={t.card.markReviewed}
            className="hidden h-5 w-5 items-center justify-center rounded text-[#15803D] transition-colors group-hover:inline-flex hover:bg-[#16A34A]/15 dark:text-[#4ADE80] dark:hover:bg-[#22C55E]/15"
          >
            <Check className="h-3 w-3" />
          </button>
        )}

        <span
          className={`tabular-nums text-[10.5px] font-medium ${statusTone} group-hover:hidden`}
        >
          {shortStatus
            ? shortStatus
            : card.stepsTotal > 0
              ? `${card.stepsCompleted}/${card.stepsTotal}`
              : formatRelativeTime(card.lastModifiedAt, t)}
        </span>
      </div>
    </div>
  );
});

/* ==================== Main Floating Widget ==================== */

export function FloatingWidget() {
  const bridge = getDesktopBridge();
  const isElectron = Boolean(bridge);

  const [locale, setLocale] = useState<Locale>(loadSavedLocale);
  const [theme, setTheme] = useState<ThemeMode>(loadTheme);
  const [layout, setLayout] = useState<WidgetLayoutState>(() => {
    const initial = loadSavedPreset();
    const dims = WIDGET_PRESET_SIZES[initial];
    return { preset: initial, width: dims.width, height: dims.height };
  });
  const [viewportSize, setViewportSize] = useState<{ width: number; height: number }>(() => ({
    width: typeof window !== 'undefined' ? window.innerWidth : 390,
    height: typeof window !== 'undefined' ? window.innerHeight : 600,
  }));

  const [filter, setFilter] = useState<WidgetFilter>('open');
  const [collapsedLanes, setCollapsedLanes] = useState<Record<string, boolean>>({});
  const [alwaysOnTop, setAlwaysOnTop] = useState(true);
  const [widgetVisible, setWidgetVisible] = useState(true);

  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [sseStatus, setSseStatus] = useState<SseStatus>('connecting');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  // Auto-hide hover state (null at rest!) + click-to-lock + grace leave timer
  const [hoveredId, setHoveredId] = useState<string | null>(() => parseUrlHoverId());
  const [lockedId, setLockedId] = useState<string | null>(null);
  const [mediumComposerOpen, setMediumComposerOpen] = useState(false);
  const leaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Drag-and-drop + Context/Move Menu state
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverLane, setDragOverLane] = useState<LaneId | null>(null);
  const [moveMenu, setMoveMenu] = useState<TaskMoveMenuState | null>(null);

  const [toast, setToast] = useState<MiniToast | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setClockTick] = useState(0);

  const t = dictionaries[locale];

  const cancelLeaveTimer = useCallback(() => {
    if (leaveTimerRef.current) {
      clearTimeout(leaveTimerRef.current);
      leaveTimerRef.current = null;
    }
  }, []);

  const scheduleHoverClear = useCallback(() => {
    cancelLeaveTimer();
    leaveTimerRef.current = setTimeout(() => {
      setHoveredId(null);
      leaveTimerRef.current = null;
    }, 260);
  }, [cancelLeaveTimer]);

  useEffect(() => {
    return () => {
      cancelLeaveTimer();
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, [cancelLeaveTimer]);

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

  // Cross-window theme/locale sync
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

  // Track Electron free-resize viewport fluidly
  useEffect(() => {
    if (!isElectron) return;
    const onResize = () => {
      setViewportSize({ width: window.innerWidth, height: window.innerHeight });
    };
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [isElectron]);

  // Sync Electron desktop state, widget layout, and visibility
  useEffect(() => {
    if (!bridge) return;
    bridge
      .getDesktopState()
      .then((s: DesktopState) => {
        setAlwaysOnTop(s.alwaysOnTop);
        setWidgetVisible(s.widgetVisible);
        if (s.widgetLayout) setLayout(s.widgetLayout);
      })
      .catch(() => {});

    bridge
      .getWidgetLayout?.()
      .then((wl) => setLayout(wl))
      .catch(() => {});

    const unsubState = bridge.onDesktopStateChange((s) => {
      setAlwaysOnTop(s.alwaysOnTop);
      setWidgetVisible(s.widgetVisible);
      if (s.widgetLayout) setLayout(s.widgetLayout);
    });
    const unsubLayout = bridge.onWidgetLayoutChange?.((wl) => setLayout(wl)) ?? (() => {});
    const unsubVis =
      bridge.onWidgetVisibilityChange?.((visible) => setWidgetVisible(visible)) ??
      (() => {});

    return () => {
      unsubState();
      unsubLayout();
      unsubVis();
    };
  }, [bridge]);

  // Low-Resource SSE Lifecycle: close SSE completely when hidden/sleeping
  useEffect(() => {
    if (!widgetVisible) {
      setSseStatus('disconnected');
      return;
    }

    let cancelled = false;
    void fetchBoard()
      .then((res) => {
        if (!cancelled) {
          setBoard(res);
          setLastSyncedAt(new Date());
        }
      })
      .catch(() => {});

    const unsub = subscribeBoardEvents({
      onStatusChange: (st) => {
        if (!cancelled) setSseStatus(st);
      },
      onEvent: (ev: SseEvent) => {
        if (cancelled) return;
        if (ev.type === 'board_update') {
          setBoard(ev.board);
          setLastSyncedAt(new Date());
        } else if (ev.type === 'connected') {
          setLastSyncedAt(new Date());
        }
      },
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [widgetVisible]);

  // Sync live tray summary counts
  useEffect(() => {
    if (!board || !bridge) return;
    bridge.updateTraySummary({
      running: board.stats.runningCount,
      attention: board.stats.attentionCount,
    });
  }, [board, bridge]);

  // Pause relative clock tick when hidden
  useEffect(() => {
    if (!widgetVisible) return;
    const id = setInterval(() => {
      if (!document.hidden) setClockTick((n) => n + 1);
    }, 30_000);
    return () => clearInterval(id);
  }, [widgetVisible]);

  // Esc dismisses move menu or locked preview cleanly
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (moveMenu) {
          setMoveMenu(null);
          return;
        }
        if (lockedId || hoveredId || mediumComposerOpen) {
          cancelLeaveTimer();
          setLockedId(null);
          setHoveredId(null);
          setMediumComposerOpen(false);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [moveMenu, lockedId, hoveredId, mediumComposerOpen, cancelLeaveTimer]);

  const showToast = useCallback((next: MiniToast, durationMs?: number) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast(next);
    toastTimerRef.current = setTimeout(
      () => setToast(null),
      durationMs ?? (next.onUndo ? 6500 : 4200),
    );
  }, []);

  const handleSelectPreset = useCallback(
    async (preset: WidgetPreset) => {
      const dims = WIDGET_PRESET_SIZES[preset];
      setLayout({ preset, width: dims.width, height: dims.height });
      try {
        localStorage.setItem('agmb_widget_preset', preset);
      } catch {
        // ignore
      }
      if (bridge?.setWidgetPreset) {
        try {
          const applied = await bridge.setWidgetPreset(preset);
          setLayout(applied);
        } catch {
          // ignore
        }
      }
    },
    [bridge],
  );

  const handleOpenMainBoard = useCallback(
    (conversationId?: string) => {
      if (bridge) {
        void bridge.openMainBoard(conversationId);
        return;
      }
      const targetUrl = conversationId
        ? `${window.location.origin}/#conv=${encodeURIComponent(conversationId)}`
        : `${window.location.origin}/`;
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

  // Optimistic Overlay Patch inside Widget
  const handlePatchOverlay = useCallback(
    async (id: string, patch: OverlayPatch): Promise<boolean> => {
      let snapshot: BoardResponse | null = null;
      setBoard((prev) => {
        if (!prev) return prev;
        snapshot = prev;
        return recomputeCounts({
          ...prev,
          conversations: prev.conversations.map((c) =>
            c.id === id ? applyOptimisticOverlay(c, patch) : c,
          ),
        });
      });

      try {
        const res = await patchConversationOverlay(id, patch);
        if (res.card) {
          setBoard((prev) => {
            if (!prev) return prev;
            return recomputeCounts({
              ...prev,
              conversations: prev.conversations.map((c) =>
                c.id === id ? res.card! : c,
              ),
            });
          });
        }
        return true;
      } catch {
        if (snapshot) setBoard(snapshot);
        showToast({ label: t.errors.updateFailed, tone: 'error' });
        return false;
      }
    },
    [showToast, t.errors.updateFailed],
  );

  const handleMoveLane = useCallback(
    (card: ConversationCard, targetLane: LaneId) => {
      const prevManualLane = card.overlay.manualLane;
      const nextManualLane = targetLane === card.autoLane ? null : targetLane;
      const short = shortenTitle(card.title, t.card.untitled);
      void handlePatchOverlay(card.id, { manualLane: nextManualLane }).then((ok) => {
        if (!ok) return;
        showToast({
          label: t.toasts.movedToLane(short, t.lanes[targetLane]),
          tone: 'info',
          onUndo: () => {
            setToast(null);
            void handlePatchOverlay(card.id, { manualLane: prevManualLane }).then(() =>
              showToast({ label: t.toasts.undone, tone: 'info' }, 2200),
            );
          },
        });
      });
    },
    [handlePatchOverlay, showToast, t],
  );

  const handleResetManualLane = useCallback(
    (card: ConversationCard) => {
      const prevManualLane = card.overlay.manualLane;
      const short = shortenTitle(card.title, t.card.untitled);
      void handlePatchOverlay(card.id, { manualLane: null }).then((ok) => {
        if (!ok) return;
        showToast({
          label: t.toasts.resetAutoLane(short),
          tone: 'info',
          onUndo:
            prevManualLane !== null
              ? () => {
                  setToast(null);
                  void handlePatchOverlay(card.id, {
                    manualLane: prevManualLane,
                  }).then(() =>
                    showToast({ label: t.toasts.undone, tone: 'info' }, 2200),
                  );
                }
              : undefined,
        });
      });
    },
    [handlePatchOverlay, showToast, t],
  );

  const handleTogglePin = useCallback(
    (card: ConversationCard) => {
      const nextPinned = !card.overlay.pinned;
      const short = shortenTitle(card.title, t.card.untitled);
      void handlePatchOverlay(card.id, { pinned: nextPinned }).then((ok) => {
        if (ok) {
          showToast(
            {
              label: nextPinned ? t.toasts.pinned(short) : t.toasts.unpinned(short),
              tone: 'info',
            },
            2400,
          );
        }
      });
    },
    [handlePatchOverlay, showToast, t],
  );

  const handleSetPriority = useCallback(
    (card: ConversationCard, priority: Priority) => {
      const short = shortenTitle(card.title, t.card.untitled);
      void handlePatchOverlay(card.id, { priority }).then((ok) => {
        if (ok) {
          showToast(
            {
              label: priority
                ? t.toasts.prioritySet(short, priority.toUpperCase())
                : t.toasts.priorityCleared(short),
              tone: 'info',
            },
            2400,
          );
        }
      });
    },
    [handlePatchOverlay, showToast, t],
  );

  const handleMarkReviewed = useCallback(
    async (card: ConversationCard) => {
      const prevReviewedAt = card.overlay.reviewedAt;
      const prevManualLane = card.overlay.manualLane;
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
        const short = shortenTitle(card.title, t.card.untitled);
        showToast({
          label: t.toasts.markedReviewed(short),
          tone: 'success',
          onUndo: () => {
            setToast(null);
            void patchConversationOverlay(card.id, {
              reviewedAt: prevReviewedAt,
              manualLane: prevManualLane,
            }).then(() => fetchBoard().then(setBoard).catch(() => {}));
          },
        });
      } catch {
        void fetchBoard().then(setBoard).catch(() => {});
      }
    },
    [showToast, t],
  );

  const attentionCards = useMemo(
    () => (board?.conversations ?? []).filter((c) => c.lane === 'attention'),
    [board],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (attentionCards.length === 0) return;
    const ids = attentionCards.map((c) => c.id);
    const restoreManualLanes: Record<string, LaneId | null> = {};
    for (const c of attentionCards) {
      if (c.overlay.manualLane === 'attention') {
        restoreManualLanes[c.id] = 'attention';
      }
    }
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
      showToast({
        label: t.toasts.markedAllReviewed(res.updatedCount || ids.length),
        tone: 'success',
        onUndo: () => {
          setToast(null);
          void reviewConversationsBatch({
            ids,
            reviewedAt: null,
            restoreManualLanes,
          }).then((uRes) => {
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
  }, [attentionCards, showToast, t]);

  const handleHoverRow = useCallback(
    (id: string) => {
      cancelLeaveTimer();
      setHoveredId(id);
    },
    [cancelLeaveTimer],
  );

  const handleToggleLockRow = useCallback(
    (id: string) => {
      cancelLeaveTimer();
      setLockedId((prev) => {
        const next = prev === id ? null : id;
        setMediumComposerOpen(next !== null);
        if (next === null) setHoveredId(null);
        return next;
      });
    },
    [cancelLeaveTimer],
  );

  const handleOpenMoveMenu = useCallback(
    (card: ConversationCard, x: number, y: number) => {
      cancelLeaveTimer();
      setMoveMenu({ card, x, y });
    },
    [cancelLeaveTimer],
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, id: string) => {
      cancelLeaveTimer();
      setMoveMenu(null);
      setDraggingId(id);
      e.dataTransfer.setData('text/plain', id);
      e.dataTransfer.effectAllowed = 'move';
    },
    [cancelLeaveTimer],
  );

  const handleDragEnd = useCallback(() => {
    setDraggingId(null);
    setDragOverLane(null);
  }, []);

  const handleDragOverLane = useCallback(
    (e: React.DragEvent, lane: LaneId) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (dragOverLane !== lane) setDragOverLane(lane);
    },
    [dragOverLane],
  );

  const handleDispatchSuccess = useCallback(
    (msg: string, updatedCard: ConversationCard | null) => {
      if (updatedCard) {
        setBoard((prev) => {
          if (!prev) return prev;
          return recomputeCounts({
            ...prev,
            conversations: prev.conversations.map((c) =>
              c.id === updatedCard.id ? updatedCard : c,
            ),
          });
        });
      }
      showToast({ label: msg, tone: 'success' }, 4800);
    },
    [showToast],
  );

  // Determine effective responsive view mode
  const activeWidth = isElectron ? viewportSize.width : layout.width;
  const activeHeight = isElectron ? viewportSize.height : layout.height;
  const effectiveMode: WidgetPreset =
    layout.preset === 'S' || (layout.preset === 'custom' && activeHeight <= 84)
      ? 'S'
      : layout.preset === 'L' || (layout.preset === 'custom' && activeWidth >= 580)
        ? 'L'
        : 'M';

  // Counts & Grouped Conversations
  const allConversations = board?.conversations ?? [];
  const cardById = useMemo(() => {
    const m = new Map<string, ConversationCard>();
    for (const c of allConversations) m.set(c.id, c);
    return m;
  }, [allConversations]);

  const handleDropOnLane = useCallback(
    (e: React.DragEvent, targetLane: LaneId) => {
      e.preventDefault();
      const id = e.dataTransfer.getData('text/plain') || draggingId;
      setDraggingId(null);
      setDragOverLane(null);
      if (!id) return;
      const card = cardById.get(id);
      if (!card || card.lane === targetLane) return;
      handleMoveLane(card, targetLane);
    },
    [draggingId, cardById, handleMoveLane],
  );

  const openConversations = useMemo(
    () => allConversations.filter((c) => c.lane !== 'archived'),
    [allConversations],
  );
  const archivedConversations = useMemo(
    () => allConversations.filter((c) => c.lane === 'archived'),
    [allConversations],
  );
  const runningCount = board?.stats.runningCount ?? 0;
  const attentionCount = board?.stats.attentionCount ?? 0;
  const swarmCount = useMemo(
    () => openConversations.filter((c) => c.swarm !== null || c.subagentCount > 0).length,
    [openConversations],
  );
  const allClear = runningCount === 0 && attentionCount === 0;

  const filteredCards = useMemo(() => {
    const source = filter === 'archived' ? archivedConversations : openConversations;
    const base = source.filter((c) => {
      if (filter === 'running') return c.isRunning || c.lane === 'running';
      if (filter === 'attention') {
        return c.lane === 'attention' || c.attentionReasons.length > 0;
      }
      if (filter === 'swarm') return c.swarm !== null || c.subagentCount > 0;
      return true;
    });
    return [...base].sort((a, b) => {
      if (a.overlay.pinned !== b.overlay.pinned) return a.overlay.pinned ? -1 : 1;
      const pDiff = priorityRank(b.overlay.priority) - priorityRank(a.overlay.priority);
      if (pDiff !== 0) return pDiff;
      return Date.parse(b.lastModifiedAt) - Date.parse(a.lastModifiedAt);
    });
  }, [openConversations, archivedConversations, filter]);

  const groupedLanes = useMemo(() => {
    if (filter === 'archived') {
      return [{ lane: 'archived' as LaneId, items: filteredCards }];
    }
    const map: Record<LaneId, ConversationCard[]> = {
      running: [],
      attention: [],
      active: [],
      stale: [],
      archived: [],
    };
    for (const c of filteredCards) {
      map[c.lane].push(c);
    }
    // While dragging, show all 4 open lanes even if empty so user can drop anywhere!
    return OPEN_LANES.map((lane) => ({ lane, items: map[lane] })).filter(
      (g) => g.items.length > 0 || draggingId !== null,
    );
  }, [filteredCards, filter, draggingId]);

  // STRICT Auto-Hide Hover Resolution: null when resting (neither hovered nor locked)!
  const activePreviewCard = useMemo(() => {
    if (lockedId) {
      const locked = cardById.get(lockedId);
      if (locked) return locked;
    }
    if (hoveredId) {
      const hovered = cardById.get(hoveredId);
      if (hovered) return hovered;
    }
    return null;
  }, [lockedId, hoveredId, cardById]);

  const outerStageClass = isElectron
    ? 'flex h-screen w-screen items-stretch justify-stretch bg-transparent p-1.5 select-none'
    : 'flex h-screen w-screen items-center justify-center bg-[#E8E5DE] p-5 select-none dark:bg-[#0B0B0A]';

  /* ==================== PRESET S: ULTRA-MINIMAL FLOATING CAPSULE ==================== */
  if (effectiveMode === 'S') {
    const capsuleWrapStyle = isElectron
      ? { width: '100%', height: '100%' }
      : { width: WIDGET_PRESET_SIZES.S.width, height: WIDGET_PRESET_SIZES.S.height };

    return (
      <div className={outerStageClass}>
        <div
          style={capsuleWrapStyle}
          data-widget-preset="S"
          className="flex items-center justify-center p-1"
        >
          <div
            style={DRAG_STYLE}
            data-testid="widget-pill"
            className="flex h-[42px] w-full items-center justify-between gap-1.5 rounded-full border border-[#1C1917]/[0.12] bg-white/96 pr-1.5 pl-2.5 text-[#1C1917] shadow-[0_10px_28px_-6px_rgba(28,25,23,0.22),0_1px_2px_rgba(28,25,23,0.08)] backdrop-blur-xl dark:border-white/[0.12] dark:bg-[#181816]/96 dark:text-[#F2F1EE] dark:shadow-[0_14px_34px_-6px_rgba(0,0,0,0.72),inset_0_1px_0_rgba(255,255,255,0.06)]"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <BrandMark className="h-5 w-5" />
              {allClear ? (
                <span className="inline-flex items-center gap-1.5 truncate text-xs font-medium text-[#44403C] dark:text-[#D6D3CD]">
                  <Check className="h-3.5 w-3.5 text-[#16A34A] dark:text-[#22C55E]" />
                  <span>{t.widget.allClear}</span>
                </span>
              ) : (
                <div className="tabular-nums flex min-w-0 items-center gap-1.5 text-[11.5px] font-medium">
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
                    {runningCount > 0 ? (
                      <LivePulseDot />
                    ) : (
                      <span className="h-1.5 w-1.5 rounded-full bg-[#A8A29E] dark:bg-[#666560]" />
                    )}
                    <span>{t.widget.runningShort(runningCount)}</span>
                  </span>
                  <span className="text-[#D6D3D1] dark:text-[#3A3936]">·</span>
                  <span className="inline-flex items-center gap-1 whitespace-nowrap">
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
            </div>

            <div style={NO_DRAG_STYLE} className="flex shrink-0 items-center gap-0.5">
              {(['M', 'L'] as const).map((presetKey) => (
                <button
                  key={presetKey}
                  type="button"
                  data-testid={`preset-btn-${presetKey}`}
                  onClick={() => void handleSelectPreset(presetKey)}
                  title={
                    presetKey === 'M' ? t.widget.presetMTitle : t.widget.presetLTitle
                  }
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[10.5px] font-semibold text-[#57534E] transition-colors hover:bg-[#1C1917] hover:text-[#F6F5F1] dark:text-[#A1A09A] dark:hover:bg-[#F2F1EE] dark:hover:text-[#111110]"
                >
                  {presetKey}
                </button>
              ))}
              <button
                type="button"
                onClick={() => handleOpenMainBoard()}
                title={t.widget.openBoardTooltip}
                aria-label={t.widget.openBoardTooltip}
                className="flex h-6 w-6 items-center justify-center rounded-full text-[#78716C] transition-colors hover:bg-[#1C1917]/[0.07] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
              >
                <ArrowUpRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* ==================== PRESET M (390×600) & L (700×580) & FREE RESIZE ==================== */
  const isLargeSplit = effectiveMode === 'L';
  const frameStyle = isElectron
    ? { width: '100%', height: '100%' }
    : {
        width: isLargeSplit
          ? WIDGET_PRESET_SIZES.L.width
          : WIDGET_PRESET_SIZES.M.width,
        height: isLargeSplit
          ? WIDGET_PRESET_SIZES.L.height
          : WIDGET_PRESET_SIZES.M.height,
      };

  const renderInlineLaneSelector = (card: ConversationCard) => (
    <div className="relative inline-flex shrink-0 items-center">
      <span
        className={`pointer-events-none absolute left-2 h-1.5 w-1.5 rounded-full ${laneAccentDot(card.lane)}`}
      />
      <select
        aria-label={t.drawer.laneControl}
        data-testid="widget-inline-lane-select"
        value={card.lane}
        onChange={(e) => {
          const val = e.target.value;
          if (val === '__auto__') {
            handleResetManualLane(card);
          } else {
            handleMoveLane(card, val as LaneId);
          }
        }}
        className="h-6 cursor-pointer appearance-none rounded-md border border-[#1C1917]/[0.1] bg-[#FAF9F6] pr-5 pl-4.5 text-[10.5px] font-medium text-[#44403C] transition-colors hover:border-[#1C1917]/25 focus:border-[#1C1917]/40 focus:outline-none dark:border-white/[0.1] dark:bg-[#222220] dark:text-[#D6D3CD]"
      >
        {LANE_ORDER.map((laneId) => (
          <option key={laneId} value={laneId}>
            {t.lanes[laneId]}
            {laneId === card.lane && card.isManualLane ? ` · ${t.lanes.manualBadge}` : ''}
          </option>
        ))}
        {card.isManualLane && (
          <option value="__auto__">↺ {t.lanes.resetAutoLane}</option>
        )}
      </select>
      <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-[#8C867E]" />
    </div>
  );

  const renderRadarList = (dense: boolean) => (
    <div
      data-testid="widget-radar-list"
      onMouseEnter={cancelLeaveTimer}
      onMouseLeave={() => {
        if (!lockedId && !moveMenu) scheduleHoverClear();
      }}
      className={`flex-1 overflow-y-auto px-2 ${dense ? 'py-1.5' : 'py-2'}`}
    >
      {groupedLanes.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center px-4 text-center">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[#EFECE6] text-[#78716C] dark:bg-[#222220] dark:text-[#8C8B85]">
            <Check className="h-3.5 w-3.5" />
          </div>
          <p className="mt-2 text-[11.5px] text-[#78716C] dark:text-[#8C8B85]">
            {filter === 'open' ? t.widget.emptyFocus : t.widget.emptyTab}
          </p>
        </div>
      ) : (
        <div className={dense ? 'space-y-1.5' : 'space-y-2'}>
          {groupedLanes.map(({ lane, items }) => {
            const collapsed = Boolean(collapsedLanes[lane]) && draggingId === null;
            const isDropTarget = dragOverLane === lane;
            return (
              <div
                key={lane}
                data-testid={`widget-lane-group-${lane}`}
                onDragOver={(e) => handleDragOverLane(e, lane)}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                    setDragOverLane((prev) => (prev === lane ? null : prev));
                  }
                }}
                onDrop={(e) => handleDropOnLane(e, lane)}
                className={`rounded-xl transition-colors ${
                  isDropTarget
                    ? 'bg-[#EFECE6] ring-1 ring-dashed ring-[#1C1917]/35 dark:bg-[#232320] dark:ring-white/30'
                    : draggingId
                      ? 'bg-[#1C1917]/[0.02] dark:bg-white/[0.02]'
                      : ''
                }`}
              >
                {/* Tiny whisper group header */}
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedLanes((prev) => ({ ...prev, [lane]: !prev[lane] }))
                  }
                  className="flex h-[20px] w-full items-center gap-1.5 px-1.5 text-left text-[10.5px] font-semibold tracking-wide text-[#8C867E] transition-colors hover:text-[#44403C] dark:text-[#6E6D68] dark:hover:text-[#A1A09A]"
                >
                  {collapsed ? (
                    <ChevronRight className="h-2.5 w-2.5 shrink-0 opacity-70" />
                  ) : (
                    <ChevronDown className="h-2.5 w-2.5 shrink-0 opacity-70" />
                  )}
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${laneAccentDot(lane)}`}
                  />
                  <span>{t.lanes[lane]}</span>
                  <span className="tabular-nums font-medium opacity-75">
                    {items.length}
                  </span>
                </button>

                {!collapsed && (
                  <div className="mt-0.5 space-y-[1px] pb-0.5">
                    {items.length === 0 && draggingId ? (
                      <div className="px-2 py-1.5 text-center text-[10.5px] text-[#8C867E]">
                        {t.lanes.dropHere}
                      </div>
                    ) : (
                      items.map((card) => (
                        <RadarTitleRow
                          key={card.id}
                          card={card}
                          dense={dense}
                          isActive={activePreviewCard?.id === card.id}
                          isLocked={lockedId === card.id}
                          isDragging={draggingId === card.id}
                          onHover={handleHoverRow}
                          onToggleLock={handleToggleLockRow}
                          onMarkReviewed={(c) => void handleMarkReviewed(c)}
                          onOpenDetail={handleOpenMainBoard}
                          onOpenMoveMenu={handleOpenMoveMenu}
                          onDragStart={handleDragStart}
                          onDragEnd={handleDragEnd}
                          t={t}
                        />
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderLargeInspector = () => {
    // Serene minimal resting state when NOT hovering and NOT click-locked
    if (!activePreviewCard) {
      return (
        <aside
          data-testid="widget-resting-pane"
          className="flex h-full flex-col items-center justify-center border-l border-[#1C1917]/[0.07] bg-white/55 px-6 text-center dark:border-white/[0.06] dark:bg-[#181816]/80"
        >
          <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-[#1C1917]/[0.07] bg-[#FAF9F6] text-[#8C867E] dark:border-white/[0.07] dark:bg-[#1E1E1C] dark:text-[#787771]">
            <Compass className="h-4 w-4" />
          </div>
          <p className="mt-3 text-xs font-medium text-[#44403C] dark:text-[#D6D3CD]">
            {t.widget.restingTitle}
          </p>
          <p className="mt-1 max-w-[220px] text-[11px] leading-relaxed text-[#8C867E] dark:text-[#6E6D68]">
            {t.widget.restingHint}
          </p>
          <div className="tabular-nums mt-4 flex items-center gap-2.5 text-[11px] text-[#78716C] dark:text-[#8C8B85]">
            <span className="inline-flex items-center gap-1.5">
              {runningCount > 0 ? (
                <LivePulseDot />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-[#A8A29E]" />
              )}
              {t.widget.runningShort(runningCount)}
            </span>
            <span className="opacity-35">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-[#D97706] dark:bg-[#F59E0B]" />
              {t.widget.attentionShort(attentionCount)}
            </span>
          </div>
        </aside>
      );
    }

    const card = activePreviewCard;
    const topReason = primaryAttentionReason(card.attentionReasons);
    const needsReview = card.attentionReasons.length > 0 || card.lane === 'attention';
    const progressPct =
      card.stepsTotal > 0
        ? Math.min(100, Math.round((card.stepsCompleted / card.stepsTotal) * 100))
        : 0;
    const isLocked = lockedId === card.id;
    const stepsList = card.stepsPreview?.length ? card.stepsPreview : card.steps;

    return (
      <aside
        data-testid="widget-hover-inspector"
        onMouseEnter={cancelLeaveTimer}
        onMouseLeave={() => {
          if (!lockedId && !moveMenu) scheduleHoverClear();
        }}
        className="agmb-dock-enter flex h-full flex-col overflow-hidden border-l border-[#1C1917]/[0.07] bg-white/80 dark:border-white/[0.065] dark:bg-[#191917]/95"
      >
        <div className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3">
          {/* Top bar: Inline Lane Selector + Lock badge */}
          <div className="flex items-center justify-between gap-2 text-[10.5px]">
            <div className="flex min-w-0 items-center gap-1.5">
              {renderInlineLaneSelector(card)}
              {topReason && (
                <span
                  className={`truncate font-medium ${
                    topReason === 'error'
                      ? 'text-[#DC2626] dark:text-[#F87171]'
                      : 'text-[#B45309] dark:text-[#FBBF24]'
                  }`}
                >
                  {t.attentionReasons[topReason]}
                </span>
              )}
            </div>

            {isLocked ? (
              <button
                type="button"
                onClick={() => {
                  setLockedId(null);
                  setHoveredId(null);
                }}
                title={t.widget.unlockTooltip}
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#1C1917] px-1.5 py-0.5 text-[10px] font-medium text-[#F6F5F1] dark:bg-[#F2F1EE] dark:text-[#111110]"
              >
                <Lock className="h-2.5 w-2.5" />
                <span>{t.widget.lockedLabel}</span>
                <X className="h-2.5 w-2.5" />
              </button>
            ) : (
              <span className="shrink-0 text-[10px] text-[#969088] dark:text-[#666560]">
                {t.widget.hoverHint}
              </span>
            )}
          </div>

          {/* Full Title + Workspace + Tags + Priority + Time */}
          <div>
            <h3 className="text-[13.5px] leading-snug font-semibold tracking-[-0.012em] text-[#1C1917] dark:text-[#F2F1EE]">
              {card.title || t.card.untitled}
            </h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[#78716C] dark:text-[#8C8B85]">
              {card.workspace && <span className="font-medium">{card.workspace}</span>}
              <PriorityBadge priority={card.overlay.priority} compact />
              <span className="tabular-nums">
                · {formatRelativeTime(card.lastModifiedAt, t)}
              </span>
              {card.overlay.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="text-[#8C867E] dark:text-[#73726C]">
                  #{tag}
                </span>
              ))}
            </div>
          </div>

          {/* Current Focus */}
          {card.currentFocus && (
            <div className="flex items-start gap-1.5 rounded-lg border border-[#1C1917]/[0.06] bg-[#FAF9F6] px-2.5 py-2 text-[11.5px] leading-relaxed text-[#44403C] dark:border-white/[0.06] dark:bg-[#141413] dark:text-[#D6D3CD]">
              <Compass className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#8C867E]" />
              <span className="line-clamp-2">{card.currentFocus}</span>
            </div>
          )}

          {/* Latest Agent Output / Question */}
          {(card.latestMessagePreview || card.preview) && (
            <div>
              <div className="mb-1 text-[10px] font-semibold tracking-wider text-[#969088] uppercase dark:text-[#666560]">
                {t.widget.latestOutput}
              </div>
              <p className="line-clamp-3 rounded-lg border border-[#1C1917]/[0.06] bg-[#F6F5F1]/80 px-2.5 py-2 text-[11.5px] leading-relaxed text-[#44403C] dark:border-white/[0.055] dark:bg-[#141413] dark:text-[#C7C5BE]">
                {card.latestMessagePreview || card.preview}
              </p>
            </div>
          )}

          {/* Visual Step Checklist */}
          {card.stepsTotal > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between text-[10px] font-semibold tracking-wider text-[#969088] uppercase dark:text-[#666560]">
                <span>{t.drawer.overview.checklist}</span>
                <span className="tabular-nums">
                  {card.stepsCompleted}/{card.stepsTotal}
                </span>
              </div>
              <div className="mb-1.5 h-[2px] w-full overflow-hidden rounded-full bg-[#1C1917]/[0.08] dark:bg-white/[0.08]">
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
              {stepsList.length > 0 && (
                <ul className="space-y-1">
                  {stepsList.slice(0, 5).map((step, idx) => (
                    <li
                      key={`${idx}-${step.title}`}
                      className={`flex items-start gap-1.5 text-[11px] leading-snug ${
                        step.status === 'done'
                          ? 'text-[#8C867E] dark:text-[#73726C]'
                          : step.status === 'in_progress'
                            ? 'font-medium text-[#1C1917] dark:text-[#F2F1EE]'
                            : 'text-[#57534E] dark:text-[#A1A09A]'
                      }`}
                    >
                      <MiniStepIcon status={step.status} />
                      <span className="line-clamp-1">{step.title}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Swarm Hover Preview */}
          {card.swarmPreview && (
            <div className="rounded-lg border border-[#1C1917]/[0.06] bg-[#FAF9F6] p-2.5 dark:border-white/[0.06] dark:bg-[#141413]">
              <div className="flex items-center justify-between gap-2 text-[10.5px] font-semibold text-[#44403C] dark:text-[#D6D3CD]">
                <span className="inline-flex items-center gap-1 truncate">
                  <Network className="h-3 w-3 shrink-0 text-[#8C867E]" />
                  <span className="truncate">
                    {card.swarmPreview.goalTitle || card.swarm?.title || 'Swarm'}
                  </span>
                </span>
                {card.swarmPreview.workingAgents.length > 0 && (
                  <span className="tabular-nums shrink-0 text-[10px] text-[#15803D] dark:text-[#4ADE80]">
                    {card.swarmPreview.workingAgents.length} {t.widget.workingAgentsLabel}
                  </span>
                )}
              </div>
              {card.swarmPreview.workingAgents.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5 text-[10.5px] text-[#78716C] dark:text-[#8C8B85]">
                  {card.swarmPreview.workingAgents.map((a) => (
                    <span key={a} className="inline-flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-[#16A34A] dark:bg-[#22C55E]" />
                      @{a}
                    </span>
                  ))}
                </div>
              )}
              {card.swarmPreview.latestPost && (
                <p className="mt-1.5 line-clamp-2 flex items-start gap-1 text-[10.5px] text-[#57534E] dark:text-[#9F9E98]">
                  <MessageSquare className="mt-0.5 h-3 w-3 shrink-0 opacity-60" />
                  <span>
                    <strong className="font-semibold">
                      @{card.swarmPreview.latestPost.agent}:
                    </strong>{' '}
                    {card.swarmPreview.latestPost.text}
                  </span>
                </p>
              )}
            </div>
          )}

          {/* Feedback Artifacts */}
          {card.feedbackArtifacts && card.feedbackArtifacts.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[10px] font-semibold text-[#B45309] dark:text-[#FBBF24]">
                {t.widget.feedbackArtifacts}:
              </span>
              {card.feedbackArtifacts.map((file) => (
                <span
                  key={file}
                  className="inline-flex items-center gap-1 rounded-md border border-[#D97706]/25 bg-[#FFFBEB] px-1.5 py-0.5 text-[10.5px] font-medium text-[#92400E] dark:border-[#F59E0B]/25 dark:bg-[#261E12] dark:text-[#FCD34D]"
                >
                  <FileCheck2 className="h-2.5 w-2.5" />
                  {file}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Pinned Bottom Quick Push-Forward Composer + Quick Actions */}
        <div className="shrink-0 space-y-2 border-t border-[#1C1917]/[0.07] bg-[#FAF9F6]/90 p-3 dark:border-white/[0.06] dark:bg-[#151513]">
          <PushForwardComposer
            conversationId={card.id}
            compact
            onDispatched={handleDispatchSuccess}
            onError={(msg) => showToast({ label: msg, tone: 'error' })}
            t={t}
          />
          <div className="flex items-center justify-between gap-2 pt-0.5">
            {needsReview ? (
              <button
                type="button"
                onClick={() => void handleMarkReviewed(card)}
                className="inline-flex items-center gap-1 rounded-md border border-[#1C1917]/[0.1] bg-white px-2 py-1 text-[11px] font-medium text-[#15803D] transition-colors hover:bg-[#16A34A]/10 dark:border-white/[0.1] dark:bg-[#222220] dark:text-[#4ADE80]"
              >
                <CheckCheck className="h-3 w-3" />
                <span>{t.card.markReviewed}</span>
              </button>
            ) : (
              <span className="text-[10.5px] text-[#969088] dark:text-[#666560]">
                {t.card.reviewed}
              </span>
            )}
            <button
              type="button"
              onClick={() => handleOpenMainBoard(card.id)}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-[#1C1917] transition-opacity hover:opacity-75 dark:text-[#F2F1EE]"
            >
              <span>{t.swarmView.openDetail}</span>
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>
    );
  };

  // Auto-hide Bottom Hover Peek Dock in M mode (ONLY rendered when hovered OR click-locked!)
  const renderMediumPeekDock = () => {
    if (!activePreviewCard) return null;
    const card = activePreviewCard;
    const topReason = primaryAttentionReason(card.attentionReasons);
    const needsReview = card.attentionReasons.length > 0 || card.lane === 'attention';
    const progressPct =
      card.stepsTotal > 0
        ? Math.min(100, Math.round((card.stepsCompleted / card.stepsTotal) * 100))
        : 0;
    const isLocked = lockedId === card.id;
    const showComposer = isLocked || mediumComposerOpen;
    const excerpt = card.currentFocus || card.latestMessagePreview || card.preview;

    return (
      <div
        data-testid="widget-hover-dock"
        onMouseEnter={cancelLeaveTimer}
        onMouseLeave={() => {
          if (!lockedId && !moveMenu) scheduleHoverClear();
        }}
        className="agmb-dock-enter shrink-0 border-t border-[#1C1917]/[0.08] bg-white/96 px-3 py-2.5 shadow-[0_-8px_24px_-12px_rgba(28,25,23,0.14)] dark:border-white/[0.08] dark:bg-[#1A1A18] dark:shadow-[0_-10px_28px_-10px_rgba(0,0,0,0.65)]"
      >
        {/* Row 1: Title + Quick Actions + Dismiss */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1.5">
            {card.isRunning ? (
              <LivePulseDot />
            ) : (
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${laneAccentDot(card.lane)}`} />
            )}
            <span className="truncate text-[12px] font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
              {card.title || t.card.untitled}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              onClick={() => {
                setLockedId(card.id);
                setMediumComposerOpen((v) => !v);
              }}
              className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium transition-colors ${
                showComposer
                  ? 'bg-[#1C1917] text-[#F6F5F1] dark:bg-[#F2F1EE] dark:text-[#111110]'
                  : 'border border-[#1C1917]/[0.1] bg-[#FAF9F6] text-[#44403C] hover:text-[#1C1917] dark:border-white/[0.09] dark:bg-[#222220] dark:text-[#D6D3CD]'
              }`}
            >
              <CornerDownLeft className="h-2.5 w-2.5" />
              <span>{t.widget.pushShort}</span>
            </button>
            {needsReview && (
              <button
                type="button"
                onClick={() => void handleMarkReviewed(card)}
                className="inline-flex items-center gap-0.5 rounded-md border border-[#1C1917]/[0.1] bg-[#FAF9F6] px-1.5 py-0.5 text-[10.5px] font-medium text-[#15803D] hover:bg-[#16A34A]/10 dark:border-white/[0.09] dark:bg-[#222220] dark:text-[#4ADE80]"
              >
                <Check className="h-2.5 w-2.5" />
                <span>{t.widget.markReadShort}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => handleOpenMainBoard(card.id)}
              title={t.swarmView.openDetail}
              className="inline-flex items-center gap-0.5 rounded-md px-1 py-0.5 text-[10.5px] font-medium text-[#57534E] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:text-[#F2F1EE]"
            >
              <span>{t.widget.detailShort}</span>
              <ArrowUpRight className="h-3 w-3" />
            </button>
            {isLocked && (
              <button
                type="button"
                data-testid="widget-dock-dismiss"
                onClick={() => {
                  cancelLeaveTimer();
                  setLockedId(null);
                  setHoveredId(null);
                  setMediumComposerOpen(false);
                }}
                title={t.widget.closePreview}
                aria-label={t.widget.closePreview}
                className="rounded-md p-0.5 text-[#8C867E] transition-colors hover:bg-[#1C1917]/[0.07] hover:text-[#1C1917] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Row 2: Inline Lane Switcher + Concise Excerpt */}
        {(topReason || excerpt) && (
          <p className="mt-1 line-clamp-2 text-[11px] leading-[1.45] text-[#57534E] dark:text-[#9F9E98]">
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
            {topReason && excerpt && <span className="mx-1 opacity-45">·</span>}
            {excerpt && <span>{excerpt}</span>}
          </p>
        )}

        {/* Row 3: Inline Lane Switcher + Workspace + Progress + Swarm */}
        <div className="mt-2 flex items-center gap-2 text-[10.5px] text-[#8C867E] dark:text-[#73726C]">
          {renderInlineLaneSelector(card)}

          {card.workspace && (
            <span className="max-w-[96px] truncate font-medium text-[#78716C] dark:text-[#8C8B85]">
              {card.workspace}
            </span>
          )}

          {card.swarmPreview && (
            <span className="tabular-nums inline-flex items-center gap-0.5 text-[#57534E] dark:text-[#A1A09A]">
              <Network className="h-2.5 w-2.5" />
              {card.swarm?.workingCount ?? card.swarmPreview.workingAgents.length}/
              {card.swarm?.totalMembers ?? card.swarmPreview.workingAgents.length}
            </span>
          )}

          {card.stepsTotal > 0 ? (
            <div className="ml-auto flex items-center gap-1.5">
              <div className="h-[2px] w-10 overflow-hidden rounded-full bg-[#1C1917]/[0.08] dark:bg-white/[0.08]">
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
              <span className="tabular-nums text-[10px]">
                {card.stepsCompleted}/{card.stepsTotal}
              </span>
            </div>
          ) : (
            <span className="tabular-nums ml-auto text-[10px]">
              {formatRelativeTime(card.lastModifiedAt, t)}
            </span>
          )}
        </div>

        {/* Expandable Quick Push-Forward Composer */}
        {showComposer && (
          <div className="mt-2 border-t border-[#1C1917]/[0.06] pt-2 dark:border-white/[0.06]">
            <PushForwardComposer
              conversationId={card.id}
              compact
              onDispatched={handleDispatchSuccess}
              onError={(msg) => showToast({ label: msg, tone: 'error' })}
              t={t}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div className={outerStageClass}>
      <div
        style={frameStyle}
        data-testid="widget-panel"
        data-widget-preset={effectiveMode}
        className="flex flex-col overflow-hidden rounded-2xl border border-[#1C1917]/[0.11] bg-[#FAF9F6] text-[#1C1917] shadow-[0_22px_54px_-12px_rgba(28,25,23,0.28),0_2px_6px_rgba(28,25,23,0.06)] dark:border-white/[0.11] dark:bg-[#151513] dark:text-[#F2F1EE] dark:shadow-[0_26px_64px_-12px_rgba(0,0,0,0.82),inset_0_1px_0_rgba(255,255,255,0.06)]"
      >
        {/* Draggable Top Header with Explicit S / M / L Size Switcher */}
        <header
          style={DRAG_STYLE}
          className="flex h-[38px] shrink-0 items-center justify-between gap-2 border-b border-[#1C1917]/[0.07] bg-white/85 px-3 backdrop-blur-md dark:border-white/[0.06] dark:bg-[#1A1A18]/95"
        >
          <div className="flex min-w-0 items-center gap-2">
            <BrandMark className="h-4.5 w-4.5" />
            <span className="truncate text-xs font-semibold tracking-[-0.012em]">
              Mission Board
            </span>
            {sseStatus === 'connected' ? (
              <LivePulseDot />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-[#D97706]" />
            )}
          </div>

          <div style={NO_DRAG_STYLE} className="flex shrink-0 items-center gap-1">
            <div
              role="group"
              aria-label="Widget size preset"
              className="mr-0.5 inline-flex items-center rounded-md border border-[#1C1917]/[0.09] bg-[#EFECE6]/90 p-0.5 dark:border-white/[0.08] dark:bg-[#121210]"
            >
              {(['S', 'M', 'L'] as const).map((presetKey) => {
                const active = effectiveMode === presetKey && layout.preset !== 'custom';
                return (
                  <button
                    key={presetKey}
                    type="button"
                    data-testid={`preset-btn-${presetKey}`}
                    onClick={() => void handleSelectPreset(presetKey)}
                    title={
                      presetKey === 'S'
                        ? t.widget.presetSTitle
                        : presetKey === 'M'
                          ? t.widget.presetMTitle
                          : t.widget.presetLTitle
                    }
                    className={`flex h-5 w-5 items-center justify-center rounded text-[10.5px] font-semibold transition-colors ${
                      active
                        ? 'bg-[#1C1917] text-[#F6F5F1] dark:bg-[#F2F1EE] dark:text-[#111110]'
                        : 'text-[#78716C] hover:text-[#1C1917] dark:text-[#8C8B85] dark:hover:text-[#F2F1EE]'
                    }`}
                  >
                    {presetKey}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={() => void handleToggleAlwaysOnTop()}
              title={t.widget.pinTopTooltip}
              aria-label={t.widget.pinTopTooltip}
              className={`flex h-6 w-6 items-center justify-center rounded-md transition-colors ${
                alwaysOnTop
                  ? 'bg-[#1C1917] text-[#F6F5F1] dark:bg-[#F2F1EE] dark:text-[#111110]'
                  : 'text-[#78716C] hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]'
              }`}
            >
              <Pin className={`h-3 w-3 ${alwaysOnTop ? 'fill-current' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
              title={theme === 'dark' ? t.theme.switchToLight : t.theme.switchToDark}
              aria-label={theme === 'dark' ? t.theme.switchToLight : t.theme.switchToDark}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#78716C] transition-colors hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
            >
              {theme === 'dark' ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </button>

            <button
              type="button"
              onClick={() => handleOpenMainBoard()}
              title={t.widget.openBoardTooltip}
              aria-label={t.widget.openBoardTooltip}
              className="flex h-6 w-6 items-center justify-center rounded-md text-[#78716C] transition-colors hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </header>

        {/* Compact Filter Bar (incl. Archived toggle to retrieve archived items!) */}
        <div className="flex h-[32px] shrink-0 items-center justify-between gap-1.5 border-b border-[#1C1917]/[0.06] px-2.5 dark:border-white/[0.05]">
          <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
            {(
              [
                { id: 'open' as const, label: t.widget.tabOpen, count: openConversations.length },
                { id: 'running' as const, label: t.widget.tabRunning, count: runningCount },
                { id: 'attention' as const, label: t.widget.tabAttention, count: attentionCount },
                { id: 'swarm' as const, label: t.widget.tabSwarm, count: swarmCount },
                { id: 'archived' as const, label: t.widget.tabArchived, count: archivedConversations.length },
              ] as const
            ).map(({ id, label, count }) => {
              const active = filter === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setFilter(id)}
                  className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-[#1C1917] text-[#F6F5F1] dark:bg-[#F2F1EE] dark:text-[#111110]'
                      : 'text-[#57534E] hover:bg-[#1C1917]/[0.05] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:bg-white/[0.06] dark:hover:text-[#F2F1EE]'
                  }`}
                >
                  <span>{label}</span>
                  <span className="tabular-nums text-[10px] opacity-65">
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Adaptive Content Area */}
        {isLargeSplit ? (
          <div className="grid min-h-0 flex-1 grid-cols-[54%_46%] overflow-hidden">
            <div className="flex min-h-0 flex-col overflow-hidden">
              {renderRadarList(false)}
            </div>
            {renderLargeInspector()}
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {renderRadarList(true)}
            {renderMediumPeekDock()}
          </div>
        )}

        {/* Drag-to-Archive Subtle Drop Bar (ONLY appears while dragging a row!) */}
        {draggingId && (
          <div
            data-testid="widget-drop-archive"
            onDragOver={(e) => handleDragOverLane(e, 'archived')}
            onDragLeave={() => setDragOverLane((prev) => (prev === 'archived' ? null : prev))}
            onDrop={(e) => handleDropOnLane(e, 'archived')}
            className={`mx-2.5 mb-1.5 flex items-center justify-center gap-1.5 rounded-lg border border-dashed py-1.5 text-[11px] font-medium transition-colors ${
              dragOverLane === 'archived'
                ? 'border-[#1C1917]/50 bg-[#EFECE6] text-[#1C1917] dark:border-white/45 dark:bg-[#262623] dark:text-[#F2F1EE]'
                : 'border-[#1C1917]/20 bg-white/60 text-[#78716C] dark:border-white/15 dark:bg-[#1C1C1A] dark:text-[#9F9E98]'
            }`}
          >
            <Archive className="h-3.5 w-3.5" />
            <span>{t.widget.dropToArchive}</span>
          </div>
        )}

        {/* Inline Mini Toast / Undo Banner */}
        {toast && (
          <div
            role="status"
            data-testid="widget-toast"
            className="mx-2.5 mb-1.5 flex items-center justify-between gap-2 rounded-lg border border-[#1C1917]/[0.1] bg-[#1C1917] px-2.5 py-1.5 text-[11px] text-[#F6F5F1] dark:border-white/[0.12] dark:bg-[#262623] dark:text-[#F2F1EE]"
          >
            <span className="truncate">{toast.label}</span>
            {toast.onUndo && (
              <button
                type="button"
                onClick={toast.onUndo}
                className="inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-semibold text-amber-300 transition-colors hover:bg-white/10"
              >
                <RotateCcw className="h-3 w-3" />
                <span>{t.toasts.undo}</span>
              </button>
            )}
          </div>
        )}

        {/* Minimal Bottom Footer Bar */}
        <footer className="flex h-[30px] shrink-0 items-center justify-between border-t border-[#1C1917]/[0.07] bg-white/85 px-3 text-[11px] dark:border-white/[0.06] dark:bg-[#1A1A18]/95">
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
            <span className="tabular-nums text-[10.5px] text-[#969088] dark:text-[#666560]">
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

      {/* Clamped Floating Move / Context Menu */}
      <TaskMoveMenu
        menu={moveMenu}
        onClose={() => setMoveMenu(null)}
        onMoveLane={handleMoveLane}
        onResetManualLane={handleResetManualLane}
        onTogglePin={handleTogglePin}
        onSetPriority={handleSetPriority}
        onMarkReviewed={(c) => void handleMarkReviewed(c)}
        t={t}
      />
    </div>
  );
}
