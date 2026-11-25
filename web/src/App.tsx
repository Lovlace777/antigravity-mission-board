import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BoardNotification,
  BoardResponse,
  BoardSettings,
  ConversationCard,
  HealthResponse,
  LaneId,
  OverlayPatch,
  Priority,
  SseEvent,
} from '@shared/types';
import { AlertCircle, RefreshCw } from 'lucide-react';
import {
  fetchBoard,
  fetchHealth,
  markConversationReviewed,
  patchConversationOverlay,
  patchSettings,
  reviewConversationsBatch,
  searchConversations,
  subscribeBoardEvents,
  type SseStatus,
} from './api';
import { CommandPalette } from './components/CommandPalette';
import { DetailDrawer, type DrawerTab } from './components/DetailDrawer';
import { FloatingWidget } from './components/FloatingWidget';
import { KanbanBoard } from './components/KanbanBoard';
import { MatrixView } from './components/MatrixView';
import { RadarStrip, type RadarFilter } from './components/RadarStrip';
import { ShortcutsModal } from './components/ShortcutsModal';
import { SwarmClusterView } from './components/SwarmClusterView';
import { ToastHost, type ToastItem } from './components/ToastHost';
import {
  TopBar,
  type CardDensity,
  type KanbanSortMode,
  type ThemeMode,
  type ViewMode,
} from './components/TopBar';
import {
  getDesktopBridge,
  isWidgetModeUrl,
  parseHashConversationId,
  type DesktopState,
} from './desktopBridge';
import {
  dictionaries,
  loadSavedLocale,
  saveLocale,
  type Locale,
} from './i18n';
import { playChime } from './utils';

function loadInitialTheme(): ThemeMode {
  try {
    const saved = localStorage.getItem('agmb_theme');
    if (saved === 'light' || saved === 'dark') return saved;
    if (
      window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
    ) {
      return 'dark';
    }
  } catch {
    // ignore
  }
  return 'light';
}

function loadBoolPref(key: string, fallback: boolean): boolean {
  try {
    const val = localStorage.getItem(key);
    if (val === 'true') return true;
    if (val === 'false') return false;
  } catch {
    // ignore
  }
  return fallback;
}

function loadDensityPref(): CardDensity {
  try {
    const val = localStorage.getItem('agmb_density');
    if (val === 'compact' || val === 'comfortable') return val;
  } catch {
    // ignore
  }
  return 'comfortable';
}

function loadKanbanSortPref(): KanbanSortMode {
  try {
    const val = localStorage.getItem('agmb_kanban_sort');
    if (val === 'smart' || val === 'recent' || val === 'priority' || val === 'steps') {
      return val;
    }
  } catch {
    // ignore
  }
  return 'smart';
}

function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
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
  return {
    ...card,
    lane: nextLane,
    isManualLane: nextManualLane !== null,
    overlay: nextOverlay,
  };
}

function applyOptimisticReview(
  card: ConversationCard,
  reviewedAt: string | null,
): ConversationCard {
  if (reviewedAt === null) {
    return {
      ...card,
      overlay: { ...card.overlay, reviewedAt: null },
    };
  }
  const remainingReasons = card.attentionReasons.filter(
    (r) => r !== 'unread_update' && r !== 'marked_as_unread',
  );
  const nextAutoLane: LaneId =
    !card.isRunning &&
    !card.isArchived &&
    remainingReasons.length === 0 &&
    card.autoLane === 'attention'
      ? 'active'
      : card.autoLane;
  return {
    ...card,
    markedAsUnread: false,
    attentionReasons: remainingReasons,
    autoLane: nextAutoLane,
    lane: card.overlay.manualLane ?? nextAutoLane,
    overlay: { ...card.overlay, reviewedAt },
  };
}

function recomputeBoardSummary(board: BoardResponse): BoardResponse {
  const byLane: Record<LaneId, number> = {
    running: 0,
    attention: 0,
    active: 0,
    stale: 0,
    archived: 0,
  };
  const tagSet = new Set<string>();
  for (const c of board.conversations) {
    byLane[c.lane] += 1;
    for (const tag of c.overlay.tags) tagSet.add(tag);
  }
  return {
    ...board,
    tags: Array.from(tagSet).sort((a, b) => a.localeCompare(b)),
    stats: {
      ...board.stats,
      byLane,
      attentionCount: byLane.attention,
      staleCount: byLane.stale,
      archivedCount: byLane.archived,
    },
  };
}

