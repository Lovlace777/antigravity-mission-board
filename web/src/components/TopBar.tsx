import { useEffect, useMemo, useRef, useState } from 'react';
import type { BoardSettings, HealthResponse, WorkspaceSummary } from '@shared/types';
import {
  ArrowUpDown,
  Bell,
  BellOff,
  BellRing,
  Check,
  ChevronDown,
  Folder,
  HelpCircle,
  Kanban,
  Languages,
  LayoutGrid,
  Moon,
  Network,
  RefreshCw,
  RotateCcw,
  Rows3,
  Search,
  SlidersHorizontal,
  Sun,
  Table2,
  Tag,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import type { SseStatus } from '../api';
import type { Dictionary, Locale } from '../i18n';
import { formatClockTime } from '../utils';
import { LivePulseDot } from './badges';
import { BrandMark } from './BrandMark';
import type { RadarFilter } from './RadarStrip';

export type ViewMode = 'kanban' | 'matrix' | 'swarm';
export type ThemeMode = 'light' | 'dark';
export type CardDensity = 'comfortable' | 'compact';
export type KanbanSortMode = 'smart' | 'recent' | 'priority' | 'steps';

const MAX_INLINE_TAGS = 6;

interface TopBarProps {
  mode: 'live' | 'demo';
  health: HealthResponse | null;
  sseStatus: SseStatus;
  lastSyncedAt: Date | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onOpenCommandPalette: () => void;
  serverSearchCount: number | null;
  isSearchingServer: boolean;
  workspaces: WorkspaceSummary[];
  selectedWorkspace: string;
  onSelectWorkspace: (ws: string) => void;
  allTags: string[];
  tagCounts: Record<string, number>;
  selectedTag: string;
  onSelectTag: (tag: string) => void;
  radarFilter: RadarFilter;
  onClearAllFilters: () => void;
  hasActiveFilters: boolean;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  density: CardDensity;
  onDensityChange: (d: CardDensity) => void;
  kanbanSort: KanbanSortMode;
  onKanbanSortChange: (s: KanbanSortMode) => void;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  onToggleNotifications: () => void;
  onToggleSound: () => void;
  settings: BoardSettings;
  onSaveSettings: (patch: Partial<BoardSettings>) => Promise<void>;
  onOpenShortcuts: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  locale: Locale;
  onToggleLocale: () => void;
  t: Dictionary;
}

export function TopBar({
  mode,
  health,
  sseStatus,
  lastSyncedAt,
  isRefreshing,
  onRefresh,
  searchQuery,
  onSearchChange,
  onOpenCommandPalette,
  serverSearchCount,
  isSearchingServer,
  workspaces,
  selectedWorkspace,
  onSelectWorkspace,
  allTags,
  tagCounts,
  selectedTag,
  onSelectTag,
  radarFilter,
  onClearAllFilters,
  hasActiveFilters,
  viewMode,
  onViewModeChange,
  density,
  onDensityChange,
  kanbanSort,
  onKanbanSortChange,
  notificationsEnabled,
  soundEnabled,
  notificationPermission,
  onToggleNotifications,
  onToggleSound,
  settings,
  onSaveSettings,
  onOpenShortcuts,
  theme,
  onToggleTheme,
  locale,
  onToggleLocale,
  t,
}: TopBarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [staleInput, setStaleInput] = useState(String(settings.staleAfterHours));
  const [pollInput, setPollInput] = useState(String(settings.pollIntervalMs));
  const [savingSettings, setSavingSettings] = useState(false);
  const [savedFeedback, setSavedFeedback] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Overflow tags popover state
  const [moreTagsOpen, setMoreTagsOpen] = useState(false);
  const [tagSearch, setTagSearch] = useState('');
  const moreTagsRef = useRef<HTMLDivElement>(null);
  const tagSearchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setStaleInput(String(settings.staleAfterHours));
    setPollInput(String(settings.pollIntervalMs));
  }, [settings.staleAfterHours, settings.pollIntervalMs]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSettingsOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [settingsOpen]);

  useEffect(() => {
    if (!moreTagsOpen) {
      setTagSearch('');
      return;
    }
    requestAnimationFrame(() => tagSearchInputRef.current?.focus());
    const onDocClick = (e: MouseEvent) => {
      if (moreTagsRef.current && !moreTagsRef.current.contains(e.target as Node)) {
        setMoreTagsOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreTagsOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [moreTagsOpen]);

  // Sort tags by usage frequency so top 6 inline tags are highest-signal
  const { inlineTags, overflowTags } = useMemo(() => {
    const sorted = [...allTags].sort((a, b) => {
      const diff = (tagCounts[b] ?? 0) - (tagCounts[a] ?? 0);
      return diff !== 0 ? diff : a.localeCompare(b);
    });

    if (sorted.length <= MAX_INLINE_TAGS) {
      return { inlineTags: sorted, overflowTags: [] as string[] };
    }

    const top = sorted.slice(0, MAX_INLINE_TAGS);
    const rest = sorted.slice(MAX_INLINE_TAGS);
    if (selectedTag && rest.includes(selectedTag)) {
      const swappedTop = [...top.slice(0, MAX_INLINE_TAGS - 1), selectedTag];
      const swappedRest = [top[MAX_INLINE_TAGS - 1], ...rest.filter((x) => x !== selectedTag)];
      return { inlineTags: swappedTop, overflowTags: swappedRest };
    }
    return { inlineTags: top, overflowTags: rest };
  }, [allTags, tagCounts, selectedTag]);

  const filteredOverflowTags = useMemo(() => {
    const q = tagSearch.trim().toLowerCase();
    if (!q) return overflowTags;
    return allTags.filter((tag) => tag.toLowerCase().includes(q));
  }, [tagSearch, overflowTags, allTags]);

  const handleSaveSettings = async () => {
    const staleHours = Math.max(1, Math.min(8760, Number(staleInput) || 72));
    const pollMs = Math.max(1000, Math.min(60000, Number(pollInput) || 2500));
    setSavingSettings(true);
    try {
      await onSaveSettings({ staleAfterHours: staleHours, pollIntervalMs: pollMs });
      setSavedFeedback(true);
      setTimeout(() => setSavedFeedback(false), 1800);
    } finally {
      setSavingSettings(false);
    }
  };

  return (
    <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/85 backdrop-blur-md dark:border-[#202532] dark:bg-[#0A0C10]/88">
      <div className="mx-auto max-w-[1760px] px-4 sm:px-5">
        {/* Primary command row */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 py-2.5">
          {/* Left: Bespoke Brand + Live SSE indicator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <BrandMark className="h-7 w-7 shadow-xs" />
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {t.appName}
                </h1>
                {mode === 'demo' && (
                  <span
                    title={t.demoTooltip}
                    className="rounded-full border border-sky-200/90 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/12 dark:text-sky-300"
                  >
                    {t.demoMode}
                  </span>
                )}
              </div>
            </div>

            <div className="hidden h-4 w-px bg-zinc-200 sm:block dark:bg-[#222733]" />

            {/* SSE Live pill + Manual Refresh */}
            <div className="hidden items-center gap-1.5 sm:flex">
              <div
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200/80 bg-zinc-50/80 px-2 py-1 text-[11px] font-medium text-zinc-600 dark:border-[#212633] dark:bg-[#12151C] dark:text-zinc-400"
                title={`${t.lastSynced} ${formatClockTime(lastSyncedAt)}`}
              >
                {sseStatus === 'connected' ? (
                  <LivePulseDot />
                ) : (
                  <span
                    className={`h-2 w-2 rounded-full ${
                      sseStatus === 'connecting' ? 'animate-pulse bg-amber-400' : 'bg-rose-500'
                    }`}
                  />
                )}
                <span className="text-zinc-700 dark:text-zinc-300">
                  {sseStatus === 'connected'
                    ? t.liveConnected
                    : sseStatus === 'connecting'
                      ? t.liveConnecting
                      : t.liveDisconnected}
                </span>
                <span className="tabular-nums font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                  {formatClockTime(lastSyncedAt)}
                </span>
              </div>

              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                title={t.refresh}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200/80 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-50 dark:border-[#212633] dark:bg-[#12151C] dark:text-zinc-400 dark:hover:border-[#323A4B] dark:hover:text-zinc-100"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Center: Raycast/Linear Command Palette Trigger Bar */}
          <div className="relative order-3 w-full md:order-2 md:max-w-md md:flex-1">
            <div
              role="button"
              tabIndex={0}
              onClick={onOpenCommandPalette}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenCommandPalette();
                }
              }}
              aria-label={t.searchTriggerPlaceholder}
              className={`group flex h-8 w-full cursor-pointer items-center gap-2 rounded-lg border px-2.5 text-xs transition-all ${
                searchQuery.trim()
                  ? 'border-sky-400/70 bg-sky-50/40 text-zinc-900 dark:border-sky-500/45 dark:bg-sky-500/8 dark:text-zinc-100'
                  : 'border-zinc-200/90 bg-zinc-50/75 text-zinc-400 hover:border-zinc-300 hover:bg-white dark:border-[#242A38] dark:bg-[#12151C] dark:text-zinc-500 dark:hover:border-[#343E53] dark:hover:bg-[#161A24]'
              }`}
            >
              <Search className="h-3.5 w-3.5 shrink-0 text-zinc-400 transition-colors group-hover:text-zinc-600 dark:group-hover:text-zinc-300" />
              <span className="min-w-0 flex-1 truncate">
                {searchQuery.trim() ? (
                  <span className="font-medium text-zinc-800 dark:text-zinc-100">
                    {searchQuery}
                  </span>
                ) : (
                  t.searchTriggerPlaceholder
                )}
              </span>

              {searchQuery.trim() ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  {isSearchingServer ? (
                    <span className="h-3 w-3 animate-spin rounded-full border border-zinc-300 border-t-sky-500 dark:border-zinc-700 dark:border-t-sky-400" />
                  ) : serverSearchCount !== null ? (
                    <span className="tabular-nums rounded bg-sky-500/12 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:text-sky-300">
                      {t.searchServerMatches(serverSearchCount)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSearchChange('');
                    }}
                    className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200/70 hover:text-zinc-700 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-200"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <kbd className="hidden shrink-0 rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 shadow-[0_1px_0_rgba(0,0,0,0.04)] sm:inline-block dark:border-[#2A3142] dark:bg-[#181D27] dark:text-zinc-500">
                  {t.searchShortcutHint}
                </kbd>
              )}
            </div>
          </div>

          {/* Right: View Switcher + Utility Controls */}
          <div className="order-2 flex items-center gap-1.5 md:order-3">
            {/* View Switcher */}
            <nav
              aria-label="View switcher"
              className="inline-flex items-center rounded-lg border border-zinc-200/90 bg-zinc-100/75 p-0.5 dark:border-[#212633] dark:bg-[#12151C]"
            >
              {(
                [
                  { id: 'kanban' as const, label: t.views.kanban, Icon: Kanban, key: '1' },
                  { id: 'matrix' as const, label: t.views.matrix, Icon: Table2, key: '2' },
                  { id: 'swarm' as const, label: t.views.swarm, Icon: Network, key: '3' },
                ] as const
              ).map(({ id, label, Icon, key }) => {
                const active = viewMode === id;
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => onViewModeChange(id)}
                    title={`${label} (${key})`}
                    className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                      active
                        ? 'bg-white text-zinc-900 shadow-xs dark:bg-[#1E2432] dark:text-zinc-50'
                        : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-200'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mx-0.5 hidden h-4 w-px bg-zinc-200 sm:block dark:bg-[#222733]" />

            {/* Desktop Notification toggle */}
            <button
              type="button"
              onClick={onToggleNotifications}
              title={
                notificationPermission === 'denied'
                  ? t.notifications.denied
                  : `${notificationsEnabled ? t.notifications.enabled : t.notifications.enable} — ${t.notifications.tooltip}`
              }
              className={`relative inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                notificationsEnabled
                  ? 'border-sky-300/80 bg-sky-50 text-sky-700 dark:border-sky-500/40 dark:bg-sky-500/15 dark:text-sky-300'
                  : 'border-zinc-200/80 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-900 dark:border-[#212633] dark:bg-[#12151C] dark:text-zinc-400 dark:hover:border-[#323A4B] dark:hover:text-zinc-100'
              }`}
            >
              {notificationPermission === 'denied' ? (
                <BellOff className="h-3.5 w-3.5" />
              ) : notificationsEnabled ? (
                <BellRing className="h-3.5 w-3.5" />
              ) : (
                <Bell className="h-3.5 w-3.5" />
              )}
              {notificationsEnabled && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-sky-500" />
              )}
            </button>

            {/* Sound Chime toggle */}
            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? t.notifications.soundOn : t.notifications.soundOff}
              className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                soundEnabled
                  ? 'border-zinc-200/80 bg-white text-zinc-700 hover:border-zinc-300 dark:border-[#212633] dark:bg-[#12151C] dark:text-zinc-300 dark:hover:border-[#323A4B]'
                  : 'border-zinc-200/80 bg-white text-zinc-400 hover:text-zinc-600 dark:border-[#212633] dark:bg-[#12151C] dark:text-zinc-500 dark:hover:text-zinc-300'
              }`}
            >
              {soundEnabled ? (
                <Volume2 className="h-3.5 w-3.5" />
              ) : (
                <VolumeX className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Settings Popover */}
            <div className="relative" ref={popoverRef}>
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                title={t.settings.title}
                className={`inline-flex h-7 w-7 items-center justify-center rounded-md border transition-colors ${
                  settingsOpen
                    ? 'border-zinc-400 bg-zinc-100 text-zinc-900 dark:border-[#3A4357] dark:bg-[#1E2330] dark:text-zinc-100'
                    : 'border-zinc-200/80 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-900 dark:border-[#212633] dark:bg-[#12151C] dark:text-zinc-400 dark:hover:border-[#323A4B] dark:hover:text-zinc-100'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>

              {settingsOpen && (
                <div className="agmb-modal-enter absolute top-9 right-0 z-50 w-80 rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-[#2A3040] dark:bg-[#151922]">
                  <div className="flex items-center justify-between border-b border-zinc-100 pb-2.5 dark:border-[#222733]">
                    <span className="text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                      {t.settings.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(false)}
                      className="rounded p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-3 space-y-3.5">
                    <div>
                      <label className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                        {t.settings.staleAfterHours}
                      </label>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                        {t.settings.staleAfterHint}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={8760}
                          value={staleInput}
                          onChange={(e) => setStaleInput(e.target.value)}
                          className="tabular-nums h-8 w-24 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 text-xs text-zinc-900 focus:border-sky-500 focus:bg-white focus:outline-none dark:border-[#2A3040] dark:bg-[#0E1117] dark:text-zinc-100"
                        />
                        <span className="text-xs text-zinc-500 dark:text-zinc-400">
                          {t.settings.hoursUnit}
                        </span>
                        <div className="ml-auto flex gap-1">
                          {[24, 72, 168].map((hrs) => (
                            <button
                              key={hrs}
                              type="button"
                              onClick={() => setStaleInput(String(hrs))}
                              className={`tabular-nums rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                                Number(staleInput) === hrs
                                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                                  : 'bg-zinc-100 text-zinc-600 hover:bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700'
                              }`}
                            >
                              {hrs}h
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-zinc-700 dark:text-zinc-300">
                        {t.settings.pollIntervalMs}
                      </label>
                      <input
                        type="number"
                        min={1000}
                        max={60000}
                        step={500}
                        value={pollInput}
                        onChange={(e) => setPollInput(e.target.value)}
                        className="tabular-nums mt-1.5 h-8 w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 text-xs text-zinc-900 focus:border-sky-500 focus:bg-white focus:outline-none dark:border-[#2A3040] dark:bg-[#0E1117] dark:text-zinc-100"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={savingSettings}
                      onClick={handleSaveSettings}
                      className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-md bg-zinc-900 px-3 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-950 dark:hover:bg-zinc-200"
                    >
                      {savedFeedback ? (
                        <>
                          <Check className="h-3.5 w-3.5" />
                          <span>{t.settings.saved}</span>
                        </>
                      ) : savingSettings ? (
                        <span>{t.settings.saving}</span>
                      ) : (
                        <span>{t.settings.save}</span>
                      )}
                    </button>

                    {health && (
                      <div className="space-y-1 border-t border-zinc-100 pt-2.5 text-[11px] dark:border-[#222733]">
                        <div className="flex items-center justify-between text-zinc-500 dark:text-zinc-400">
                          <span>{t.settings.mode}</span>
                          <span className="font-mono text-zinc-800 dark:text-zinc-200">
                            {health.mode} · v{health.version}
                          </span>
                        </div>
                        <div className="text-zinc-500 dark:text-zinc-400">
                          <span>{t.settings.dataDir}:</span>
                          <div
                            className="mt-0.5 truncate font-mono text-[10px] text-zinc-600 dark:text-zinc-400"
                            title={health.dataDir}
                          >
                            {health.dataDir}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Keyboard Shortcuts (?) button */}
            <button
              type="button"
              onClick={onOpenShortcuts}
              title={t.shortcutsModal.buttonTooltip}
              aria-label={t.shortcutsModal.buttonTooltip}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200/80 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-[#212633] dark:bg-[#12151C] dark:text-zinc-400 dark:hover:border-[#323A4B] dark:hover:text-zinc-100"
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>

            {/* Theme toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              title={theme === 'dark' ? t.theme.switchToLight : t.theme.switchToDark}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200/80 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-[#212633] dark:bg-[#12151C] dark:text-zinc-400 dark:hover:border-[#323A4B] dark:hover:text-zinc-100"
            >
              {theme === 'dark' ? (
                <Sun className="h-3.5 w-3.5" />
              ) : (
                <Moon className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Language toggle */}
            <button
              type="button"
              onClick={onToggleLocale}
              title="中文 / English"
              className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200/80 bg-white px-2 text-[11px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-[#212633] dark:bg-[#12151C] dark:text-zinc-300 dark:hover:border-[#323A4B] dark:hover:text-zinc-100"
            >
              <Languages className="h-3.5 w-3.5 text-zinc-400" />
              <span>{locale === 'zh' ? '中' : 'EN'}</span>
            </button>
          </div>
        </div>

        {/* Decluttered Filter & Toolbar Row (<=6 inline tags + searchable +N popover + Density & Sort) */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 py-1.5 dark:border-[#191E29]">
          {/* Left: Workspace + Top 6 Tags + Overflow Popover + Reset */}
          <div className="flex min-w-0 flex-wrap items-center gap-1.5">
            {/* Workspace selector */}
            <div className="relative flex shrink-0 items-center">
              <Folder className="pointer-events-none absolute left-2 h-3 w-3 text-zinc-400" />
              <select
                value={selectedWorkspace}
                onChange={(e) => onSelectWorkspace(e.target.value)}
                aria-label={t.allWorkspaces}
                className="h-6.5 cursor-pointer appearance-none rounded-md border border-zinc-200/80 bg-white pr-6 pl-6 text-[11px] font-medium text-zinc-700 transition-colors hover:border-zinc-300 focus:border-sky-500 focus:outline-none dark:border-[#212633] dark:bg-[#12151C] dark:text-zinc-300 dark:hover:border-[#323A4B]"
              >
                <option value="">{t.allWorkspaces}</option>
                {workspaces.map((ws) => (
                  <option key={ws.path || ws.name} value={ws.name}>
                    {ws.name || t.noWorkspace} ({ws.count})
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-zinc-400" />
            </div>

            {allTags.length > 0 && (
              <>
                <div className="h-3.5 w-px shrink-0 bg-zinc-200 dark:bg-[#222733]" />
                <div className="flex flex-wrap items-center gap-1">
                  <Tag className="mr-0.5 h-3 w-3 shrink-0 text-zinc-400" />
                  <button
                    type="button"
                    onClick={() => onSelectTag('')}
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                      selectedTag === ''
                        ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                        : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-[#1B202B] dark:hover:text-zinc-200'
                    }`}
                  >
                    {t.allTags}
                  </button>

                  {inlineTags.map((tag) => {
                    const active = selectedTag === tag;
                    return (
                      <button
                        key={tag}
                        type="button"
                        onClick={() => onSelectTag(active ? '' : tag)}
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                          active
                            ? 'bg-sky-600 text-white dark:bg-sky-500 dark:text-zinc-950'
                            : 'border border-zinc-200/80 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-[#242A37] dark:bg-[#12151C] dark:text-zinc-300 dark:hover:border-[#343C4F]'
                        }`}
                      >
                        #{tag}
                      </button>
                    );
                  })}

                  {/* +N More Searchable Tag Popover */}
                  {overflowTags.length > 0 && (
                    <div className="relative" ref={moreTagsRef}>
                      <button
                        type="button"
                        onClick={() => setMoreTagsOpen((v) => !v)}
                        className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                          moreTagsOpen
                            ? 'border-sky-400 bg-sky-50 text-sky-700 dark:border-sky-500/50 dark:bg-sky-500/15 dark:text-sky-300'
                            : 'border-dashed border-zinc-300 bg-white/70 text-zinc-500 hover:border-zinc-400 hover:text-zinc-800 dark:border-[#2E3647] dark:bg-[#12151C] dark:text-zinc-400 dark:hover:border-[#3E485E] dark:hover:text-zinc-200'
                        }`}
                      >
                        <span>{t.moreTags(overflowTags.length)}</span>
                        <ChevronDown className="h-3 w-3" />
                      </button>

                      {moreTagsOpen && (
                        <div className="agmb-modal-enter absolute top-8 left-0 z-50 w-56 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xl dark:border-[#2A3142] dark:bg-[#151922]">
                          <div className="border-b border-zinc-100 p-2 dark:border-[#202634]">
                            <div className="relative">
                              <Search className="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-zinc-400" />
                              <input
                                ref={tagSearchInputRef}
                                type="text"
                                value={tagSearch}
                                onChange={(e) => setTagSearch(e.target.value)}
                                placeholder={t.searchTagsPlaceholder}
                                className="h-7 w-full rounded-md border border-zinc-200 bg-zinc-50 pr-2 pl-6.5 text-[11px] text-zinc-900 placeholder:text-zinc-400 focus:border-sky-500 focus:bg-white focus:outline-none dark:border-[#283042] dark:bg-[#0E1117] dark:text-zinc-100"
                              />
                            </div>
                          </div>
                          <div className="max-h-52 overflow-y-auto p-1.5">
                            {filteredOverflowTags.length === 0 ? (
                              <div className="py-4 text-center text-[11px] text-zinc-400">
                                {t.noMatchingTags}
                              </div>
                            ) : (
                              filteredOverflowTags.map((tag) => {
                                const active = selectedTag === tag;
                                return (
                                  <button
                                    key={tag}
                                    type="button"
                                    onClick={() => {
                                      onSelectTag(active ? '' : tag);
                                      setMoreTagsOpen(false);
                                    }}
                                    className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-[11.5px] transition-colors ${
                                      active
                                        ? 'bg-sky-50 font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300'
                                        : 'text-zinc-700 hover:bg-zinc-100/80 dark:text-zinc-300 dark:hover:bg-[#1D2331]'
                                    }`}
                                  >
                                    <span className="truncate">#{tag}</span>
                                    <span className="tabular-nums font-mono text-[10px] text-zinc-400">
                                      {tagCounts[tag] ?? 0}
                                    </span>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            )}

            {hasActiveFilters && (
              <button
                type="button"
                onClick={onClearAllFilters}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-sky-200/80 bg-sky-50/70 px-2 py-0.5 text-[11px] font-medium text-sky-700 transition-colors hover:bg-sky-100/80 dark:border-sky-500/30 dark:bg-sky-500/12 dark:text-sky-300 dark:hover:bg-sky-500/20"
              >
                <RotateCcw className="h-3 w-3" />
                <span>
                  {t.resetFilters}
                  {radarFilter
                    ? ` · ${t.radar[radarFilter === 'agents' ? 'swarmsAndAgents' : radarFilter]}`
                    : ''}
                </span>
              </button>
            )}
          </div>

          {/* Right: Kanban Sort + Card Density Toggle */}
          {viewMode === 'kanban' && (
            <div className="flex shrink-0 items-center gap-2">
              {/* Kanban Sort Selector */}
              <div className="relative flex items-center">
                <ArrowUpDown className="pointer-events-none absolute left-2 h-3 w-3 text-zinc-400" />
                <select
                  value={kanbanSort}
                  onChange={(e) => onKanbanSortChange(e.target.value as KanbanSortMode)}
                  aria-label={t.kanbanSort.label}
                  className="h-6.5 cursor-pointer appearance-none rounded-md border border-zinc-200/80 bg-white pr-6 pl-6 text-[11px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 focus:border-sky-500 focus:outline-none dark:border-[#212633] dark:bg-[#12151C] dark:text-zinc-300 dark:hover:border-[#323A4B]"
                >
                  <option value="smart">{t.kanbanSort.smart}</option>
                  <option value="recent">{t.kanbanSort.recent}</option>
                  <option value="priority">{t.kanbanSort.priority}</option>
                  <option value="steps">{t.kanbanSort.steps}</option>
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-zinc-400" />
              </div>

              {/* Card Density Toggle (Comfortable / Compact) */}
              <div
                role="group"
                aria-label={t.density.label}
                className="inline-flex items-center rounded-md border border-zinc-200/80 bg-zinc-100/70 p-0.5 dark:border-[#212633] dark:bg-[#12151C]"
              >
                <button
                  type="button"
                  onClick={() => onDensityChange('comfortable')}
                  title={t.density.comfortable}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    density === 'comfortable'
                      ? 'bg-white text-zinc-900 shadow-xs dark:bg-[#1E2432] dark:text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                >
                  <LayoutGrid className="h-3 w-3" />
                  <span className="hidden lg:inline">{t.density.comfortable}</span>
                </button>
                <button
                  type="button"
                  onClick={() => onDensityChange('compact')}
                  title={t.density.compact}
                  className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition-colors ${
                    density === 'compact'
                      ? 'bg-white text-zinc-900 shadow-xs dark:bg-[#1E2432] dark:text-zinc-100'
                      : 'text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                >
                  <Rows3 className="h-3 w-3" />
                  <span className="hidden lg:inline">{t.density.compact}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
