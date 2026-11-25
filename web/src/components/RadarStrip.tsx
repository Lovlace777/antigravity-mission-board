import type { BoardStats } from '@shared/types';
import type { Dictionary } from '../i18n';
import { formatCompactNumber, formatPercent } from '../utils';
import { LivePulseDot } from './badges';

export type RadarFilter = 'running' | 'attention' | 'agents' | 'stale' | null;

interface RadarStripProps {
  stats: BoardStats;
  activeFilter: RadarFilter;
  onToggleFilter: (filter: RadarFilter) => void;
  t: Dictionary;
}

/**
 * Calm 40px Editorial Status Strip — replaces heavy 5-card KPI walls
 * with a razor-clean, tactile horizontal telemetry strip.
 */
export function RadarStrip({
  stats,
  activeFilter,
  onToggleFilter,
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
      </div>

      {/* Right: Quiet token & cache telemetry */}
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
    </section>
  );
}