function nextPriority(current: Priority): Priority {
  if (current === null) return 'p0';
  if (current === 'p0') return 'p1';
  if (current === 'p1') return 'p2';
  return null;
}

function shortenTitle(title: string, fallback: string): string {
  const clean = (title || fallback).trim();
  return clean.length > 26 ? `${clean.slice(0, 26)}…` : clean;
}

function MissionBoardApp() {
  const desktopBridge = getDesktopBridge();

  // Preferences
  const [locale, setLocale] = useState<Locale>(loadSavedLocale);
  const [theme, setTheme] = useState<ThemeMode>(loadInitialTheme);
  const [density, setDensity] = useState<CardDensity>(loadDensityPref);
  const [kanbanSort, setKanbanSort] = useState<KanbanSortMode>(loadKanbanSortPref);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() =>
    loadBoolPref('agmb_notifications', false),
  );
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
    loadBoolPref('agmb_sound', true),
  );
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(getNotificationPermission);
  const [desktopState, setDesktopState] = useState<DesktopState | null>(null);

  const t = dictionaries[locale];

  // Board Data & Connection
  const [board, setBoard] = useState<BoardResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sseStatus, setSseStatus] = useState<SseStatus>('connecting');
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Navigation & Filters
  const [viewMode, setViewMode] = useState<ViewMode>('kanban');
  const [searchQuery, setSearchQuery] = useState('');
  const [serverMatchIds, setServerMatchIds] = useState<Set<string> | null>(null);
  const [isSearchingServer, setIsSearchingServer] = useState(false);
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [radarFilter, setRadarFilter] = useState<RadarFilter>(null);

  // Overlays
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    parseHashConversationId(),
  );
  const [drawerInitialTab, setDrawerInitialTab] = useState<DrawerTab>('overview');
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [, setRelativeClockTick] = useState(0);

  const seenNotificationsRef = useRef<Set<string>>(new Set());
  const notificationsEnabledRef = useRef(notificationsEnabled);
  const soundEnabledRef = useRef(soundEnabled);
  const localeRef = useRef(locale);

  notificationsEnabledRef.current = notificationsEnabled;
  soundEnabledRef.current = soundEnabled;
  localeRef.current = locale;

  // Apply dark mode class + sync Electron nativeTheme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    try {
      localStorage.setItem('agmb_theme', theme);
    } catch {
      // ignore
    }
    desktopBridge?.setTheme?.(theme);
  }, [theme, desktopBridge]);

  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    saveLocale(locale);
  }, [locale]);

  useEffect(() => {
    try {
      localStorage.setItem('agmb_density', density);
    } catch {
      // ignore
    }
  }, [density]);

  useEffect(() => {
    try {
      localStorage.setItem('agmb_kanban_sort', kanbanSort);
    } catch {
      // ignore
    }
  }, [kanbanSort]);

  // Cross-window storage sync (e.g. toggling theme in Floating Widget)
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

  // Desktop IPC Bridge: state, deep-link open conversation, and URL #conv=<id>
  useEffect(() => {
    const onHashChange = () => {
      const id = parseHashConversationId();
      if (id) {
        setDrawerInitialTab('overview');
        setSelectedId(id);
      }
    };
    window.addEventListener('hashchange', onHashChange);

    if (!desktopBridge) {
      return () => window.removeEventListener('hashchange', onHashChange);
    }

    desktopBridge
      .getDesktopState()
      .then((st) => setDesktopState(st))
      .catch(() => {});

    const unsubState = desktopBridge.onDesktopStateChange((st) =>
      setDesktopState(st),
    );
    const unsubOpen = desktopBridge.onOpenConversation((id) => {
      if (id) {
        setDrawerInitialTab('overview');
        setSelectedId(id);
      }
    });

    return () => {
      window.removeEventListener('hashchange', onHashChange);
      unsubState();
      unsubOpen();
    };
  }, [desktopBridge]);

  // Sync live running & attention counts to Electron System Tray
  useEffect(() => {
    if (!board || !desktopBridge) return;
    desktopBridge.updateTraySummary({
      running: board.stats.runningCount,
      attention: board.stats.attentionCount,
    });
  }, [board, desktopBridge]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden) setRelativeClockTick((n) => n + 1);
    }, 30_000);
    return () => clearInterval(timer);
  }, []);

  const pushToast = useCallback((toast: Omit<ToastItem, 'id'>, durationMs?: number) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
    const ttl = durationMs ?? (toast.action ? 7200 : 4200);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, ttl);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleOpenConversation = useCallback(
    (id: string, tab: DrawerTab = 'overview') => {
      setDrawerInitialTab(tab);
      setSelectedId(id);
    },
    [],
  );

  const loadBoardData = useCallback(
    async (manual = false) => {
      if (manual) setIsRefreshing(true);
      try {
        const [boardRes, healthRes] = await Promise.all([
          fetchBoard(),
          fetchHealth().catch(() => null),
        ]);
        setBoard(boardRes);
        if (healthRes) setHealth(healthRes);
        setLastSyncedAt(new Date());
        setLoadError(null);
        if (manual) {
          pushToast(
            { title: dictionaries[localeRef.current].toasts.refreshed, tone: 'info' },
            2200,
          );
        }
      } catch (err: unknown) {
        setLoadError(err instanceof Error ? err.message : 'Network error');
      } finally {
        setLoading(false);
        if (manual) setIsRefreshing(false);
      }
    },
    [pushToast],
  );

  useEffect(() => {
    void loadBoardData(false);
  }, [loadBoardData]);

  const handleSseNotification = useCallback(
    (notif: BoardNotification) => {
      if (seenNotificationsRef.current.has(notif.id)) return;
      seenNotificationsRef.current.add(notif.id);
      if (seenNotificationsRef.current.size > 100) {
        seenNotificationsRef.current.clear();
      }

      const dict = dictionaries[localeRef.current];
      const kindLabel = dict.notificationKinds[notif.kind] ?? notif.kind;
      const tone: ToastItem['tone'] =
        notif.kind === 'error'
          ? 'error'
          : notif.kind === 'run_finished'
            ? 'success'
            : 'warning';

      pushToast(
        {
          title: `${kindLabel} · ${notif.title}`,
          message: notif.message || notif.workspace,
          tone,
          conversationId: notif.conversationId,
        },
        6000,
      );

      if (soundEnabledRef.current) {
        playChime(
          notif.kind === 'error'
            ? 'error'
            : notif.kind === 'run_finished'
              ? 'info'
              : 'attention',
        );
      }

      if (
        notificationsEnabledRef.current &&
        typeof window !== 'undefined' &&
        'Notification' in window &&
        Notification.permission === 'granted'
      ) {
        try {
          const browserNotif = new Notification(`${kindLabel}: ${notif.title}`, {
            body: notif.message || notif.workspace,
            tag: notif.conversationId,
          });
          browserNotif.onclick = () => {
            window.focus();
            handleOpenConversation(notif.conversationId, 'overview');
            browserNotif.close();
          };
        } catch {
          // ignore
        }
      }
    },
    [pushToast, handleOpenConversation],
  );

  useEffect(() => {
    const unsubscribe = subscribeBoardEvents({
      onStatusChange: (status) => {
        setSseStatus(status);
      },
      onEvent: (event: SseEvent) => {
        if (event.type === 'board_update') {
          setBoard(event.board);
          setLastSyncedAt(new Date());
          setLoading(false);
          setLoadError(null);
        } else if (event.type === 'connected') {
          setLastSyncedAt(new Date());
        } else if (event.type === 'notification') {
          handleSseNotification(event.notification);
        }
      },
    });
    return unsubscribe;
  }, [handleSseNotification]);

  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setServerMatchIds(null);
      setIsSearchingServer(false);
      return;
    }

    const controller = new AbortController();
    setIsSearchingServer(true);
    const timer = setTimeout(() => {
      searchConversations(q, controller.signal)
        .then((res) => {
          setServerMatchIds(new Set(res.results.map((r) => r.conversationId)));
        })
        .catch(() => {})
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsSearchingServer(false);
          }
        });
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setShortcutsModalOpen(false);
        setCommandPaletteOpen((open) => !open);
        return;
      }

      if (commandPaletteOpen || shortcutsModalOpen) return;

      const target = e.target as HTMLElement | null;
      const isEditing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (isEditing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === '/') {
        e.preventDefault();
        setCommandPaletteOpen(true);
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsModalOpen(true);
      } else if (e.key === '1' && !selectedId) {
        setViewMode('kanban');
      } else if (e.key === '2' && !selectedId) {
        setViewMode('matrix');
      } else if (e.key === '3' && !selectedId) {
        setViewMode('swarm');
      } else if (e.key.toLowerCase() === 'r' && !selectedId) {
        e.preventDefault();
        void loadBoardData(true);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandPaletteOpen, shortcutsModalOpen, selectedId, loadBoardData]);

  const handleToggleNotifications = useCallback(async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setNotificationPermission('unsupported');
      return;
    }
    if (notificationsEnabled) {
      setNotificationsEnabled(false);
      try {
        localStorage.setItem('agmb_notifications', 'false');
      } catch {
        // ignore
      }
      return;
    }
    let perm = Notification.permission;
    if (perm === 'default') {
      perm = await Notification.requestPermission();
      setNotificationPermission(perm);
    }
    if (perm === 'granted') {
      setNotificationsEnabled(true);
      try {
        localStorage.setItem('agmb_notifications', 'true');
      } catch {
        // ignore
      }
    }
  }, [notificationsEnabled]);

  const handleToggleSound = useCallback(() => {
    setSoundEnabled((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('agmb_sound', String(next));
      } catch {
        // ignore
      }
      if (next) playChime('info');
      return next;
    });
  }, []);

  const handlePatchOverlay = useCallback(
    async (id: string, patch: OverlayPatch) => {
      let snapshot: BoardResponse | null = null;
      setBoard((prev) => {
        if (!prev) return prev;
        snapshot = prev;
        const nextConversations = prev.conversations.map((c) =>
          c.id === id ? applyOptimisticOverlay(c, patch) : c,
        );
        return recomputeBoardSummary({ ...prev, conversations: nextConversations });
      });

      try {
        const res = await patchConversationOverlay(id, patch);
        if (res.card) {
          setBoard((prev) => {
            if (!prev) return prev;
            const nextConversations = prev.conversations.map((c) =>
              c.id === id ? res.card! : c,
            );
            return recomputeBoardSummary({
              ...prev,
              conversations: nextConversations,
            });
          });
        }
      } catch {
        if (snapshot) setBoard(snapshot);
        pushToast({ title: dictionaries[localeRef.current].errors.updateFailed, tone: 'error' });
      }
    },
    [pushToast],
  );

  const handleMoveLane = useCallback(
    (card: ConversationCard, targetLane: LaneId) => {
      const prevManualLane = card.overlay.manualLane;
      const nextManualLane = targetLane === card.autoLane ? null : targetLane;
      const dict = dictionaries[localeRef.current];
      const short = shortenTitle(card.title, dict.card.untitled);

      void handlePatchOverlay(card.id, { manualLane: nextManualLane }).then(() => {
        pushToast({
          title: dict.toasts.movedToLane(short, dict.lanes[targetLane]),
          tone: 'info',
          action: {
            label: dict.toasts.undo,
            onClick: () => {
              void handlePatchOverlay(card.id, { manualLane: prevManualLane }).then(
                () => pushToast({ title: dict.toasts.undone, tone: 'info' }, 2200),
              );
            },
          },
        });
      });
    },
    [handlePatchOverlay, pushToast],
  );

  const handleResetManualLane = useCallback(
    (card: ConversationCard) => {
      const prevManualLane = card.overlay.manualLane;
      const dict = dictionaries[localeRef.current];
      const short = shortenTitle(card.title, dict.card.untitled);

      void handlePatchOverlay(card.id, { manualLane: null }).then(() => {
        pushToast({
          title: dict.toasts.resetAutoLane(short),
          tone: 'info',
          action:
            prevManualLane !== null
              ? {
                  label: dict.toasts.undo,
                  onClick: () => {
                    void handlePatchOverlay(card.id, {
                      manualLane: prevManualLane,
                    }).then(() =>
                      pushToast({ title: dict.toasts.undone, tone: 'info' }, 2200),
                    );
                  },
                }
              : undefined,
        });
      });
    },
    [handlePatchOverlay, pushToast],
  );

  const handleTogglePin = useCallback(
    (card: ConversationCard) => {
      const nextPinned = !card.overlay.pinned;
      const dict = dictionaries[localeRef.current];
      const short = shortenTitle(card.title, dict.card.untitled);
      void handlePatchOverlay(card.id, { pinned: nextPinned }).then(() => {
        pushToast(
          {
            title: nextPinned
              ? dict.toasts.pinned(short)
              : dict.toasts.unpinned(short),
            tone: 'info',
          },
          2600,
        );
      });
    },
    [handlePatchOverlay, pushToast],
  );

  const handleCyclePriority = useCallback(
    (card: ConversationCard) => {
      const nextP = nextPriority(card.overlay.priority);
      const dict = dictionaries[localeRef.current];
      const short = shortenTitle(card.title, dict.card.untitled);
      void handlePatchOverlay(card.id, { priority: nextP }).then(() => {
        pushToast(
          {
            title: nextP
              ? dict.toasts.prioritySet(short, nextP.toUpperCase())
              : dict.toasts.priorityCleared(short),
            tone: 'info',
          },
          2600,
        );
      });
    },
    [handlePatchOverlay, pushToast],
  );

  const handleMarkReviewed = useCallback(
    async (card: ConversationCard) => {
      const prevReviewedAt = card.overlay.reviewedAt;
      const nowIso = new Date().toISOString();
      const dict = dictionaries[localeRef.current];
      const short = shortenTitle(card.title, dict.card.untitled);

      let snapshot: BoardResponse | null = null;
      setBoard((prev) => {
        if (!prev) return prev;
        snapshot = prev;
        const nextConversations = prev.conversations.map((c) =>
          c.id === card.id ? applyOptimisticReview(c, nowIso) : c,
        );
        return recomputeBoardSummary({ ...prev, conversations: nextConversations });
      });

      try {
        const res = await markConversationReviewed(card.id);
        if (res.card) {
          setBoard((prev) => {
            if (!prev) return prev;
            const nextConversations = prev.conversations.map((c) =>
              c.id === card.id ? res.card! : c,
            );
            return recomputeBoardSummary({
              ...prev,
              conversations: nextConversations,
            });
          });
        }
        pushToast({
          title: dict.toasts.markedReviewed(short),
          tone: 'success',
          action: {
            label: dict.toasts.undo,
            onClick: () => {
              void handlePatchOverlay(card.id, {
                reviewedAt: prevReviewedAt,
              }).then(() => {
                void loadBoardData(false);
                pushToast({ title: dict.toasts.undone, tone: 'info' }, 2200);
              });
            },
          },
        });
      } catch {
        if (snapshot) setBoard(snapshot);
        pushToast({ title: dict.errors.updateFailed, tone: 'error' });
      }
    },
    [handlePatchOverlay, loadBoardData, pushToast],
  );

  const handleMarkAllAttentionRead = useCallback(
    async (cards: ConversationCard[]) => {
      if (cards.length === 0) return;
      const ids = cards.map((c) => c.id);
      const idSet = new Set(ids);
      const nowIso = new Date().toISOString();
      const dict = dictionaries[localeRef.current];

      let snapshot: BoardResponse | null = null;
      setBoard((prev) => {
        if (!prev) return prev;
        snapshot = prev;
        const nextConversations = prev.conversations.map((c) =>
          idSet.has(c.id) ? applyOptimisticReview(c, nowIso) : c,
        );
        return recomputeBoardSummary({ ...prev, conversations: nextConversations });
      });

      try {
        const res = await reviewConversationsBatch({ ids });
        const updatedMap = new Map(res.cards.map((c) => [c.id, c]));
        setBoard((prev) => {
          if (!prev) return prev;
          const nextConversations = prev.conversations.map(
            (c) => updatedMap.get(c.id) ?? c,
          );
          return recomputeBoardSummary({
            ...prev,
            conversations: nextConversations,
          });
        });

        pushToast({
          title: dict.toasts.markedAllReviewed(res.updatedCount || ids.length),
          tone: 'success',
          action: {
            label: dict.toasts.undo,
            onClick: () => {
              void reviewConversationsBatch({ ids, reviewedAt: null })
                .then((undoRes) => {
                  const revertedMap = new Map(undoRes.cards.map((c) => [c.id, c]));
                  setBoard((prev) => {
                    if (!prev) return prev;
                    const nextConversations = prev.conversations.map(
                      (c) => revertedMap.get(c.id) ?? c,
                    );
                    return recomputeBoardSummary({
                      ...prev,
                      conversations: nextConversations,
                    });
                  });
                  pushToast({ title: dict.toasts.undone, tone: 'info' }, 2200);
                })
                .catch(() => {
                  void loadBoardData(false);
                });
            },
          },
        });
      } catch {
        if (snapshot) setBoard(snapshot);
        pushToast({ title: dict.errors.updateFailed, tone: 'error' });
      }
    },
    [loadBoardData, pushToast],
  );

  const handleSaveSettings = useCallback(
    async (patch: Partial<BoardSettings>) => {
      const updated = await patchSettings(patch);
      setBoard((prev) => (prev ? { ...prev, settings: updated } : prev));
      void loadBoardData(false);
    },
    [loadBoardData],
  );

  const handleSetDesktopAutoStart = useCallback(
    async (value: boolean) => {
      if (!desktopBridge) return;
      const applied = await desktopBridge.setAutoStart(value);
      setDesktopState((prev) => (prev ? { ...prev, autoStart: applied } : prev));
    },
    [desktopBridge],
  );

  const handleSetDesktopAlwaysOnTop = useCallback(
    async (value: boolean) => {
      if (!desktopBridge) return;
      const applied = await desktopBridge.setAlwaysOnTop(value);
      setDesktopState((prev) => (prev ? { ...prev, alwaysOnTop: applied } : prev));
    },
    [desktopBridge],
  );

  const handleSetDesktopWidgetVisible = useCallback(
    async (value: boolean) => {
      if (!desktopBridge) return;
      const applied = await desktopBridge.setWidgetVisible(value);
      setDesktopState((prev) =>
        prev ? { ...prev, widgetVisible: applied } : prev,
      );
    },
    [desktopBridge],
  );

  const tagCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (!board) return counts;
    for (const c of board.conversations) {
      for (const tag of c.overlay.tags) {
        counts[tag] = (counts[tag] ?? 0) + 1;
      }
    }
    return counts;
  }, [board]);

  const filteredConversations = useMemo(() => {
    if (!board) return [];
    const q = searchQuery.trim().toLowerCase();

    return board.conversations.filter((card) => {
      if (selectedWorkspace && card.workspace !== selectedWorkspace) {
        return false;
      }
      if (selectedTag && !card.overlay.tags.includes(selectedTag)) {
        return false;
      }
      if (radarFilter === 'running' && !card.isRunning && card.lane !== 'running') {
        return false;
      }
      if (
        radarFilter === 'attention' &&
        card.lane !== 'attention' &&
        card.attentionReasons.length === 0
      ) {
        return false;
      }
      if (
        radarFilter === 'agents' &&
        card.swarm === null &&
        card.subagentCount === 0
      ) {
        return false;
      }
      if (radarFilter === 'stale' && card.lane !== 'stale') {
        return false;
      }

      if (q) {
        const clientMatch =
          card.title.toLowerCase().includes(q) ||
          card.preview.toLowerCase().includes(q) ||
          (card.currentFocus?.toLowerCase().includes(q) ?? false) ||
          card.workspace.toLowerCase().includes(q) ||
          card.project.toLowerCase().includes(q) ||
          card.overlay.notes.toLowerCase().includes(q) ||
          card.overlay.tags.some((tag) => tag.toLowerCase().includes(q)) ||
          card.id.toLowerCase().includes(q);
        const serverMatch = serverMatchIds?.has(card.id) ?? false;
        if (!clientMatch && !serverMatch) return false;
      }

      return true;
    });
  }, [
    board,
    searchQuery,
    serverMatchIds,
    selectedWorkspace,
    selectedTag,
    radarFilter,
  ]);

  const attentionLaneCards = useMemo(
    () => filteredConversations.filter((c) => c.lane === 'attention'),
    [filteredConversations],
  );

  const navigableIds = useMemo(
    () => filteredConversations.map((c) => c.id),
    [filteredConversations],
  );
  const selectedIndex = selectedId ? navigableIds.indexOf(selectedId) : -1;

  const handleDrawerPrev = useCallback(() => {
    if (selectedIndex > 0) {
      setSelectedId(navigableIds[selectedIndex - 1]);
    }
  }, [selectedIndex, navigableIds]);

  const handleDrawerNext = useCallback(() => {
    if (selectedIndex >= 0 && selectedIndex < navigableIds.length - 1) {
      setSelectedId(navigableIds[selectedIndex + 1]);
    }
  }, [selectedIndex, navigableIds]);

  const selectedCardFromBoard = useMemo(() => {
    if (!selectedId || !board) return null;
    return board.conversations.find((c) => c.id === selectedId) ?? null;
  }, [selectedId, board]);

  const hasActiveFilters = Boolean(
    searchQuery.trim() || selectedWorkspace || selectedTag || radarFilter,
  );

  const clearAllFilters = useCallback(() => {
    setSearchQuery('');
    setSelectedWorkspace('');
    setSelectedTag('');
    setRadarFilter(null);
  }, []);

  const defaultSettings: BoardSettings = board?.settings ?? {
    staleAfterHours: 72,
    pollIntervalMs: 2500,
  };

  return (
    <div className="agmb-canvas flex min-h-screen flex-col text-[#1C1917] dark:text-[#F2F1EE]">
      <TopBar
        mode={board?.mode ?? 'live'}
        health={health}
        sseStatus={sseStatus}
        lastSyncedAt={lastSyncedAt}
        isRefreshing={isRefreshing}
        onRefresh={() => void loadBoardData(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        serverSearchCount={serverMatchIds ? serverMatchIds.size : null}
        isSearchingServer={isSearchingServer}
        workspaces={board?.workspaces ?? []}
        selectedWorkspace={selectedWorkspace}
        onSelectWorkspace={setSelectedWorkspace}
        allTags={board?.tags ?? []}
        tagCounts={tagCounts}
        selectedTag={selectedTag}
        onSelectTag={setSelectedTag}
        radarFilter={radarFilter}
        onClearAllFilters={clearAllFilters}
        hasActiveFilters={hasActiveFilters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        density={density}
        onDensityChange={setDensity}
        kanbanSort={kanbanSort}
        onKanbanSortChange={setKanbanSort}
        notificationsEnabled={notificationsEnabled}
        soundEnabled={soundEnabled}
        notificationPermission={notificationPermission}
        onToggleNotifications={() => void handleToggleNotifications()}
        onToggleSound={handleToggleSound}
        settings={defaultSettings}
        onSaveSettings={handleSaveSettings}
        desktopState={desktopState}
        onSetDesktopAutoStart={handleSetDesktopAutoStart}
        onSetDesktopAlwaysOnTop={handleSetDesktopAlwaysOnTop}
        onSetDesktopWidgetVisible={handleSetDesktopWidgetVisible}
        onOpenShortcuts={() => setShortcutsModalOpen(true)}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        locale={locale}
        onToggleLocale={() => setLocale((prev) => (prev === 'zh' ? 'en' : 'zh'))}
        t={t}
      />

      <main className="mx-auto flex w-full max-w-[1760px] flex-1 flex-col gap-3 px-4 py-3 sm:px-5">
        {loadError && !board && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-[#DC2626]/25 bg-[#FEF2F2] px-4 py-3 text-xs text-[#B91C1C] dark:border-[#EF4444]/25 dark:bg-[#2A1616] dark:text-[#FCA5A5]">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                {t.errors.loadFailed} ({loadError})
              </span>
            </div>
            <button
              type="button"
              onClick={() => void loadBoardData(true)}
              className="inline-flex items-center gap-1 rounded-lg border border-[#DC2626]/30 bg-white px-2.5 py-1 font-medium text-[#B91C1C] hover:bg-[#FEF2F2] dark:border-[#EF4444]/35 dark:bg-[#1E1212] dark:text-[#FCA5A5]"
            >
              <RefreshCw className="h-3 w-3" />
              <span>{t.errors.retry}</span>
            </button>
          </div>
        )}

        {loading && !board ? (
          <div className="animate-pulse space-y-3">
            <div className="h-10 rounded-xl border border-[#1C1917]/[0.07] bg-white dark:border-white/[0.06] dark:bg-[#171715]" />
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[540px] rounded-2xl border border-[#1C1917]/[0.05] bg-[#EFECE6]/70 dark:border-white/[0.045] dark:bg-[#171715]"
                />
              ))}
            </div>
          </div>
        ) : board ? (
          <>
            <RadarStrip
              stats={board.stats}
              activeFilter={radarFilter}
              onToggleFilter={setRadarFilter}
              t={t}
            />

            {viewMode === 'kanban' && (
              <KanbanBoard
                conversations={filteredConversations}
                selectedId={selectedId}
                density={density}
                sortMode={kanbanSort}
                onSelectConversation={(id) => handleOpenConversation(id, 'overview')}
                onMoveLane={handleMoveLane}
                onResetManualLane={handleResetManualLane}
                onTogglePin={handleTogglePin}
                onMarkReviewed={(card) => void handleMarkReviewed(card)}
                onCyclePriority={handleCyclePriority}
                onMarkAllAttentionRead={(cards) =>
                  void handleMarkAllAttentionRead(cards)
                }
                t={t}
              />
            )}

            {viewMode === 'matrix' && (
              <MatrixView
                conversations={filteredConversations}
                totalCount={board.conversations.length}
                selectedId={selectedId}
                onSelectConversation={(id) => handleOpenConversation(id, 'overview')}
                onTogglePin={handleTogglePin}
                onMarkReviewed={(card) => void handleMarkReviewed(card)}
                locale={locale}
                t={t}
              />
            )}

            {viewMode === 'swarm' && (
              <SwarmClusterView
                conversations={filteredConversations}
                onOpenDetail={(id, tab) => handleOpenConversation(id, tab)}
                t={t}
              />
            )}
          </>
        ) : null}
      </main>

      <DetailDrawer
        conversationId={selectedId}
        initialTab={drawerInitialTab}
        cardFromBoard={selectedCardFromBoard}
        allTags={board?.tags ?? []}
        currentIndex={selectedIndex}
        totalCount={navigableIds.length}
        hasPrev={selectedIndex > 0}
        hasNext={selectedIndex >= 0 && selectedIndex < navigableIds.length - 1}
        onPrev={handleDrawerPrev}
        onNext={handleDrawerNext}
        onClose={() => setSelectedId(null)}
        onPatchOverlay={handlePatchOverlay}
        onMarkReviewed={handleMarkReviewed}
        onCopySuccess={(kind) =>
          pushToast(
            {
              title: kind === 'id' ? t.toasts.copiedId : t.toasts.copiedPath,
              tone: 'info',
            },
            2200,
          )
        }
        onDispatchNotice={(message, tone) =>
          pushToast({ title: message, tone }, 4800)
        }
        locale={locale}
        t={t}
      />

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        conversations={board?.conversations ?? []}
        attentionCount={attentionLaneCards.length}
        activeSearchQuery={searchQuery}
        onApplyBoardSearch={setSearchQuery}
        onSelectConversation={(id) => handleOpenConversation(id, 'overview')}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        locale={locale}
        onToggleLocale={() => setLocale((prev) => (prev === 'zh' ? 'en' : 'zh'))}
        density={density}
        onToggleDensity={() =>
          setDensity((d) => (d === 'comfortable' ? 'compact' : 'comfortable'))
        }
        notificationsEnabled={notificationsEnabled}
        onToggleNotifications={() => void handleToggleNotifications()}
        onMarkAllAttentionReviewed={() =>
          void handleMarkAllAttentionRead(attentionLaneCards)
        }
        onRefresh={() => void loadBoardData(true)}
        onOpenShortcuts={() => setShortcutsModalOpen(true)}
        t={t}
      />

      <ShortcutsModal
        open={shortcutsModalOpen}
        onClose={() => setShortcutsModalOpen(false)}
        t={t}
      />

      <ToastHost
        toasts={toasts}
        onDismiss={dismissToast}
        onOpenConversation={(id) => handleOpenConversation(id, 'overview')}
      />
    </div>
  );
}

export function App() {
  if (isWidgetModeUrl()) {
    return <FloatingWidget />;
  }
  return <MissionBoardApp />;
}

export default App;
