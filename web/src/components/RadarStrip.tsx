import type { BoardStats } from '@shared/types';
import {
  Activity,
  AlertTriangle,
  Clock,
  Cpu,
  Network,
} from 'lucide-react';
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
  const cacheWidth = Math.min(100, Math.max(0, Math.round((stats.tokens.cacheHitRate <= 1 ? stats.tokens.cacheHitRate * 100 : stats.tokens.cacheHitRate) || 0)));

  return (
    <section
      aria-label="Attention Radar"
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5"
    >
      {/* 1. Running */}
      <button
        type="button"
        onClick={() => toggle('running')}
        className={`group flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-left transition-all ${
          activeFilter === 'running'
            ? 'border-emerald-500/60 bg-emerald-50/70 ring-2 ring-emerald-500/20 dark:border-emerald-400/50 dark:bg-emerald-500/10 dark:ring-emerald-400/20'
            : 'border-zinc-200/90 bg-white hover:border-zinc-300 dark:border-[#222733] dark:bg-[#13161D] dark:hover:border-[#323A4B]'
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            {stats.runningCount > 0 ? (
              <LivePulseDot />
            ) : (
              <Activity className="h-3.5 w-3.5 text-emerald-500/70" />
            )}
            <span className="truncate">{t.radar.running}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="tabular-nums text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {stats.runningCount}
            </span>
            {activeFilter === 'running' && (
              <span className="text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                {t.radar.filterActive}
              </span>
            )}
          </div>
        </div>
        <div className="rounded-md bg-emerald-50 p-1.5 text-emerald-600 transition-transform group-hover:scale-105 dark:bg-emerald-500/10 dark:text-emerald-400">
          <Activity className="h-4 w-4" />
        </div>
      </button>

      {/* 2. Needs Attention */}
      <button
        type="button"
        onClick={() => toggle('attention')}
        className={`group flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-left transition-all ${
          activeFilter === 'attention'
            ? 'border-amber-500/70 bg-amber-50/70 ring-2 ring-amber-500/20 dark:border-amber-400/50 dark:bg-amber-500/10 dark:ring-amber-400/20'
            : stats.attentionCount > 0
              ? 'border-amber-300/70 bg-white hover:border-amber-400/80 dark:border-amber-500/30 dark:bg-[#13161D] dark:hover:border-amber-400/50'
              : 'border-zinc-200/90 bg-white hover:border-zinc-300 dark:border-[#222733] dark:bg-[#13161D] dark:hover:border-[#323A4B]'
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                stats.attentionCount > 0 ? 'bg-amber-500' : 'bg-zinc-300 dark:bg-zinc-600'
              }`}
            />
            <span className="truncate">{t.radar.attention}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`tabular-nums text-xl font-semibold tracking-tight ${
                stats.attentionCount > 0
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-zinc-900 dark:text-zinc-50'
              }`}
            >
              {stats.attentionCount}
            </span>
            {activeFilter === 'attention' && (
              <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                {t.radar.filterActive}
              </span>
            )}
          </div>
        </div>
        <div
          className={`rounded-md p-1.5 transition-transform group-hover:scale-105 ${
            stats.attentionCount > 0
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/12 dark:text-amber-400'
              : 'bg-zinc-100 text-zinc-400 dark:bg-zinc-800/80 dark:text-zinc-500'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
        </div>
      </button>

      {/* 3. Active Swarms / Subagents */}
      <button
        type="button"
        onClick={() => toggle('agents')}
        className={`group flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-left transition-all ${
          activeFilter === 'agents'
            ? 'border-sky-500/60 bg-sky-50/70 ring-2 ring-sky-500/20 dark:border-sky-400/50 dark:bg-sky-500/10 dark:ring-sky-400/20'
            : 'border-zinc-200/90 bg-white hover:border-zinc-300 dark:border-[#222733] dark:bg-[#13161D] dark:hover:border-[#323A4B]'
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <span className="truncate">{t.radar.swarmsAndAgents}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="tabular-nums text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {stats.activeSwarmCount}
            </span>
            <span className="tabular-nums text-xs text-zinc-400 dark:text-zinc-500">
              / {stats.activeAgentCount}
            </span>
            {activeFilter === 'agents' && (
              <span className="text-[10px] font-medium text-sky-600 dark:text-sky-400">
                {t.radar.filterActive}
              </span>
            )}
          </div>
        </div>
        <div className="rounded-md bg-sky-50 p-1.5 text-sky-600 transition-transform group-hover:scale-105 dark:bg-sky-500/10 dark:text-sky-400">
          <Network className="h-4 w-4" />
        </div>
      </button>

      {/* 4. Stale */}
      <button
        type="button"
        onClick={() => toggle('stale')}
        className={`group flex items-center justify-between rounded-lg border px-3.5 py-2.5 text-left transition-all ${
          activeFilter === 'stale'
            ? 'border-zinc-500/60 bg-zinc-100/80 ring-2 ring-zinc-500/15 dark:border-zinc-400/50 dark:bg-zinc-800/70 dark:ring-zinc-400/15'
            : 'border-zinc-200/90 bg-white hover:border-zinc-300 dark:border-[#222733] dark:bg-[#13161D] dark:hover:border-[#323A4B]'
        }`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <span className="truncate">{t.radar.stale}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="tabular-nums text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {stats.staleCount}
            </span>
            {activeFilter === 'stale' && (
              <span className="text-[10px] font-medium text-zinc-600 dark:text-zinc-300">
                {t.radar.filterActive}
              </span>
            )}
          </div>
        </div>
        <div className="rounded-md bg-zinc-100 p-1.5 text-zinc-500 transition-transform group-hover:scale-105 dark:bg-zinc-800 dark:text-zinc-400">
          <Clock className="h-4 w-4" />
        </div>
      </button>

      {/* 5. Total Tokens & Cache Hit Rate */}
      <button
        type="button"
        onClick={() => onToggleFilter(null)}
        className="col-span-2 flex items-center justify-between rounded-lg border border-zinc-200/90 bg-white px-3.5 py-2.5 text-left transition-colors hover:border-zinc-300 sm:col-span-1 dark:border-[#222733] dark:bg-[#13161D] dark:hover:border-[#323A4B]"
        title={`${t.radar.totalConversations}: ${stats.total}`}
      >
        <div className="min-w-0 flex-1 pr-2">
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <span className="truncate">{t.radar.tokensAndCache}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="tabular-nums text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {formatCompactNumber(stats.tokens.totalTokens)}
            </span>
            <span className="tabular-nums rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/12 dark:text-emerald-300">
              {cachePct} {t.radar.cacheHit}
            </span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            <div
              className="h-full rounded-full bg-emerald-500/80 transition-all duration-300"
              style={{ width: `${cacheWidth}%` }}
            />
          </div>
        </div>
        <div className="rounded-md bg-zinc-100 p-1.5 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
          <Cpu className="h-4 w-4" />
        </div>
      </button>
    </section>
  );
}
