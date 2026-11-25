import type { BoardStats } from '@shared/types';
import { RotateCcw } from 'lucide-react';
import type { Dictionary } from '../i18n';
import { formatCompactNumber, formatPercent } from '../utils';
import { LivePulseDot } from './badges';
import {
  KanbanViewControls,
  type CardDensity,
  type KanbanSortMode,
} from './TopBar';

export type RadarFilter = 'running' | 'attention' | 'agents' | 'stale' | null;

interface RadarStripProps {
  stats: BoardStats;
  activeFilter: RadarFilter;
  onToggleFilter: (filter: RadarFilter) => void;
  showInlineReset?: boolean;
  onClearAllFilters?: () => void;
  tuckKanbanControls?: boolean;
  kanbanSort?: KanbanSortMode;
  onKanbanSortChange?: (s: KanbanSortMode) => void;
  density?: CardDensity;
  onDensityChange?: (d: CardDensity) => void;
  t: Dictionary;
}

/**
 * Calm 40px Editorial Status Strip — replaces heavy 5-card KPI walls
 * with a razor-clean, tactile horizontal telemetry strip.
 * When TopBar's secondary filter row is auto-collapsed (<=1 workspace & 0 tags),
 * Kanban sort & card density controls tuck cleanly onto the right end here.
 */
export function RadarStrip({
  stats,
  activeFilter,
  onToggleFilter,
  showInlineReset = false,
  onClearAllFilters,
  tuckKanbanControls = false,
  kanbanSort = 'smart',
  onKanbanSortChange,
  density = 'comfortable',
  onDensityChange,
  t,
}: RadarStripProps) {
  const toggle = (target: Exclude<RadarFilter, null>) => {
    onToggleFilter(activeFilter === target ? null : target);
  };

  const cachePct = formatPercent(stats.tokens.cacheHitRate);

  const btnBase =
    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs transition-colors whitespace-nowrap';
  const btnActive =
    'bg-[#1C1917] text-[#F6F5F1] font-medium dark:bg-[#F2F1EE] dark:text-[#111110]';
  const btnIdle =
    'text-[#57534E] hover:bg-[#1C1917]/[0.05] hover:text-[#1C1917] dark:text-[#A1A09A] dark:hover:bg-white/[0.06] dark:hover:text-[#F2F1EE]';

  return (
    <section
      aria-label="Attention Radar"
      className="flex min-h-[40px] flex-wrap items-center justify-between gap-2 rounded-xl border border-[#1C1917]/[0.075] bg-white/85 px-2.5 py-1 shadow-[0_1px_2px_rgba(28,25,23,0.03)] dark:border-white/[0.065] dark:bg-[#171715]/90 dark:shadow-none"
    >
      {/* Left: Clickable editorial telemetry filters */}
      <div className="flex flex-wrap items-center gap-1">
        {/* Running */}
        <button
          type="button"
          onClick={() => toggle('running')}
          className={`${btnBase} ${activeFilter === 'running' ? btnActive : btnIdle}`}
        >
          {stats.runningCount > 0 ? (
            <LivePulseDot />
          ) : (
            <span className="h-1.5 w-1.5 rounded-full bg-[#A8A29E] dark:bg-[#666560]" />
          )}
          <span className="tabular-nums font-semibold">{stats.runningCount}</span>
          <span>{t.radar.running}</span>
        </button>

        <span className="h-3.5 w-px bg-[#1C1917]/[0.08] dark:bg-white/[0.08]" />

        {/* Needs Attention */}
        <button
          type="button"
          onClick={() => toggle('attention')}
          className={`${btnBase} ${activeFilter === 'attention' ? btnActive : btnIdle}`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              stats.attentionCount > 0
                ? 'bg-[#D97706] dark:bg-[#F59E0B]'
                : 'bg-[#A8A29E] dark:bg-[#666560]'
            }`}
          />
          <span className="tabular-nums font-semibold">{stats.attentionCount}</span>
          <span>{t.radar.attention}</span>
        </button>

        <span className="h-3.5 w-px bg-[#1C1917]/[0.08] dark:bg-white/[0.08]" />

        {/* Active Swarms / Subagents */}
        <button
          type="button"
          onClick={() => toggle('agents')}
          className={`${btnBase} ${activeFilter === 'agents' ? btnActive : btnIdle}`}
        >
          <span className="tabular-nums font-semibold">{stats.activeSwarmCount}</span>
          <span>Swarm</span>
          {stats.activeAgentCount > 0 && (
            <span className="tabular-nums opacity-65">
              · {stats.activeAgentCount}
            </span>
          )}
        </button>

        <span className="h-3.5 w-px bg-[#1C1917]/[0.08] dark:bg-white/[0.08]" />

        {/* Stale */}
        <button
          type="button"
          onClick={() => toggle('stale')}
          className={`${btnBase} ${activeFilter === 'stale' ? btnActive : btnIdle}`}
        >
          <span className="tabular-nums font-semibold">{stats.staleCount}</span>
          <span>{t.radar.stale}</span>
        </button>

        {showInlineReset && onClearAllFilters && (
          <>
            <span className="h-3.5 w-px bg-[#1C1917]/[0.08] dark:bg-white/[0.08]" />
            <button
              type="button"
              onClick={onClearAllFilters}
              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#1C1917]/[0.14] bg-white px-2 py-0.5 text-[11px] font-medium text-[#1C1917] transition-colors hover:bg-[#EFECE6] dark:border-white/[0.14] dark:bg-[#222220] dark:text-[#F2F1EE] dark:hover:bg-[#2B2B28]"
            >
              <RotateCcw className="h-3 w-3" />
              <span>{t.resetFilters}</span>
            </button>
          </>
        )}
      </div>

      {/* Right: Quiet token telemetry + tucked Kanban sort/density when secondary toolbar collapsed */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onToggleFilter(null)}
          title={`${t.radar.totalConversations}: ${stats.total}`}
          className="tabular-nums inline-flex items-center gap-2 rounded-lg px-2 py-1 text-[11.5px] text-[#78716C] transition-colors hover:text-[#1C1917] dark:text-[#8C8B85] dark:hover:text-[#F2F1EE]"
        >
          <span className="font-medium text-[#44403C] dark:text-[#D6D3CD]">
            {formatCompactNumber(stats.tokens.totalTokens)}
          </span>
          <span>tokens</span>
          <span className="opacity-40">·</span>
          <span className="tabular-nums font-medium">{cachePct}</span>
          <span className="hidden sm:inline">{t.radar.cacheHit}</span>
        </button>

        {tuckKanbanControls && onKanbanSortChange && onDensityChange && (
          <>
            <span className="hidden h-3.5 w-px bg-[#1C1917]/[0.09] sm:inline-block dark:bg-white/[0.09]" />
            <KanbanViewControls
              kanbanSort={kanbanSort}
              onKanbanSortChange={onKanbanSortChange}
              density={density}
              onDensityChange={onDensityChange}
              t={t}
              testId="radar-kanban-controls"
            />
          </>
        )}
      </div>
    </section>
  );
}
