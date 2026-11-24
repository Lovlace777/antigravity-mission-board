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
  const cacheWidth = Math.min(
    100,
    Math.max(
      0,
      Math.round(
        (stats.tokens.cacheHitRate <= 1
          ? stats.tokens.cacheHitRate * 100
          : stats.tokens.cacheHitRate) || 0,
      ),
    ),
  );

  return (
    <section
      aria-label="Attention Radar"
      className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5"
    >
      {/* 1. Running */}
      <button
        type="button"
        onClick={() => toggle('running')}
        className={`group relative flex items-center justify-between overflow-hidden rounded-xl border px-3.5 py-2.5 text-left transition-all duration-150 hover:-translate-y-[1px] ${
          activeFilter === 'running'
            ? 'border-emerald-500/60 bg-emerald-50/70 shadow-xs ring-2 ring-emerald-500/18 dark:border-emerald-400/50 dark:bg-emerald-500/10 dark:ring-emerald-400/20'
            : 'border-zinc-200/85 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-zinc-300/90 hover:shadow-[0_4px_12px_-4px_rgba(15,23,42,0.07)] dark:border-[#212633] dark:bg-[#12151C] dark:shadow-none dark:hover:border-[#31394B]'
        }`}
      >
        <span
          className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] transition-opacity ${
            stats.runningCount > 0 || activeFilter === 'running'
              ? 'bg-emerald-500/80 opacity-100'
              : 'bg-emerald-500/40 opacity-0 group-hover:opacity-100'
          }`}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            {stats.runningCount > 0 ? (
              <LivePulseDot />
            ) : (
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/45" />
            )}
            <span className="truncate">{t.radar.running}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="tabular-nums text-[22px] leading-none font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {stats.runningCount}
            </span>
            {activeFilter === 'running' && (
              <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                {t.radar.filterActive}
              </span>
            )}
          </div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 ring-1 ring-inset ring-emerald-500/15 transition-transform group-hover:scale-105 dark:bg-emerald-500/12 dark:text-emerald-400 dark:ring-emerald-400/20">
          <Activity className="h-4 w-4" />
        </div>
      </button>

      {/* 2. Needs Attention */}
      <button
        type="button"
        onClick={() => toggle('attention')}
        className={`group relative flex items-center justify-between overflow-hidden rounded-xl border px-3.5 py-2.5 text-left transition-all duration-150 hover:-translate-y-[1px] ${
          activeFilter === 'attention'
            ? 'border-amber-500/70 bg-amber-50/70 shadow-xs ring-2 ring-amber-500/18 dark:border-amber-400/50 dark:bg-amber-500/10 dark:ring-amber-400/20'
            : 'border-zinc-200/85 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-zinc-300/90 hover:shadow-[0_4px_12px_-4px_rgba(15,23,42,0.07)] dark:border-[#212633] dark:bg-[#12151C] dark:shadow-none dark:hover:border-[#31394B]'
        }`}
      >
        <span
          className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] transition-opacity ${
            stats.attentionCount > 0 || activeFilter === 'attention'
              ? 'bg-amber-500/85 opacity-100'
              : 'bg-amber-500/40 opacity-0 group-hover:opacity-100'
          }`}
        />
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
              className={`tabular-nums text-[22px] leading-none font-semibold tracking-tight ${
                stats.attentionCount > 0
                  ? 'text-amber-700 dark:text-amber-300'
                  : 'text-zinc-900 dark:text-zinc-50'
              }`}
            >
              {stats.attentionCount}
            </span>
            {activeFilter === 'attention' && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                {t.radar.filterActive}
              </span>
            )}
          </div>
        </div>
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-lg ring-1 ring-inset transition-transform group-hover:scale-105 ${
            stats.attentionCount > 0
              ? 'bg-amber-500/10 text-amber-600 ring-amber-500/20 dark:bg-amber-500/12 dark:text-amber-400 dark:ring-amber-400/20'
              : 'bg-zinc-100 text-zinc-400 ring-zinc-500/10 dark:bg-zinc-800/80 dark:text-zinc-500 dark:ring-zinc-700/40'
          }`}
        >
          <AlertTriangle className="h-4 w-4" />
        </div>
      </button>

      {/* 3. Active Swarms / Subagents */}
      <button
        type="button"
        onClick={() => toggle('agents')}
        className={`group relative flex items-center justify-between overflow-hidden rounded-xl border px-3.5 py-2.5 text-left transition-all duration-150 hover:-translate-y-[1px] ${
          activeFilter === 'agents'
            ? 'border-sky-500/60 bg-sky-50/70 shadow-xs ring-2 ring-sky-500/18 dark:border-sky-400/50 dark:bg-sky-500/10 dark:ring-sky-400/20'
            : 'border-zinc-200/85 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-zinc-300/90 hover:shadow-[0_4px_12px_-4px_rgba(15,23,42,0.07)] dark:border-[#212633] dark:bg-[#12151C] dark:shadow-none dark:hover:border-[#31394B]'
        }`}
      >
        <span
          className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] transition-opacity ${
            stats.activeSwarmCount > 0 || activeFilter === 'agents'
              ? 'bg-sky-500/80 opacity-100'
              : 'bg-sky-500/40 opacity-0 group-hover:opacity-100'
          }`}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-sky-500/80" />
            <span className="truncate">{t.radar.swarmsAndAgents}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-1.5">
            <span className="tabular-nums text-[22px] leading-none font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {stats.activeSwarmCount}
            </span>
            <span className="tabular-nums text-xs text-zinc-400 dark:text-zinc-500">
              / {stats.activeAgentCount}
            </span>
            {activeFilter === 'agents' && (
              <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-700 dark:text-sky-300">
                {t.radar.filterActive}
              </span>
            )}
          </div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-500/10 text-sky-600 ring-1 ring-inset ring-sky-500/15 transition-transform group-hover:scale-105 dark:bg-sky-500/12 dark:text-sky-400 dark:ring-sky-400/20">
          <Network className="h-4 w-4" />
        </div>
      </button>

      {/* 4. Stale */}
      <button
        type="button"
        onClick={() => toggle('stale')}
        className={`group relative flex items-center justify-between overflow-hidden rounded-xl border px-3.5 py-2.5 text-left transition-all duration-150 hover:-translate-y-[1px] ${
          activeFilter === 'stale'
            ? 'border-zinc-500/60 bg-zinc-100/80 shadow-xs ring-2 ring-zinc-500/15 dark:border-zinc-400/50 dark:bg-zinc-800/70 dark:ring-zinc-400/15'
            : 'border-zinc-200/85 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)] hover:border-zinc-300/90 hover:shadow-[0_4px_12px_-4px_rgba(15,23,42,0.07)] dark:border-[#212633] dark:bg-[#12151C] dark:shadow-none dark:hover:border-[#31394B]'
        }`}
      >
        <span
          className={`pointer-events-none absolute inset-x-0 top-0 h-[2px] transition-opacity ${
            activeFilter === 'stale'
              ? 'bg-zinc-500 opacity-100'
              : 'bg-zinc-400/50 opacity-0 group-hover:opacity-100'
          }`}
        />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <span className="h-1.5 w-1.5 rounded-full bg-zinc-400/70" />
            <span className="truncate">{t.radar.stale}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="tabular-nums text-[22px] leading-none font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {stats.staleCount}
            </span>
            {activeFilter === 'stale' && (
              <span className="rounded bg-zinc-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-700 dark:text-zinc-300">
                {t.radar.filterActive}
              </span>
            )}
          </div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-500/10 text-zinc-500 ring-1 ring-inset ring-zinc-500/10 transition-transform group-hover:scale-105 dark:bg-zinc-700/35 dark:text-zinc-400 dark:ring-zinc-600/30">
          <Clock className="h-4 w-4" />
        </div>
      </button>

      {/* 5. Total Tokens & Cache Hit Rate */}
      <button
        type="button"
        onClick={() => onToggleFilter(null)}
        className="group relative col-span-2 flex items-center justify-between overflow-hidden rounded-xl border border-zinc-200/85 bg-white px-3.5 py-2.5 text-left shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-all duration-150 hover:-translate-y-[1px] hover:border-zinc-300/90 hover:shadow-[0_4px_12px_-4px_rgba(15,23,42,0.07)] sm:col-span-1 dark:border-[#212633] dark:bg-[#12151C] dark:shadow-none dark:hover:border-[#31394B]"
        title={`${t.radar.totalConversations}: ${stats.total}`}
      >
        <span className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-slate-400/50 opacity-0 transition-opacity group-hover:opacity-100 dark:bg-slate-500/50" />
        <div className="min-w-0 flex-1 pr-2">
          <div className="flex items-center justify-between text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
            <span className="truncate">{t.radar.tokensAndCache}</span>
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="tabular-nums text-[22px] leading-none font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
              {formatCompactNumber(stats.tokens.totalTokens)}
            </span>
            <span className="tabular-nums rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/14 dark:text-emerald-300">
              {cachePct} {t.radar.cacheHit}
            </span>
          </div>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-[#1C212E]">
            <div
              className="h-full rounded-full bg-emerald-500/80 transition-all duration-300"
              style={{ width: `${cacheWidth}%` }}
            />
          </div>
        </div>
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-500/10 text-zinc-500 ring-1 ring-inset ring-zinc-500/10 dark:bg-zinc-700/35 dark:text-zinc-400 dark:ring-zinc-600/30">
          <Cpu className="h-4 w-4" />
        </div>
      </button>
    </section>
  );
}
