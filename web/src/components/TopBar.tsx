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
  Monitor,
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
import { getDesktopBridge, type DesktopState } from '../desktopBridge';
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
  showSecondaryFilterRow: boolean;
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
  desktopState: DesktopState | null;
  onSetDesktopAutoStart?: (value: boolean) => Promise<void>;
  onSetDesktopAlwaysOnTop?: (value: boolean) => Promise<void>;
  onSetDesktopWidgetVisible?: (value: boolean) => Promise<void>;
  onOpenShortcuts: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  locale: Locale;
  onToggleLocale: () => void;
  t: Dictionary;
}

export function KanbanViewControls({
  kanbanSort,
  onKanbanSortChange,
  density,
  onDensityChange,
  t,
  testId,
}: {
  kanbanSort: KanbanSortMode;
  onKanbanSortChange: (s: KanbanSortMode) => void;
  density: CardDensity;
  onDensityChange: (d: CardDensity) => void;
  t: Dictionary;
  testId?: string;
}) {
  return (
    <div data-testid={testId} className="flex shrink-0 items-center gap-2">
      <div className="relative flex items-center">
        <ArrowUpDown className="pointer-events-none absolute left-2 h-3 w-3 text-[#8C867E]" />
        <select
          value={kanbanSort}
          onChange={(e) => onKanbanSortChange(e.target.value as KanbanSortMode)}
          aria-label={t.kanbanSort.label}
          className="h-6.5 cursor-pointer appearance-none rounded-lg border border-[#1C1917]/[0.08] bg-white pr-6 pl-6 text-[11px] font-medium text-[#44403C] transition-colors hover:border-[#1C1917]/[0.18] focus:border-[#1C1917]/40 focus:outline-none dark:border-white/[0.075] dark:bg-[#181816] dark:text-[#D6D3CD] dark:hover:border-white/[0.16]"
        >
          <option value="smart">{t.kanbanSort.smart}</option>
          <option value="recent">{t.kanbanSort.recent}</option>
          <option value="priority">{t.kanbanSort.priority}</option>
          <option value="steps">{t.kanbanSort.steps}</option>
        </select>
        <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-[#8C867E]" />
      </div>

      <div
        role="group"
        aria-label={t.density.label}
        className="inline-flex items-center rounded-lg border border-[#1C1917]/[0.08] bg-[#EFECE6]/90 p-0.5 dark:border-white/[0.07] dark:bg-[#171715]"
      >
        <button
          type="button"
          onClick={() => onDensityChange('comfortable')}
          title={t.density.comfortable}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
            density === 'comfortable'
              ? 'bg-[#1C1917] text-[#F6F5F1] shadow-xs dark:bg-[#F2F1EE] dark:text-[#111110]'
              : 'text-[#57534E] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:text-[#F2F1EE]'
          }`}
        >
          <LayoutGrid className="h-3 w-3" />
          <span className="hidden lg:inline">{t.density.comfortable}</span>
        </button>
        <button
          type="button"
          onClick={() => onDensityChange('compact')}
          title={t.density.compact}
          className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
            density === 'compact'
              ? 'bg-[#1C1917] text-[#F6F5F1] shadow-xs dark:bg-[#F2F1EE] dark:text-[#111110]'
              : 'text-[#57534E] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:text-[#F2F1EE]'
          }`}
        >
          <Rows3 className="h-3 w-3" />
          <span className="hidden lg:inline">{t.density.compact}</span>
        </button>
      </div>
    </div>
  );
}

