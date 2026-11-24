import type { AttentionReason, LaneId, Priority, SwarmMemberState } from '@shared/types';
import {
  AlertCircle,
  CalendarClock,
  CircleDot,
  FileCheck2,
  HelpCircle,
  MailWarning,
} from 'lucide-react';
import type { Dictionary } from '../i18n';

export const LANE_ORDER: LaneId[] = ['running', 'attention', 'active', 'stale', 'archived'];

export function LivePulseDot({ className = '' }: { className?: string }) {
  return (
    <span className={`relative inline-flex h-2 w-2 shrink-0 ${className}`}>
      <span className="live-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
    </span>
  );
}

export function PriorityBadge({
  priority,
  compact = false,
}: {
  priority: Priority;
  compact?: boolean;
}) {
  if (!priority) return null;
  const styles: Record<Exclude<Priority, null>, string> = {
    p0: 'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-500/15 dark:text-rose-300 dark:ring-rose-400/25',
    p1: 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/25',
    p2: 'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-500/15 dark:text-sky-300 dark:ring-sky-400/25',
  };
  return (
    <span
      className={`inline-flex items-center rounded font-mono font-semibold uppercase tracking-tight ${
        compact ? 'px-1 py-0.5 text-[10px] leading-none' : 'px-1.5 py-0.5 text-[11px] leading-none'
      } ${styles[priority]}`}
    >
      {priority.toUpperCase()}
    </span>
  );
}

export function LanePill({
  lane,
  t,
  isRunning = false,
}: {
  lane: LaneId;
  t: Dictionary;
  isRunning?: boolean;
}) {
  const styles: Record<LaneId, string> = {
    running:
      'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/12 dark:text-emerald-300 dark:ring-emerald-400/25',
    attention:
      'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/12 dark:text-amber-300 dark:ring-amber-400/25',
    active:
      'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-500/12 dark:text-sky-300 dark:ring-sky-400/25',
    stale:
      'bg-zinc-100 text-zinc-600 ring-1 ring-inset ring-zinc-500/15 dark:bg-zinc-800/80 dark:text-zinc-400 dark:ring-zinc-600/30',
    archived:
      'bg-zinc-100/80 text-zinc-500 ring-1 ring-inset ring-zinc-500/15 dark:bg-zinc-900 dark:text-zinc-500 dark:ring-zinc-700/40',
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${styles[lane]}`}
    >
      {lane === 'running' || isRunning ? (
        <LivePulseDot />
      ) : (
        <span
          className={`h-1.5 w-1.5 rounded-full ${
            lane === 'attention'
              ? 'bg-amber-500'
              : lane === 'active'
                ? 'bg-sky-500'
                : lane === 'stale'
                  ? 'bg-zinc-400'
                  : 'bg-zinc-400/60'
          }`}
        />
      )}
      <span>{t.lanes[lane]}</span>
    </span>
  );
}

export function AttentionReasonBadge({
  reason,
  t,
}: {
  reason: AttentionReason;
  t: Dictionary;
}) {
  const config: Record<
    AttentionReason,
    { style: string; Icon: typeof AlertCircle }
  > = {
    error: {
      style:
        'bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-500/14 dark:text-rose-300 dark:ring-rose-400/25',
      Icon: AlertCircle,
    },
    needs_input: {
      style:
        'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-600/25 dark:bg-amber-500/14 dark:text-amber-300 dark:ring-amber-400/25',
      Icon: HelpCircle,
    },
    request_feedback: {
      style:
        'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-500/14 dark:text-sky-300 dark:ring-sky-400/25',
      Icon: FileCheck2,
    },
    unread_update: {
      style:
        'bg-amber-50/90 text-amber-700 ring-1 ring-inset ring-amber-600/20 dark:bg-amber-500/12 dark:text-amber-300 dark:ring-amber-400/20',
      Icon: CircleDot,
    },
    marked_as_unread: {
      style:
        'bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20 dark:bg-orange-500/12 dark:text-orange-300 dark:ring-orange-400/25',
      Icon: MailWarning,
    },
    follow_up_due: {
      style:
        'bg-rose-50/80 text-rose-700 ring-1 ring-inset ring-rose-600/20 dark:bg-rose-500/12 dark:text-rose-300 dark:ring-rose-400/25',
      Icon: CalendarClock,
    },
  };

  const { style, Icon } = config[reason];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium leading-tight whitespace-nowrap ${style}`}
    >
      <Icon className="h-3 w-3 shrink-0" />
      <span>{t.attentionReasons[reason]}</span>
    </span>
  );
}

export function SwarmStateBadge({
  state,
  isRunning,
  t,
}: {
  state: SwarmMemberState;
  isRunning?: boolean;
  t: Dictionary;
}) {
  const effective: SwarmMemberState = isRunning ? 'working' : state;
  const map: Record<SwarmMemberState, { label: string; style: string; dot: string }> = {
    working: {
      label: t.swarmView.statusWorking,
      style:
        'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/12 dark:text-emerald-300 dark:ring-emerald-400/25',
      dot: 'bg-emerald-500',
    },
    waiting: {
      label: t.swarmView.statusWaiting,
      style:
        'bg-sky-50 text-sky-700 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-500/12 dark:text-sky-300 dark:ring-sky-400/25',
      dot: 'bg-sky-500',
    },
    stopped: {
      label: t.swarmView.statusStopped,
      style:
        'bg-zinc-100 text-zinc-600 ring-1 ring-inset ring-zinc-500/20 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-600/30',
      dot: 'bg-zinc-400',
    },
    killed: {
      label: t.swarmView.statusKilled,
      style:
        'bg-zinc-100/70 text-zinc-500 ring-1 ring-inset ring-zinc-500/15 dark:bg-zinc-900 dark:text-zinc-500 dark:ring-zinc-700/40',
      dot: 'bg-zinc-400/60',
    },
  };
  const cfg = map[effective] ?? map.stopped;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${cfg.style}`}
    >
      {effective === 'working' ? (
        <LivePulseDot />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      )}
      <span>{cfg.label}</span>
    </span>
  );
}

export function laneAccentDot(lane: LaneId): string {
  switch (lane) {
    case 'running':
      return 'bg-emerald-500';
    case 'attention':
      return 'bg-amber-500';
    case 'active':
      return 'bg-sky-500';
    case 'stale':
      return 'bg-zinc-400 dark:bg-zinc-500';
    case 'archived':
      return 'bg-zinc-300 dark:bg-zinc-600';
  }
}

export function priorityRank(priority: Priority): number {
  if (priority === 'p0') return 3;
  if (priority === 'p1') return 2;
  if (priority === 'p2') return 1;
  return 0;
}
