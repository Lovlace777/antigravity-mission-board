import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConversationCard, SearchResult } from '@shared/types';
import {
  Bell,
  CheckCheck,
  CornerDownLeft,
  Filter,
  Folder,
  Kanban,
  Keyboard,
  Languages,
  Loader2,
  Moon,
  Network,
  RefreshCw,
  Rows3,
  Search,
  Sun,
  Table2,
  X,
} from 'lucide-react';
import { searchConversations } from '../api';
import type { Dictionary, Locale } from '../i18n';
import { formatRelativeTime } from '../utils';
import { LivePulseDot, PriorityBadge, laneAccentDot } from './badges';
import type { CardDensity, ThemeMode, ViewMode } from './TopBar';

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  conversations: ConversationCard[];
  attentionCount: number;
  activeSearchQuery: string;
  onApplyBoardSearch: (query: string) => void;
  onSelectConversation: (id: string) => void;
  viewMode: ViewMode;
  onViewModeChange: (view: ViewMode) => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
  locale: Locale;
  onToggleLocale: () => void;
  density: CardDensity;
  onToggleDensity: () => void;
  notificationsEnabled: boolean;
  onToggleNotifications: () => void;
  onMarkAllAttentionReviewed: () => void;
  onRefresh: () => void;
  onOpenShortcuts: () => void;
  t: Dictionary;
}

interface PaletteEntry {
  id: string;
  section: 'filter' | 'conversations' | 'commands';
  kind: 'filter' | 'conversation' | 'command';
  label: string;
  subtitle?: string;
  shortcut?: string;
  card?: ConversationCard;
  matchedIn?: string[];
  Icon?: typeof Kanban;
  run: () => void;
}