function MinimalSwitch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex w-full items-center justify-between py-1 text-left text-xs text-[#44403C] transition-colors hover:text-[#1C1917] dark:text-[#D6D3CD] dark:hover:text-[#F2F1EE]"
    >
      <span>{label}</span>
      <span
        className={`relative inline-flex h-4.5 w-8 shrink-0 items-center rounded-full transition-colors ${
          checked
            ? 'bg-[#1C1917] dark:bg-[#F2F1EE]'
            : 'bg-[#D6D3D1] dark:bg-[#333330]'
        }`}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full transition-transform ${
            checked
              ? 'translate-x-4 bg-[#F6F5F1] dark:bg-[#111110]'
              : 'translate-x-0.5 bg-white dark:bg-[#9F9E98]'
          }`}
        />
      </span>
    </button>
  );
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
  showSecondaryFilterRow,
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
  desktopState,
  onSetDesktopAutoStart,
  onSetDesktopAlwaysOnTop,
  onSetDesktopWidgetVisible,
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

  const desktopBridge = getDesktopBridge();
  const inDesktopApp = desktopBridge !== null;
  const isMacDesktop = inDesktopApp && desktopBridge.platform === 'darwin';

  const iconBtn =
    'inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#1C1917]/[0.08] bg-white text-[#57534E] transition-colors hover:border-[#1C1917]/[0.18] hover:text-[#1C1917] dark:border-white/[0.075] dark:bg-[#1A1A18] dark:text-[#9F9E98] dark:hover:border-white/[0.16] dark:hover:text-[#F2F1EE]';

  return (
    <header
      data-desktop-titlebar={
        inDesktopApp ? (isMacDesktop ? 'darwin' : 'overlay') : 'none'
      }
      className={`sticky top-0 z-30 border-b border-[#1C1917]/[0.075] dark:border-white/[0.065] ${
        inDesktopApp
          ? 'bg-[#F6F5F1] dark:bg-[#111110]'
          : 'bg-[#F6F5F1]/92 backdrop-blur-md dark:bg-[#111110]/92'
      }`}
    >
      {/* Primary command row (acts as native integrated titlebar in Desktop App) */}
      <div
        className={`${inDesktopApp ? 'agmb-drag' : ''} ${
          inDesktopApp ? (isMacDesktop ? 'pl-[76px]' : 'pr-[140px]') : ''
        }`}
      >
        <div
          className={`mx-auto flex max-w-[1760px] flex-wrap items-center justify-between gap-2 px-4 sm:px-5 ${
            inDesktopApp ? 'min-h-[46px] py-1.5 md:flex-nowrap' : 'py-2.5'
          }`}
        >
          {/* Left: Bespoke Brand + Live SSE indicator */}
          <div className="flex shrink-0 items-center gap-2.5">
            <div className="flex items-center gap-2">
              <BrandMark className="h-6.5 w-6.5" />
              <div className="flex items-center gap-2">
                <h1 className="whitespace-nowrap text-[14px] font-semibold tracking-[-0.015em] text-[#1C1917] dark:text-[#F2F1EE]">
                  {t.appName}
                </h1>
                {mode === 'demo' && (
                  <span
                    title={t.demoTooltip}
                    className="rounded-md border border-[#1C1917]/[0.1] bg-white px-1.5 py-0.5 text-[10px] font-medium text-[#57534E] dark:border-white/[0.1] dark:bg-[#1D1D1B] dark:text-[#A1A09A]"
                  >
                    {t.demoMode}
                  </span>
                )}
              </div>
            </div>

            <div className="hidden h-4 w-px bg-[#1C1917]/[0.1] sm:block dark:bg-white/[0.09]" />

            {/* SSE Live pill + Manual Refresh */}
            <div className="agmb-no-drag hidden items-center gap-1.5 sm:flex">
              <div
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#1C1917]/[0.075] bg-white px-2 py-1 text-[11px] font-medium text-[#57534E] dark:border-white/[0.075] dark:bg-[#181816] dark:text-[#9F9E98]"
                title={`${t.lastSynced} ${formatClockTime(lastSyncedAt)}`}
              >
                {sseStatus === 'connected' ? (
                  <LivePulseDot />
                ) : (
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      sseStatus === 'connecting' ? 'animate-pulse bg-[#D97706]' : 'bg-[#DC2626]'
                    }`}
                  />
                )}
                <span className="whitespace-nowrap text-[#44403C] dark:text-[#D6D3CD]">
                  {sseStatus === 'connected'
                    ? t.liveConnected
                    : sseStatus === 'connecting'
                      ? t.liveConnecting
                      : t.liveDisconnected}
                </span>
                <span
                  className={`tabular-nums text-[10px] text-[#969088] dark:text-[#666560] ${
                    inDesktopApp ? 'hidden xl:inline' : ''
                  }`}
                >
                  {formatClockTime(lastSyncedAt)}
                </span>
              </div>

              <button
                type="button"
                onClick={onRefresh}
                disabled={isRefreshing}
                title={t.refresh}
                className={`${iconBtn} disabled:opacity-45`}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Center: Command Palette Trigger Bar */}
          <div className="agmb-no-drag relative order-3 w-full md:order-2 md:min-w-[160px] md:max-w-md md:flex-1">
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
                  ? 'border-[#1C1917]/30 bg-white text-[#1C1917] dark:border-[#F2F1EE]/30 dark:bg-[#1D1D1B] dark:text-[#F2F1EE]'
                  : 'border-[#1C1917]/[0.09] bg-white/90 text-[#8C867E] hover:border-[#1C1917]/[0.18] hover:bg-white dark:border-white/[0.08] dark:bg-[#181816] dark:text-[#6E6D68] dark:hover:border-white/[0.16] dark:hover:bg-[#1D1D1B]'
              }`}
            >
              <Search className="h-3.5 w-3.5 shrink-0 text-[#969088] transition-colors group-hover:text-[#57534E] dark:group-hover:text-[#A1A09A]" />
              <span className="min-w-0 flex-1 truncate">
                {searchQuery.trim() ? (
                  <span className="font-medium text-[#1C1917] dark:text-[#F2F1EE]">
                    {searchQuery}
                  </span>
                ) : (
                  t.searchTriggerPlaceholder
                )}
              </span>

              {searchQuery.trim() ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  {isSearchingServer ? (
                    <span className="h-3 w-3 animate-spin rounded-full border border-[#D6D3D1] border-t-[#1C1917] dark:border-[#333330] dark:border-t-[#F2F1EE]" />
                  ) : serverSearchCount !== null ? (
                    <span className="tabular-nums rounded bg-[#EFECE6] px-1.5 py-0.5 text-[10px] font-medium text-[#44403C] dark:bg-[#262623] dark:text-[#D6D3CD]">
                      {t.searchServerMatches(serverSearchCount)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSearchChange('');
                    }}
                    className="rounded p-0.5 text-[#8C867E] hover:bg-[#1C1917]/[0.07] hover:text-[#1C1917] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <kbd className="hidden shrink-0 rounded border border-[#1C1917]/[0.09] bg-[#F6F5F1] px-1.5 py-0.5 text-[10px] text-[#8C867E] sm:inline-block dark:border-white/[0.09] dark:bg-[#222220] dark:text-[#787771]">
                  {t.searchShortcutHint}
                </kbd>
              )}
            </div>
          </div>

          {/* Right: View Switcher + Utility Controls */}
          <div className="agmb-no-drag order-2 flex shrink-0 items-center gap-1.5 md:order-3">
            {/* Monochrome View Switcher */}
            <nav
              aria-label="View switcher"
              className="inline-flex items-center rounded-lg border border-[#1C1917]/[0.08] bg-[#EFECE6]/90 p-0.5 dark:border-white/[0.07] dark:bg-[#171715]"
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
                        ? 'bg-[#1C1917] text-[#F6F5F1] shadow-xs dark:bg-[#F2F1EE] dark:text-[#111110]'
                        : 'text-[#57534E] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:text-[#F2F1EE]'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="mx-0.5 hidden h-4 w-px bg-[#1C1917]/[0.1] sm:block dark:bg-white/[0.09]" />

            {/* Desktop Notification toggle */}
            <button
              type="button"
              onClick={onToggleNotifications}
              title={
                notificationPermission === 'denied'
                  ? t.notifications.denied
                  : `${notificationsEnabled ? t.notifications.enabled : t.notifications.enable} — ${t.notifications.tooltip}`
              }
              className={`relative inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
                notificationsEnabled
                  ? 'border-[#1C1917] bg-[#1C1917] text-[#F6F5F1] dark:border-[#F2F1EE] dark:bg-[#F2F1EE] dark:text-[#111110]'
                  : 'border-[#1C1917]/[0.08] bg-white text-[#57534E] hover:border-[#1C1917]/[0.18] hover:text-[#1C1917] dark:border-white/[0.075] dark:bg-[#1A1A18] dark:text-[#9F9E98] dark:hover:border-white/[0.16] dark:hover:text-[#F2F1EE]'
              }`}
            >
              {notificationPermission === 'denied' ? (
                <BellOff className="h-3.5 w-3.5" />
              ) : notificationsEnabled ? (
                <BellRing className="h-3.5 w-3.5" />
              ) : (
                <Bell className="h-3.5 w-3.5" />
              )}
            </button>

            {/* Sound Chime toggle */}
            <button
              type="button"
              onClick={onToggleSound}
              title={soundEnabled ? t.notifications.soundOn : t.notifications.soundOff}
              className={iconBtn}
            >
              {soundEnabled ? (
                <Volume2 className="h-3.5 w-3.5" />
              ) : (
                <VolumeX className="h-3.5 w-3.5 opacity-55" />
              )}
            </button>

            {/* Settings Popover */}
            <div className="relative" ref={popoverRef}>
              <button
                type="button"
                onClick={() => setSettingsOpen((v) => !v)}
                title={t.settings.title}
                className={
                  settingsOpen
                    ? 'inline-flex h-7 w-7 items-center justify-center rounded-lg border border-[#1C1917] bg-[#1C1917] text-[#F6F5F1] dark:border-[#F2F1EE] dark:bg-[#F2F1EE] dark:text-[#111110]'
                    : iconBtn
                }
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>

              {settingsOpen && (
                <div className="agmb-modal-enter absolute top-9 right-0 z-50 w-80 rounded-2xl border border-[#1C1917]/[0.1] bg-white p-4 shadow-[0_18px_44px_-10px_rgba(28,25,23,0.2)] dark:border-white/[0.1] dark:bg-[#1B1B19] dark:shadow-[0_24px_56px_-10px_rgba(0,0,0,0.72)]">
                  <div className="flex items-center justify-between border-b border-[#1C1917]/[0.07] pb-2.5 dark:border-white/[0.07]">
                    <span className="text-xs font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
                      {t.settings.title}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSettingsOpen(false)}
                      className="rounded p-0.5 text-[#8C867E] hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>

                  <div className="mt-3 space-y-3.5">
                    {/* Desktop App Section (visible when running inside Electron) */}
                    {desktopState && (
                      <div className="space-y-1.5 rounded-xl border border-[#1C1917]/[0.07] bg-[#F6F5F1]/80 p-3 dark:border-white/[0.06] dark:bg-[#141413]">
                        <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold text-[#44403C] dark:text-[#D6D3CD]">
                          <Monitor className="h-3.5 w-3.5" />
                          <span>{t.settings.desktopSection}</span>
                        </div>
                        {onSetDesktopAutoStart && (
                          <MinimalSwitch
                            checked={desktopState.autoStart}
                            onChange={(v) => void onSetDesktopAutoStart(v)}
                            label={t.settings.desktopAutoStart}
                          />
                        )}
                        {onSetDesktopAlwaysOnTop && (
                          <MinimalSwitch
                            checked={desktopState.alwaysOnTop}
                            onChange={(v) => void onSetDesktopAlwaysOnTop(v)}
                            label={t.settings.desktopAlwaysOnTop}
                          />
                        )}
                        {onSetDesktopWidgetVisible && (
                          <MinimalSwitch
                            checked={desktopState.widgetVisible}
                            onChange={(v) => void onSetDesktopWidgetVisible(v)}
                            label={t.settings.desktopShowWidget}
                          />
                        )}
                      </div>
                    )}

                    <div>
                      <label className="block text-[11px] font-medium text-[#44403C] dark:text-[#D6D3CD]">
                        {t.settings.staleAfterHours}
                      </label>
                      <p className="mt-0.5 text-[11px] leading-relaxed text-[#78716C] dark:text-[#8C8B85]">
                        {t.settings.staleAfterHint}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          max={8760}
                          value={staleInput}
                          onChange={(e) => setStaleInput(e.target.value)}
                          className="tabular-nums h-8 w-24 rounded-lg border border-[#1C1917]/[0.1] bg-[#F6F5F1] px-2.5 text-xs text-[#1C1917] focus:border-[#1C1917]/40 focus:bg-white focus:outline-none dark:border-white/[0.09] dark:bg-[#141413] dark:text-[#F2F1EE]"
                        />
                        <span className="text-xs text-[#78716C] dark:text-[#8C8B85]">
                          {t.settings.hoursUnit}
                        </span>
                        <div className="ml-auto flex gap-1">
                          {[24, 72, 168].map((hrs) => (
                            <button
                              key={hrs}
                              type="button"
                              onClick={() => setStaleInput(String(hrs))}
                              className={`tabular-nums rounded-md px-1.5 py-0.5 text-[10px] font-medium transition-colors ${
                                Number(staleInput) === hrs
                                  ? 'bg-[#1C1917] text-[#F6F5F1] dark:bg-[#F2F1EE] dark:text-[#111110]'
                                  : 'bg-[#EFECE6] text-[#57534E] hover:bg-[#E5E1D8] dark:bg-[#252522] dark:text-[#A1A09A] dark:hover:bg-[#2E2E2B]'
                              }`}
                            >
                              {hrs}h
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[11px] font-medium text-[#44403C] dark:text-[#D6D3CD]">
                        {t.settings.pollIntervalMs}
                      </label>
                      <input
                        type="number"
                        min={1000}
                        max={60000}
                        step={500}
                        value={pollInput}
                        onChange={(e) => setPollInput(e.target.value)}
                        className="tabular-nums mt-1.5 h-8 w-full rounded-lg border border-[#1C1917]/[0.1] bg-[#F6F5F1] px-2.5 text-xs text-[#1C1917] focus:border-[#1C1917]/40 focus:bg-white focus:outline-none dark:border-white/[0.09] dark:bg-[#141413] dark:text-[#F2F1EE]"
                      />
                    </div>

                    <button
                      type="button"
                      disabled={savingSettings}
                      onClick={handleSaveSettings}
                      className="inline-flex h-8 w-full items-center justify-center gap-1.5 rounded-lg bg-[#1C1917] px-3 text-xs font-medium text-[#F6F5F1] transition-opacity hover:opacity-90 disabled:opacity-45 dark:bg-[#F2F1EE] dark:text-[#111110]"
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
                      <div className="space-y-1 border-t border-[#1C1917]/[0.07] pt-2.5 text-[11px] dark:border-white/[0.07]">
                        <div className="flex items-center justify-between text-[#78716C] dark:text-[#8C8B85]">
                          <span>{t.settings.mode}</span>
                          <span className="text-[#1C1917] dark:text-[#E7E5E0]">
                            {health.mode} · v{health.version}
                          </span>
                        </div>
                        <div className="text-[#78716C] dark:text-[#8C8B85]">
                          <span>{t.settings.dataDir}:</span>
                          <div
                            className="mt-0.5 truncate text-[10px] text-[#57534E] dark:text-[#9F9E98]"
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
              className={iconBtn}
            >
              <HelpCircle className="h-3.5 w-3.5" />
            </button>

            {/* Theme toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              title={theme === 'dark' ? t.theme.switchToLight : t.theme.switchToDark}
              className={iconBtn}
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
              className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#1C1917]/[0.08] bg-white px-2 text-[11px] font-medium text-[#44403C] transition-colors hover:border-[#1C1917]/[0.18] hover:text-[#1C1917] dark:border-white/[0.075] dark:bg-[#1A1A18] dark:text-[#D6D3CD] dark:hover:border-white/[0.16] dark:hover:text-[#F2F1EE]"
            >
              <Languages className="h-3.5 w-3.5 text-[#8C867E]" />
              <span>{locale === 'zh' ? '中' : 'EN'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Decluttered Filter & Toolbar Row (auto-collapsed when <=1 workspace & 0 tags) */}
      {showSecondaryFilterRow && (
        <div
          data-testid="topbar-filter-row"
          className="border-t border-[#1C1917]/[0.055] dark:border-white/[0.05]"
        >
          <div className="mx-auto flex max-w-[1760px] flex-wrap items-center justify-between gap-2 px-4 py-1.5 sm:px-5">
            {/* Left: Workspace + Top 6 Tags + Overflow Popover + Reset */}
            <div className="flex min-w-0 flex-wrap items-center gap-1.5">
              {/* Workspace selector (only when 2+ workspaces or filter active) */}
              {(workspaces.length > 1 || Boolean(selectedWorkspace)) && (
                <div className="relative flex shrink-0 items-center">
                  <Folder className="pointer-events-none absolute left-2 h-3 w-3 text-[#8C867E]" />
                  <select
                    value={selectedWorkspace}
                    onChange={(e) => onSelectWorkspace(e.target.value)}
                    aria-label={t.allWorkspaces}
                    className="h-6.5 cursor-pointer appearance-none rounded-lg border border-[#1C1917]/[0.08] bg-white pr-6 pl-6 text-[11px] font-medium text-[#44403C] transition-colors hover:border-[#1C1917]/[0.18] focus:border-[#1C1917]/40 focus:outline-none dark:border-white/[0.075] dark:bg-[#181816] dark:text-[#D6D3CD] dark:hover:border-white/[0.16]"
                  >
                    <option value="">{t.allWorkspaces}</option>
                    {workspaces.map((ws) => (
                      <option key={ws.path || ws.name} value={ws.name}>
                        {ws.name || t.noWorkspace} ({ws.count})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-1.5 h-3 w-3 text-[#8C867E]" />
                </div>
              )}

              {allTags.length > 0 && (
                <>
                  {(workspaces.length > 1 || Boolean(selectedWorkspace)) && (
                    <div className="h-3.5 w-px shrink-0 bg-[#1C1917]/[0.09] dark:bg-white/[0.08]" />
                  )}
                  <div className="flex flex-wrap items-center gap-1">
                    <Tag className="mr-0.5 h-3 w-3 shrink-0 text-[#969088]" />
                    <button
                      type="button"
                      onClick={() => onSelectTag('')}
                      className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        selectedTag === ''
                          ? 'bg-[#1C1917] text-[#F6F5F1] dark:bg-[#F2F1EE] dark:text-[#111110]'
                          : 'text-[#57534E] hover:bg-[#1C1917]/[0.05] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:bg-white/[0.06] dark:hover:text-[#F2F1EE]'
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
                          className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            active
                              ? 'bg-[#1C1917] text-[#F6F5F1] dark:bg-[#F2F1EE] dark:text-[#111110]'
                              : 'text-[#57534E] hover:bg-[#1C1917]/[0.05] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:bg-white/[0.06] dark:hover:text-[#F2F1EE]'
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
                          className={`inline-flex shrink-0 items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors ${
                            moreTagsOpen
                              ? 'border-[#1C1917] bg-[#1C1917] text-[#F6F5F1] dark:border-[#F2F1EE] dark:bg-[#F2F1EE] dark:text-[#111110]'
                              : 'border-[#1C1917]/[0.1] bg-white text-[#57534E] hover:border-[#1C1917]/[0.2] hover:text-[#1C1917] dark:border-white/[0.09] dark:bg-[#181816] dark:text-[#9F9E98] dark:hover:border-white/[0.18] dark:hover:text-[#F2F1EE]'
                          }`}
                        >
                          <span>{t.moreTags(overflowTags.length)}</span>
                          <ChevronDown className="h-3 w-3" />
                        </button>

                        {moreTagsOpen && (
                          <div className="agmb-modal-enter absolute top-8 left-0 z-50 w-56 overflow-hidden rounded-xl border border-[#1C1917]/[0.1] bg-white shadow-xl dark:border-white/[0.1] dark:bg-[#1B1B19]">
                            <div className="border-b border-[#1C1917]/[0.07] p-2 dark:border-white/[0.07]">
                              <div className="relative">
                                <Search className="pointer-events-none absolute top-1/2 left-2 h-3 w-3 -translate-y-1/2 text-[#969088]" />
                                <input
                                  ref={tagSearchInputRef}
                                  type="text"
                                  value={tagSearch}
                                  onChange={(e) => setTagSearch(e.target.value)}
                                  placeholder={t.searchTagsPlaceholder}
                                  className="h-7 w-full rounded-md border border-[#1C1917]/[0.1] bg-[#F6F5F1] pr-2 pl-6.5 text-[11px] text-[#1C1917] placeholder:text-[#969088] focus:border-[#1C1917]/40 focus:bg-white focus:outline-none dark:border-white/[0.09] dark:bg-[#141413] dark:text-[#F2F1EE]"
                                />
                              </div>
                            </div>
                            <div className="max-h-52 overflow-y-auto p-1.5">
                              {filteredOverflowTags.length === 0 ? (
                                <div className="py-4 text-center text-[11px] text-[#969088]">
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
                                          ? 'bg-[#1C1917] font-medium text-[#F6F5F1] dark:bg-[#F2F1EE] dark:text-[#111110]'
                                          : 'text-[#44403C] hover:bg-[#1C1917]/[0.05] dark:text-[#D6D3CD] dark:hover:bg-white/[0.06]'
                                      }`}
                                    >
                                      <span className="truncate">#{tag}</span>
                                      <span className="tabular-nums text-[10px] opacity-60">
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
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#1C1917]/[0.14] bg-white px-2 py-0.5 text-[11px] font-medium text-[#1C1917] transition-colors hover:bg-[#EFECE6] dark:border-white/[0.14] dark:bg-[#222220] dark:text-[#F2F1EE] dark:hover:bg-[#2B2B28]"
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
              <KanbanViewControls
                kanbanSort={kanbanSort}
                onKanbanSortChange={onKanbanSortChange}
                density={density}
                onDensityChange={onDensityChange}
                t={t}
                testId="topbar-kanban-controls"
              />
            )}
          </div>
        </div>
      )}
    </header>
  );
}
