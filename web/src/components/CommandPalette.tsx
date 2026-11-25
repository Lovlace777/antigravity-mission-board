import { useEffect, useMemo, useRef, useState } from 'react';
import type { ConversationCard, SearchResult } from '@shared/types';
import {
  Bell,
  CheckCheck,
  CornerDownLeft,
  Filter,
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
        .catch(() => {})
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

    const serverById = new Map<string, SearchResult>();
    for (const sr of serverResults) serverById.set(sr.conversationId, sr);

    const matchedCards: Array<{ card: ConversationCard; matchedIn?: string[]; score: number }> = [];
    for (const card of conversations) {
      if (!q) {
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
          density === 'comfortable' ? t.density.compact : t.density.comfortable,
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

  useEffect(() => {
    setActiveIndex((prev) => {
      if (entries.length === 0) return 0;
      return Math.min(prev, entries.length - 1);
    });
  }, [entries.length]);

  useEffect(() => {
    if (!open || !listRef.current) return;
    const activeEl = listRef.current.querySelector<HTMLElement>(
      `[data-palette-index="${activeIndex}"]`,
    );
    activeEl?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex, open]);

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
        if (chosen) chosen.run();
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
      <div
        className="agmb-backdrop-enter fixed inset-0 bg-[#1C1917]/30 backdrop-blur-[2px] dark:bg-black/65"
        onClick={onClose}
      />

      <div className="agmb-modal-enter relative z-10 flex w-full max-w-[610px] flex-col overflow-hidden rounded-2xl border border-[#1C1917]/[0.12] bg-white shadow-[0_24px_64px_-12px_rgba(28,25,23,0.25)] dark:border-white/[0.11] dark:bg-[#191917] dark:shadow-[0_28px_72px_-12px_rgba(0,0,0,0.8)]">
        {/* Input */}
        <div className="flex items-center gap-2.5 border-b border-[#1C1917]/[0.075] px-4 py-3 dark:border-white/[0.07]">
          <Search className="h-4 w-4 shrink-0 text-[#969088]" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
            }}
            placeholder={t.commandPalette.placeholder}
            className="w-full bg-transparent text-sm text-[#1C1917] placeholder:text-[#969088] focus:outline-none dark:text-[#F2F1EE] dark:placeholder:text-[#666560]"
          />
          {searchingServer && (
            <span className="inline-flex shrink-0 items-center gap-1 text-[11px] text-[#8C867E]">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
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
              className="rounded-md p-1 text-[#8C867E] transition-colors hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
              aria-label="Clear query"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
          <kbd className="hidden shrink-0 rounded border border-[#1C1917]/[0.09] bg-[#F6F5F1] px-1.5 py-0.5 text-[10px] text-[#8C867E] sm:inline-block dark:border-white/[0.09] dark:bg-[#232320] dark:text-[#787771]">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[440px] overflow-y-auto p-2">
          {entries.length === 0 ? (
            <div className="py-12 text-center text-xs text-[#969088] dark:text-[#666560]">
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
                      ? 'mt-1.5 border-t border-[#1C1917]/[0.07] pt-1.5 dark:border-white/[0.07]'
                      : undefined
                  }
                >
                  {showSectionHeader && (
                    <div className="mt-2 mb-1 px-2.5 text-[10.5px] font-semibold tracking-wider text-[#969088] uppercase first:mt-0.5 dark:text-[#666560]">
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
                        ? 'bg-[#EFECE6] text-[#1C1917] dark:bg-[#262623] dark:text-[#F2F1EE]'
                        : 'text-[#44403C] hover:bg-[#F6F5F1] dark:text-[#D6D3CD] dark:hover:bg-[#20201D]'
                    }`}
                  >
                    {entry.kind === 'conversation' && entry.card ? (
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center">
                        {entry.card.isRunning ? (
                          <LivePulseDot />
                        ) : (
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${laneAccentDot(entry.card.lane)}`}
                          />
                        )}
                      </div>
                    ) : Icon ? (
                      <div
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${
                          isActive
                            ? 'bg-[#1C1917] text-[#F6F5F1] dark:bg-[#F2F1EE] dark:text-[#111110]'
                            : 'bg-[#F2F0EB] text-[#78716C] dark:bg-[#242421] dark:text-[#9F9E98]'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                    ) : null}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs font-medium">
                          {entry.label}
                        </span>
                        {entry.card && (
                          <PriorityBadge priority={entry.card.overlay.priority} compact />
                        )}
                        {entry.matchedIn && entry.matchedIn.length > 0 && (
                          <span className="shrink-0 text-[10px] text-[#78716C] dark:text-[#8C8B85]">
                            · {entry.matchedIn[0]}
                          </span>
                        )}
                      </div>
                      {entry.subtitle && (
                        <div className="mt-0.5 truncate text-[11px] text-[#8C867E] dark:text-[#787771]">
                          {entry.subtitle}
                        </div>
                      )}
                    </div>

                    {entry.kind === 'conversation' && entry.card ? (
                      <div className="flex shrink-0 items-center gap-2">
                        {entry.card.workspace && (
                          <span className="hidden max-w-[115px] truncate text-[10.5px] text-[#8C867E] sm:inline dark:text-[#787771]">
                            {entry.card.workspace}
                          </span>
                        )}
                        <span className="tabular-nums text-[10.5px] text-[#969088] dark:text-[#666560]">
                          {formatRelativeTime(entry.card.lastModifiedAt, t)}
                        </span>
                        {isActive && (
                          <CornerDownLeft className="h-3.5 w-3.5 text-[#57534E] dark:text-[#A1A09A]" />
                        )}
                      </div>
                    ) : entry.shortcut ? (
                      <kbd className="shrink-0 rounded border border-[#1C1917]/[0.1] bg-white px-1.5 py-0.5 text-[10px] text-[#78716C] dark:border-white/[0.1] dark:bg-[#1D1D1B] dark:text-[#9F9E98]">
                        {entry.shortcut}
                      </kbd>
                    ) : isActive ? (
                      <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-[#57534E] dark:text-[#A1A09A]" />
                    ) : null}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-[#1C1917]/[0.07] bg-[#F6F5F1]/80 px-4 py-2 text-[10.5px] text-[#8C867E] dark:border-white/[0.06] dark:bg-[#141413] dark:text-[#6E6D68]">
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-[#1C1917]/[0.09] bg-white px-1 py-0.5 text-[9.5px] dark:border-white/[0.09] dark:bg-[#1E1E1C]">
                ↑↓
              </kbd>
              <span>{t.commandPalette.navigateHint}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-[#1C1917]/[0.09] bg-white px-1 py-0.5 text-[9.5px] dark:border-white/[0.09] dark:bg-[#1E1E1C]">
                ↵
              </kbd>
              <span>{t.commandPalette.selectHint}</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="rounded border border-[#1C1917]/[0.09] bg-white px-1 py-0.5 text-[9.5px] dark:border-white/[0.09] dark:bg-[#1E1E1C]">
                Esc
              </kbd>
              <span>{t.commandPalette.closeHint}</span>
            </span>
          </div>
          <span className="tabular-nums text-[10px]">
            {conversations.length}
          </span>
        </div>
      </div>
    </div>
  );
}
