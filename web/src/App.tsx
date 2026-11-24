import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BoardNotification,
  BoardResponse,
  BoardSettings,
  ConversationCard,
  HealthResponse,
  LaneId,
  OverlayPatch,
  SseEvent,
} from '@shared/types';
import { AlertCircle, RefreshCw } from 'lucide-react';
import {
  fetchBoard,
  fetchHealth,
  markConversationReviewed,
  patchConversationOverlay,
  patchSettings,
  searchConversations,
  subscribeBoardEvents,
  type SseStatus,
} from './api';
import { DetailDrawer, type DrawerTab } from './components/DetailDrawer';
import { KanbanBoard } from './components/KanbanBoard';
import { MatrixView } from './components/MatrixView';
import { RadarStrip, type RadarFilter } from './components/RadarStrip';
import { SwarmClusterView } from './components/SwarmClusterView';
import { ToastContainer, type ToastItem } from './components/ToastNotification';
import { TopBar, type ThemeMode, type ViewMode } from './components/TopBar';
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

export function App() {
  // Preferences
  const [locale, setLocale] = useState<Locale>(loadSavedLocale);
  const [theme, setTheme] = useState<ThemeMode>(loadInitialTheme);
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() =>
    loadBoolPref('agmb_notifications', false),
  );
  const [soundEnabled, setSoundEnabled] = useState<boolean>(() =>
    loadBoolPref('agmb_sound', true),
  );
  const [notificationPermission, setNotificationPermission] = useState<
    NotificationPermission | 'unsupported'
  >(getNotificationPermission);

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

  // Detail Drawer
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drawerInitialTab, setDrawerInitialTab] = useState<DrawerTab>('overview');

  // Toasts
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  // Periodic tick to keep relative timestamps fresh
  const [, setRelativeClockTick] = useState(0);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const seenNotificationsRef = useRef<Set<string>>(new Set());
  const notificationsEnabledRef = useRef(notificationsEnabled);
  const soundEnabledRef = useRef(soundEnabled);
  const localeRef = useRef(locale);

  notificationsEnabledRef.current = notificationsEnabled;
  soundEnabledRef.current = soundEnabled;
  localeRef.current = locale;

  // Apply dark mode class to <html>
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
  }, [theme]);

  // Apply document lang attribute
  useEffect(() => {
    document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    saveLocale(locale);
  }, [locale]);

  // 30s ticker for relative timestamps
  useEffect(() => {
    const timer = setInterval(() => setRelativeClockTick((n) => n + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  const pushToast = useCallback((toast: Omit<ToastItem, 'id'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setToasts((prev) => [...prev.slice(-3), { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 6000);
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

  // Initial fetch + manual refresh
  const loadBoardData = useCallback(async (manual = false) => {
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
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : 'Network error');
    } finally {
      setLoading(false);
      if (manual) setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadBoardData(false);
  }, [loadBoardData]);

  // Handle incoming SSE Notification
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

      pushToast({
        title: `${kindLabel} · ${notif.title}`,
        message: notif.message || notif.workspace,
        tone,
        conversationId: notif.conversationId,
      });

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
          // ignore desktop notification failure
        }
      }
    },
    [pushToast, handleOpenConversation],
  );

  // SSE Live Subscription
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

  // Debounced Server FTS Search
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
        .catch(() => {
          // ignore abort or transient search error; instant client filter still works
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setIsSearchingServer(false);
          }
        });
    }, 240);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [searchQuery]);

  // Global Keyboard Shortcuts: Ctrl+K, /, 1, 2, 3
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
        return;
      }

      const target = e.target as HTMLElement | null;
      const isEditing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (isEditing) {
        if (e.key === 'Escape' && target === searchInputRef.current) {
          searchInputRef.current?.blur();
        }
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.key === '1') {
        setViewMode('kanban');
      } else if (e.key === '2') {
        setViewMode('matrix');
      } else if (e.key === '3') {
        setViewMode('swarm');
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Toggle Desktop Notifications
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

  // Optimistic Overlay Patch
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
        pushToast({ title: t.errors.updateFailed, tone: 'error' });
      }
    },
    [pushToast, t.errors.updateFailed],
  );

  const handleMoveLane = useCallback(
    (card: ConversationCard, targetLane: LaneId) => {
      const manualLane = targetLane === card.autoLane ? null : targetLane;
      void handlePatchOverlay(card.id, { manualLane });
    },
    [handlePatchOverlay],
  );

  const handleResetManualLane = useCallback(
    (card: ConversationCard) => {
      void handlePatchOverlay(card.id, { manualLane: null });
    },
    [handlePatchOverlay],
  );

  const handleTogglePin = useCallback(
    (card: ConversationCard) => {
      void handlePatchOverlay(card.id, { pinned: !card.overlay.pinned });
    },
    [handlePatchOverlay],
  );

  const handleMarkReviewed = useCallback(
    async (card: ConversationCard) => {
      const nowIso = new Date().toISOString();
      let snapshot: BoardResponse | null = null;
      setBoard((prev) => {
        if (!prev) return prev;
        snapshot = prev;
        const nextConversations = prev.conversations.map((c) => {
          if (c.id !== card.id) return c;
          const remainingReasons = c.attentionReasons.filter(
            (r) => r !== 'unread_update' && r !== 'marked_as_unread',
          );
          const nextAutoLane: LaneId =
            !c.isRunning && !c.isArchived && remainingReasons.length === 0 && c.autoLane === 'attention'
              ? 'active'
              : c.autoLane;
          return {
            ...c,
            markedAsUnread: false,
            attentionReasons: remainingReasons,
            autoLane: nextAutoLane,
            lane: c.overlay.manualLane ?? nextAutoLane,
            overlay: { ...c.overlay, reviewedAt: nowIso },
          };
        });
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
      } catch {
        if (snapshot) setBoard(snapshot);
        pushToast({ title: t.errors.updateFailed, tone: 'error' });
      }
    },
    [pushToast, t.errors.updateFailed],
  );

  const handleSaveSettings = useCallback(
    async (patch: Partial<BoardSettings>) => {
      const updated = await patchSettings(patch);
      setBoard((prev) => (prev ? { ...prev, settings: updated } : prev));
      void loadBoardData(false);
    },
    [loadBoardData],
  );

  // Filtered Conversations
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
    <div className="flex min-h-screen flex-col bg-[#F7F8FA] text-zinc-900 dark:bg-[#0B0D11] dark:text-zinc-100">
      <TopBar
        mode={board?.mode ?? 'live'}
        health={health}
        sseStatus={sseStatus}
        lastSyncedAt={lastSyncedAt}
        isRefreshing={isRefreshing}
        onRefresh={() => void loadBoardData(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchInputRef={searchInputRef}
        serverSearchCount={serverMatchIds ? serverMatchIds.size : null}
        isSearchingServer={isSearchingServer}
        workspaces={board?.workspaces ?? []}
        selectedWorkspace={selectedWorkspace}
        onSelectWorkspace={setSelectedWorkspace}
        allTags={board?.tags ?? []}
        selectedTag={selectedTag}
        onSelectTag={setSelectedTag}
        radarFilter={radarFilter}
        onClearAllFilters={clearAllFilters}
        hasActiveFilters={hasActiveFilters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        notificationsEnabled={notificationsEnabled}
        soundEnabled={soundEnabled}
        notificationPermission={notificationPermission}
        onToggleNotifications={() => void handleToggleNotifications()}
        onToggleSound={handleToggleSound}
        settings={defaultSettings}
        onSaveSettings={handleSaveSettings}
        theme={theme}
        onToggleTheme={() => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))}
        locale={locale}
        onToggleLocale={() => setLocale((prev) => (prev === 'zh' ? 'en' : 'zh'))}
        t={t}
      />

      <main className="mx-auto flex w-full max-w-[1760px] flex-1 flex-col gap-3.5 px-4 py-3.5 sm:px-5">
        {/* Connection Error Banner */}
        {loadError && !board && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-xs text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-200">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>
                {t.errors.loadFailed} ({loadError})
              </span>
            </div>
            <button
              type="button"
              onClick={() => void loadBoardData(true)}
              className="inline-flex items-center gap-1 rounded-md border border-rose-300 bg-white px-2.5 py-1 font-medium text-rose-700 hover:bg-rose-50 dark:border-rose-500/40 dark:bg-rose-950/40 dark:text-rose-200"
            >
              <RefreshCw className="h-3 w-3" />
              <span>{t.errors.retry}</span>
            </button>
          </div>
        )}

        {/* Loading Skeleton */}
        {loading && !board ? (
          <div className="space-y-4 animate-pulse">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[68px] rounded-lg border border-zinc-200/80 bg-white dark:border-[#222733] dark:bg-[#13161D]"
                />
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-[520px] rounded-xl border border-zinc-200/80 bg-zinc-100/60 dark:border-[#1E2330] dark:bg-[#0F1218]"
                />
              ))}
            </div>
          </div>
        ) : board ? (
          <>
            {/* Attention Radar KPI Strip */}
            <RadarStrip
              stats={board.stats}
              activeFilter={radarFilter}
              onToggleFilter={setRadarFilter}
              t={t}
            />

            {/* Main Active View */}
            {viewMode === 'kanban' && (
              <KanbanBoard
                conversations={filteredConversations}
                selectedId={selectedId}
                onSelectConversation={(id) => handleOpenConversation(id, 'overview')}
                onMoveLane={handleMoveLane}
                onResetManualLane={handleResetManualLane}
                onTogglePin={handleTogglePin}
                onMarkReviewed={(card) => void handleMarkReviewed(card)}
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

      {/* Slide-over Detail Drawer */}
      <DetailDrawer
        conversationId={selectedId}
        initialTab={drawerInitialTab}
        cardFromBoard={selectedCardFromBoard}
        allTags={board?.tags ?? []}
        onClose={() => setSelectedId(null)}
        onPatchOverlay={handlePatchOverlay}
        onMarkReviewed={handleMarkReviewed}
        locale={locale}
        t={t}
      />

      {/* Toasts */}
      <ToastContainer
        toasts={toasts}
        onDismiss={dismissToast}
        onOpenConversation={(id) => handleOpenConversation(id, 'overview')}
      />
    </div>
  );
}
export default App;
