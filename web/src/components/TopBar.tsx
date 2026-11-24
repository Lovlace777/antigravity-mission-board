import { useEffect, useRef, useState } from 'react';
import type { BoardSettings, HealthResponse, WorkspaceSummary } from '@shared/types';
import {
  Bell,
  BellOff,
  BellRing,
  Check,
  Folder,
  Kanban,
  Languages,
  Moon,
  Network,
  RefreshCw,
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
import type { RadarFilter } from './RadarStrip';

export type ViewMode = 'kanban' | 'matrix' | 'swarm';
export type ThemeMode = 'light' | 'dark';

interface TopBarProps {
  mode: 'live' | 'demo';
  health: HealthResponse | null;
  sseStatus: SseStatus;
  lastSyncedAt: Date | null;
  isRefreshing: boolean;
  onRefresh: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  serverSearchCount: number | null;
  isSearchingServer: boolean;
  workspaces: WorkspaceSummary[];
  selectedWorkspace: string;
  onSelectWorkspace: (ws: string) => void;
  allTags: string[];
  selectedTag: string;
  onSelectTag: (tag: string) => void;
  radarFilter: RadarFilter;
  onClearAllFilters: () => void;
  hasActiveFilters: boolean;
  viewMode: ViewMode;
  onViewModeChange: (v: ViewMode) => void;
  notificationsEnabled: boolean;
  soundEnabled: boolean;
  notificationPermission: NotificationPermission | 'unsupported';
  onToggleNotifications: () => void;
  onToggleSound: () => void;
  settings: BoardSettings;
  onSaveSettings: (patch: Partial<BoardSettings>) => Promise<void>;
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
  searchInputRef,
  serverSearchCount,
  isSearchingServer,
  workspaces,
  selectedWorkspace,
  onSelectWorkspace,
  allTags,
  selectedTag,
  onSelectTag,
  radarFilter,
  onClearAllFilters,
  hasActiveFilters,
  viewMode,
  onViewModeChange,
  notificationsEnabled,
  soundEnabled,
  notificationPermission,
  onToggleNotifications,
  onToggleSound,
  settings,
  onSaveSettings,
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
    <header className="sticky top-0 z-30 border-b border-zinc-200/80 bg-white/88 backdrop-blur-md dark:border-[#222733] dark:bg-[#0B0D11]/90">
      <div className="mx-auto max-w-[1760px] px-4 sm:px-5">
        {/* Primary command row */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 py-2.5">
          {/* Left: Brand + Live SSE indicator */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-900 text-white shadow-xs dark:bg-zinc-100 dark:text-zinc-950">
                <svg
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.1"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M5 18L12 5l7 13" />
                  <path d="M8.5 14h7" />
                </svg>
              </div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                  {t.appName}
                </h1>
                {mode === 'demo' && (
                  <span
                    title={t.demoTooltip}
                    className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold tracking-wide text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/12 dark:text-sky-300"
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
                className="inline-flex items-center gap-1.5 rounded-md border border-zinc-200/80 bg-zinc-50/80 px-2 py-1 text-[11px] font-medium text-zinc-600 dark:border-[#222733] dark:bg-[#13161D] dark:text-zinc-400"
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
                className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200/80 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-900 disabled:opacity-50 dark:border-[#222733] dark:bg-[#13161D] dark:text-zinc-400 dark:hover:border-[#323A4B] dark:hover:text-zinc-100"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          </div>

          {/* Center: Instant Search */}
          <div className="relative order-3 w-full md:order-2 md:max-w-md md:flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t.searchPlaceholder}
              className="h-8 w-full rounded-md border border-zinc-200/90 bg-zinc-50/70 pr-20 pl-8 text-xs text-zinc-900 placeholder:text-zinc-400 transition-colors focus:border-sky-500/70 focus:bg-white focus:ring-2 focus:ring-sky-500/15 focus:outline-none dark:border-[#252B38] dark:bg-[#13161D] dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-sky-400/70 dark:focus:bg-[#161A23]"
            />
            <div className="absolute top-1/2 right-2 flex -translate-y-1/2 items-center gap-1.5">
              {searchQuery.trim() ? (
                <>
                  {isSearchingServer ? (
                    <span className="h-3 w-3 animate-spin rounded-full border border-zinc-300 border-t-sky-500 dark:border-zinc-700 dark:border-t-sky-400" />
                  ) : serverSearchCount !== null ? (
                    <span className="tabular-nums rounded bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                      {t.searchServerMatches(serverSearchCount)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => onSearchChange('')}
                    className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-zinc-700/60 dark:hover:text-zinc-200"
                    aria-label="Clear search"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <kbd className="hidden rounded border border-zinc-200 bg-white px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 sm:inline-block dark:border-[#2A3040] dark:bg-[#181C25] dark:text-zinc-500">
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
              className="inline-flex items-center rounded-md border border-zinc-200/90 bg-zinc-100/70 p-0.5 dark:border-[#222733] dark:bg-[#13161D]"
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
                    className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1 text-xs font-medium transition-all ${
                      active
                        ? 'bg-white text-zinc-900 shadow-xs dark:bg-[#1F2533] dark:text-zinc-50'
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
                  : 'border-zinc-200/80 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-900 dark:border-[#222733] dark:bg-[#13161D] dark:text-zinc-400 dark:hover:border-[#323A4B] dark:hover:text-zinc-100'
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
                  ? 'border-zinc-200/80 bg-white text-zinc-700 hover:border-zinc-300 dark:border-[#222733] dark:bg-[#13161D] dark:text-zinc-300 dark:hover:border-[#323A4B]'
                  : 'border-zinc-200/80 bg-white text-zinc-400 hover:text-zinc-600 dark:border-[#222733] dark:bg-[#13161D] dark:text-zinc-500 dark:hover:text-zinc-300'
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
                    : 'border-zinc-200/80 bg-white text-zinc-500 hover:border-zinc-300 hover:text-zinc-900 dark:border-[#222733] dark:bg-[#13161D] dark:text-zinc-400 dark:hover:border-[#323A4B] dark:hover:text-zinc-100'
                }`}
              >
                <SlidersHorizontal className="h-3.5 w-3.5" />
              </button>

              {settingsOpen && (
                <div className="absolute top-9 right-0 z-50 w-80 rounded-xl border border-zinc-200 bg-white p-4 shadow-xl dark:border-[#2A3040] dark:bg-[#161A23]">
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
                          className="tabular-nums h-8 w-24 rounded-md border border-zinc-200 bg-zinc-50 px-2.5 text-xs text-zinc-900 focus:border-sky-500 focus:bg-white focus:outline-none dark:border-[#2A3040] dark:bg-[#0F1219] dark:text-zinc-100"
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
                        className="tabular-nums mt-1.5 h-8 w-full rounded-md border border-zinc-200 bg-zinc-50 px-2.5 text-xs text-zinc-900 focus:border-sky-500 focus:bg-white focus:outline-none dark:border-[#2A3040] dark:bg-[#0F1219] dark:text-zinc-100"
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

                    {/* Health & Shortcut reference */}
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
                          <div className="mt-0.5 truncate font-mono text-[10px] text-zinc-600 dark:text-zinc-400" title={health.dataDir}>
                            {health.dataDir}
                          </div>
                        </div>
                      </div>
                    )}

                    <div className="space-y-1 border-t border-zinc-100 pt-2.5 text-[11px] text-zinc-500 dark:border-[#222733] dark:text-zinc-400">
                      <div className="font-medium text-zinc-700 dark:text-zinc-300">
                        {t.settings.shortcutsTitle}
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t.settings.shortcutSearch}</span>
                        <kbd className="rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-[10px] dark:border-zinc-700">
                          Ctrl+K / /
                        </kbd>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t.settings.shortcutViews}</span>
                        <kbd className="rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-[10px] dark:border-zinc-700">
                          1 · 2 · 3
                        </kbd>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>{t.settings.shortcutClose}</span>
                        <kbd className="rounded border border-zinc-200 px-1.5 py-0.5 font-mono text-[10px] dark:border-zinc-700">
                          Esc
                        </kbd>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Theme toggle */}
            <button
              type="button"
              onClick={onToggleTheme}
              title={theme === 'dark' ? t.theme.switchToLight : t.theme.switchToDark}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-200/80 bg-white text-zinc-500 transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-[#222733] dark:bg-[#13161D] dark:text-zinc-400 dark:hover:border-[#323A4B] dark:hover:text-zinc-100"
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
              className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200/80 bg-white px-2 text-[11px] font-medium text-zinc-600 transition-colors hover:border-zinc-300 hover:text-zinc-900 dark:border-[#222733] dark:bg-[#13161D] dark:text-zinc-300 dark:hover:border-[#323A4B] dark:hover:text-zinc-100"
            >
              <Languages className="h-3.5 w-3.5 text-zinc-400" />
              <span>{locale === 'zh' ? '中' : 'EN'}</span>
            </button>
          </div>
        </div>

        {/* Secondary slim filter strip: Workspace selector + quick Tag pills */}
        <div className="flex items-center gap-2 overflow-x-auto border-t border-zinc-100 py-1.5 dark:border-[#1B202B]">
          {/* Workspace selector */}
          <div className="relative flex shrink-0 items-center">
            <Folder className="pointer-events-none absolute left-2 h-3 w-3 text-zinc-400" />
            <select
              value={selectedWorkspace}
              onChange={(e) => onSelectWorkspace(e.target.value)}
              aria-label={t.allWorkspaces}
              className="h-6.5 cursor-pointer appearance-none rounded-md border border-zinc-200/80 bg-white pr-6 pl-6 text-[11px] font-medium text-zinc-700 transition-colors hover:border-zinc-300 focus:border-sky-500 focus:outline-none dark:border-[#222733] dark:bg-[#13161D] dark:text-zinc-300 dark:hover:border-[#323A4B]"
            >
              <option value="">{t.allWorkspaces}</option>
              {workspaces.map((ws) => (
                <option key={ws.path || ws.name} value={ws.name}>
                  {ws.name || t.noWorkspace} ({ws.count})
                </option>
              ))}
            </select>
            <span className="pointer-events-none absolute right-2 text-[9px] text-zinc-400">
              ▾
            </span>
          </div>

          {allTags.length > 0 && (
            <>
              <div className="h-3.5 w-px shrink-0 bg-zinc-200 dark:bg-[#222733]" />
              <div className="flex items-center gap-1">
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
                {allTags.map((tag) => {
                  const active = selectedTag === tag;
                  return (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => onSelectTag(active ? '' : tag)}
                      className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
                        active
                          ? 'bg-sky-600 text-white dark:bg-sky-500 dark:text-zinc-950'
                          : 'border border-zinc-200/80 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-[#242A37] dark:bg-[#13161D] dark:text-zinc-300 dark:hover:border-[#343C4F]'
                      }`}
                    >
                      #{tag}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {hasActiveFilters && (
            <button
              type="button"
              onClick={onClearAllFilters}
              className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium text-sky-600 transition-colors hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-500/10"
            >
              <X className="h-3 w-3" />
              <span>
                {t.clearFilters}
                {radarFilter ? ` (${t.radar[radarFilter === 'agents' ? 'swarmsAndAgents' : radarFilter]})` : ''}
              </span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