export function CommandPalette({
  open,
  onClose,
  conversations,
  attentionCount,
  activeSearchQuery,
  onApplyBoardSearch,
  onSelectConversation,
  viewMode,
  onViewModeChange,
  theme,
  onToggleTheme,
  locale,
  onToggleLocale,
  density,
  onToggleDensity,
  notificationsEnabled,
  onToggleNotifications,
  onMarkAllAttentionReviewed,
  onRefresh,
  onOpenShortcuts,
  t,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [serverResults, setServerResults] = useState<SearchResult[]>([]);
  const [searchingServer, setSearchingServer] = useState(false);

  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery(activeSearchQuery);
      setActiveIndex(0);
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    } else {
      setServerResults([]);
      setSearchingServer(false);
    }
  }, [open, activeSearchQuery]);

  // Debounced server FTS5 search while palette is open
  useEffect(() => {
    if (!open) return;
    const trimmed = query.trim();
    if (!trimmed) {
      setServerResults([]);
      setSearchingServer(false);
      return;
    }

    const controller = new AbortController();
    setSearchingServer(true);
    const timer = setTimeout(() => {
      searchConversations(trimmed, controller.signal)
        .then((res) => {
          if (!controller.signal.aborted) {
            setServerResults(res.results);
          }
        })
        .catch(() => {
          // ignore aborts / transient failures; local matching remains instant
        })
        .finally(() => {
          if (!controller.signal.aborted) {
            setSearchingServer(false);
          }
        });
    }, 180);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [open, query]);

  const entries = useMemo<PaletteEntry[]>(() => {
    const q = query.trim().toLowerCase();
    const result: PaletteEntry[] = [];

    if (!q && activeSearchQuery.trim()) {
      result.push({
        id: 'action:clear-board-filter',
        section: 'filter',
        kind: 'filter',
        label: t.commandPalette.clearBoardSearch,
        Icon: X,
        run: () => {
          onApplyBoardSearch('');
          onClose();
        },
      });
    }

    // Conversations (local + FTS merged)
    const serverById = new Map<string, SearchResult>();
    for (const sr of serverResults) serverById.set(sr.conversationId, sr);

    const matchedCards: Array<{ card: ConversationCard; matchedIn?: string[]; score: number }> = [];
    for (const card of conversations) {
      if (!q) {
        // Show top urgent/running/recent conversations when empty
        const score =
          (card.isRunning ? 300 : 0) +
          (card.lane === 'attention' ? 200 : 0) +
          (card.overlay.pinned ? 100 : 0);
        matchedCards.push({ card, score });
      } else {
        const titleHit = card.title.toLowerCase().includes(q);
        const wsHit = card.workspace.toLowerCase().includes(q);
        const tagHit = card.overlay.tags.some((tg) => tg.toLowerCase().includes(q));
        const previewHit =
          card.preview.toLowerCase().includes(q) ||
          (card.currentFocus?.toLowerCase().includes(q) ?? false) ||
          card.overlay.notes.toLowerCase().includes(q) ||
          card.id.toLowerCase().includes(q);
        const fts = serverById.get(card.id);
        if (titleHit || wsHit || tagHit || previewHit || fts) {
          const score =
            (titleHit ? 100 : 0) +
            (tagHit ? 60 : 0) +
            (wsHit ? 50 : 0) +
            (previewHit ? 30 : 0) +
            (fts ? 20 : 0);
          matchedCards.push({
            card,
            matchedIn: fts?.matchedIn.map((f) => t.searchMatchFields[f] ?? f),
            score,
          });
        }
      }
    }

    matchedCards.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return Date.parse(b.card.lastModifiedAt) - Date.parse(a.card.lastModifiedAt);
    });

    const maxConvs = q ? 7 : 4;
    for (const item of matchedCards.slice(0, maxConvs)) {
      result.push({
        id: `conv:${item.card.id}`,
        section: 'conversations',
        kind: 'conversation',
        label: item.card.title || t.card.untitled,
        subtitle: item.card.currentFocus || item.card.preview,
        card: item.card,
        matchedIn: item.matchedIn,
        run: () => {
          onSelectConversation(item.card.id);
          onClose();
        },
      });
    }

    // Quick Commands
    const allCommands: Array<PaletteEntry & { keywords: string }> = [
      {
        id: 'cmd:kanban',
        section: 'commands',
        kind: 'command',
        label: t.commandPalette.cmds.kanban,
        shortcut: '1',
        Icon: Kanban,
        keywords: 'kanban board view 看板 视图 1',
        run: () => {
          onViewModeChange('kanban');
          onClose();
        },
      },
      {
        id: 'cmd:matrix',
        section: 'commands',
        kind: 'command',
        label: t.commandPalette.cmds.matrix,
        shortcut: '2',
        Icon: Table2,
        keywords: 'matrix table list view 列表 矩阵 2',
        run: () => {
          onViewModeChange('matrix');
          onClose();
        },
      },
      {
        id: 'cmd:swarm',
        section: 'commands',
        kind: 'command',
        label: t.commandPalette.cmds.swarm,
        shortcut: '3',
        Icon: Network,
        keywords: 'swarm agents cluster view 集群 多代理 3',
        run: () => {
          onViewModeChange('swarm');
          onClose();
        },
      },
      {
        id: 'cmd:theme',
        section: 'commands',
        kind: 'command',
        label: t.commandPalette.cmds.toggleTheme,
        subtitle: theme === 'dark' ? t.theme.switchToLight : t.theme.switchToDark,
        Icon: theme === 'dark' ? Sun : Moon,
        keywords: 'theme dark light mode 主题 深色 浅色',
        run: () => {
          onToggleTheme();
          onClose();
        },
      },
      {
        id: 'cmd:locale',
        section: 'commands',
        kind: 'command',
        label: t.commandPalette.cmds.toggleLocale,
        subtitle: locale === 'zh' ? 'English' : '简体中文',
        Icon: Languages,
        keywords: 'language locale chinese english 语言 中文 英文',
        run: () => {
          onToggleLocale();
          onClose();
        },
      },
      {
        id: 'cmd:density',
        section: 'commands',
        kind: 'command',
        label: t.commandPalette.cmds.toggleDensity,
        subtitle:
          density === 'comfortable'
            ? t.density.compact
            : t.density.comfortable,
        Icon: Rows3,
        keywords: 'density compact comfortable cards 密度 紧凑 舒适',
        run: () => {
          onToggleDensity();
          onClose();
        },
      },
      {
        id: 'cmd:notifications',
        section: 'commands',
        kind: 'command',
        label: t.commandPalette.cmds.toggleNotifications,
        subtitle: notificationsEnabled
          ? t.notifications.enabled
          : t.notifications.enable,
        Icon: Bell,
        keywords: 'notifications alerts desktop bell 通知 提醒',
        run: () => {
          onToggleNotifications();
          onClose();
        },
      },
      ...(attentionCount > 0
        ? [
            {
              id: 'cmd:mark-all-read',
              section: 'commands' as const,
              kind: 'command' as const,
              label: t.commandPalette.cmds.markAllRead(attentionCount),
              Icon: CheckCheck,
              keywords: 'mark all read reviewed attention clear 全部已阅 已阅 清空',
              run: () => {
                onMarkAllAttentionReviewed();
                onClose();
              },
            },
          ]
        : []),
      {
        id: 'cmd:refresh',
        section: 'commands',
        kind: 'command',
        label: t.commandPalette.cmds.refresh,
        shortcut: 'R',
        Icon: RefreshCw,
        keywords: 'refresh reload sync 刷新 同步',
        run: () => {
          onRefresh();
          onClose();
        },
      },
      {
        id: 'cmd:shortcuts',
        section: 'commands',
        kind: 'command',
        label: t.commandPalette.cmds.shortcuts,
        shortcut: '?',
        Icon: Keyboard,
        keywords: 'shortcuts keyboard help keys 快捷键 帮助',
        run: () => {
          onClose();
          onOpenShortcuts();
        },
      },
    ];

    for (const cmd of allCommands) {
      if (
        !q ||
        cmd.label.toLowerCase().includes(q) ||
        cmd.keywords.toLowerCase().includes(q)
      ) {
        // Slightly deprioritize current view
        if (
          !q &&
          ((cmd.id === 'cmd:kanban' && viewMode === 'kanban') ||
            (cmd.id === 'cmd:matrix' && viewMode === 'matrix') ||
            (cmd.id === 'cmd:swarm' && viewMode === 'swarm'))
        ) {
          continue;
        }
        result.push(cmd);
      }
    }

    // Place board-filter action AFTER direct Conversation & Command matches so Enter executes top match
    if (q) {
      result.push({
        id: 'action:filter-board',
        section: 'filter',
        kind: 'filter',
        label: t.commandPalette.filterBoardBy(query.trim()),
        Icon: Filter,
        run: () => {
          onApplyBoardSearch(query.trim());
          onClose();
        },
      });
    }

    return result;
  }, [
    query,
    activeSearchQuery,
    serverResults,
    conversations,
    attentionCount,
    viewMode,
    theme,
    locale,
    density,
    notificationsEnabled,
    t,
    onApplyBoardSearch,
    onClose,
    onSelectConversation,
    onViewModeChange,
    onToggleTheme,
    onToggleLocale,
    onToggleDensity,
    onToggleNotifications,
    onMarkAllAttentionReviewed,
    onRefresh,
    onOpenShortcuts,
  ]);

  // Clamp activeIndex whenever entries change
  useEffect(() => {
    setActiveIndex((prev) => {
      if (entries.length === 0) return 0;
      return Math.min(prev, entries.length - 1);
    });
  }, [entries.length]);

  // Scroll active item smoothly into view
  useEffect(() => {
    if (!open || !listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(
      `[data-palette-index="${activeIndex}"]`,
    );
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

  // Keyboard navigation inside Command Palette
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((prev) =>
          entries.length > 0 ? (prev + 1) % entries.length : 0,
        );
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((prev) =>
          entries.length > 0 ? (prev - 1 + entries.length) % entries.length : 0,
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const chosen = entries[activeIndex];
        if (chosen) {
          chosen.run();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, entries, activeIndex, onClose]);

  if (!open) return null;

  const hasQuery = query.trim().length > 0;
  let lastSection: string | null = null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-[11vh]"
      role="dialog"
      aria-modal="true"
      aria-label="Command Palette"
    >
      {/* Backdrop */}
      <div
        className="agmb-backdrop-enter fixed inset-0 bg-zinc-950/40 backdrop-blur-[3px] dark:bg-black/65"
        onClick={onClose}
      />

      {/* Palette Modal */}
      <div className="agmb-modal-enter relative z-10 flex w-full max-w-[620px] flex-col overflow-hidden rounded-2xl border border-zinc-200/90 bg-white/98 shadow-[0_24px_64px_-12px_rgba(15,23,42,0.28)] backdrop-blur-xl dark:border-[#2A3142] dark:bg-[#12161F]/98 dark:shadow-[0_28px_72px_-12px_rgba(0,0,0,0.75)]">
        {/* Search Input Header */}
        <div className="flex items-center gap-2.5 border-b border-zinc-200/80 px-4 py-3 dark:border-[#202634]">
          <Search className="h-4 w-4 shrink-0 text-zinc-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder={t.commandPalette.placeholder}
            className="w-full bg-transparent text-sm text-zinc-900 placeholder:text-zinc-400 focus:outline-none dark:text-zinc-50 dark:placeholder:text-zinc-500"
          />
          {searchingServer && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-zinc-400">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-500" />
              <span className="hidden sm:inline">{t.commandPalette.ftsSearching}</span>
            </span>
          )}
          {query && (
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setActiveIndex(0);
                inputRef.current?.focus();
              }}
              className="rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-[#1E2432] dark:hover:text-zinc-200"
              aria-label="Clear query"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="hidden shrink-0 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400 sm:inline-block dark:border-[#2A3142] dark:bg-[#191E2A] dark:text-zinc-500">
            ESC
          </kbd>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="max-h-[440px] overflow-y-auto p-2"
        >
          {entries.length === 0 ? (
            <div className="py-12 text-center text-xs text-zinc-400 dark:text-zinc-500">
              {t.commandPalette.empty}
            </div>
          ) : (
            entries.map((entry, idx) => {
              const showSectionHeader =
                entry.section !== 'filter' && entry.section !== lastSection;
              const showFilterDivider =
                entry.id === 'action:filter-board' && idx > 0;
              lastSection = entry.section;
              const isActive = idx === activeIndex;
              const Icon = entry.Icon;

              return (
                <div
                  key={entry.id}
                  className={
                    showFilterDivider
                      ? 'mt-1.5 border-t border-zinc-100 pt-1.5 dark:border-[#1E2432]'
                      : undefined
                  }
                >
                  {showSectionHeader && (
                    <div className="mt-2 mb-1 px-2.5 text-[10.5px] font-semibold tracking-wider text-zinc-400 uppercase first:mt-0.5 dark:text-zinc-500">
                      {entry.section === 'conversations'
                        ? hasQuery
                          ? t.commandPalette.conversationsSection
                          : t.commandPalette.recentSection
                        : t.commandPalette.commandsSection}
                    </div>
                  )}

                  <button
                    type="button"
                    data-palette-index={idx}
                    onMouseEnter={() => setActiveIndex(idx)}
                    onClick={() => entry.run()}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      isActive
                        ? 'bg-sky-50/90 text-zinc-950 dark:bg-sky-500/15 dark:text-zinc-50'
                        : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-[#181D28]'
                    }`}
                  >
                    {/* Leading Icon or Status Dot */}
                    {entry.kind === 'conversation' && entry.card ? (
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                        {entry.card.isRunning ? (
                          <LivePulseDot />
                        ) : (
                          <span
                            className={`h-2 w-2 rounded-full ${laneAccentDot(entry.card.lane)}`}
                          />
                        )}
                      </div>
                    ) : Icon ? (
                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                          isActive
                            ? 'bg-sky-500/15 text-sky-600 dark:bg-sky-400/20 dark:text-sky-300'
                            : 'bg-zinc-100 text-zinc-500 dark:bg-[#1B202C] dark:text-zinc-400'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                    ) : null}

                    {/* Center Text */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium">
                          {entry.label}
                        </span>
                        {entry.card && (
                          <PriorityBadge priority={entry.card.overlay.priority} compact />
                        )}
                        {entry.matchedIn && entry.matchedIn.length > 0 && (
                          <span className="shrink-0 rounded bg-sky-500/12 px-1 py-0.5 text-[9.5px] font-medium text-sky-700 dark:text-sky-300">
                            {entry.matchedIn[0]}
                          </span>
                        )}
                      </div>
                      {entry.subtitle && (
                        <div className="mt-0.5 truncate text-[11px] text-zinc-400 dark:text-zinc-500">
                          {entry.subtitle}
                        </div>
                      )}
                    </div>

                    {/* Trailing Meta / Shortcut */}
                    {entry.kind === 'conversation' && entry.card ? (
                      <div className="flex shrink-0 items-center gap-1.5">
                        {entry.card.workspace && (
                          <span className="hidden max-w-[115px] items-center gap-1 truncate rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 sm:inline-flex dark:bg-[#1C2230] dark:text-zinc-400">
                            <Folder className="h-2.5 w-2.5 shrink-0" />
                            <span className="truncate">{entry.card.workspace}</span>
                          </span>
                        )}
                        <span className="tabular-nums text-[10.5px] text-zinc-400 dark:text-zinc-500">
                          {formatRelativeTime(entry.card.lastModifiedAt, t)}
                        </span>
                        {isActive && (
                          <CornerDownLeft className="h-3.5 w-3.5 text-sky-500" />
                        )}
                      </div>
                    ) : entry.shortcut ? (
                      <kbd className="shrink-0 rounded border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 font-mono text-[10px] text-zinc-500 dark:border-[#2A3142] dark:bg-[#1A202D] dark:text-zinc-400">
                        {entry.shortcut}
                      </kbd>
                    ) : isActive ? (
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-sky-500" />
                    ) : null}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Key Hints */}
        <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/70 px-4 py-2 text-[10.5px] text-zinc-400 dark:border-[#1E2432] dark:bg-[#0E1118] dark:text-zinc-500">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-zinc-200 bg-white px-1 py-0.5 font-mono text-[9.5px] dark:border-[#2A3142] dark:bg-[#171C26]">
                ↑↓
              </kbd>
              <span>{t.commandPalette.navigateHint}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-zinc-200 bg-white px-1 py-0.5 font-mono text-[9.5px] dark:border-[#2A3142] dark:bg-[#171C26]">
                ↵
              </kbd>
              <span>{t.commandPalette.selectHint}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-zinc-200 bg-white px-1 py-0.5 font-mono text-[9.5px] dark:border-[#2A3142] dark:bg-[#171C26]">
                Esc
              </kbd>
              <span>{t.commandPalette.closeHint}</span>
            </span>
          </div>
          <span className="tabular-nums font-mono text-[10px]">
            {conversations.length}
          </span>
        </div>
      </div>
    </div>
  );
}
