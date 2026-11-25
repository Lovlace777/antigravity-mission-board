import type { AttentionReason, LaneId, Priority, SwarmMemberState } from '@shared/types';
import type { Dictionary } from '../i18n';

export const LANE_ORDER: LaneId[] = ['running', 'attention', 'active', 'stale', 'archived'];

/** Quiet 6px breathing sage-emerald signal dot (used ONLY when genuinely running) */
export function LivePulseDot({ className = '' }: { className?: string }) {
  return (
    <span className={`relative inline-flex h-1.5 w-1.5 shrink-0 ${className}`}>
      <span className="live-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-500/75 dark:bg-emerald-400/70" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[#16A34A] dark:bg-[#22C55E]" />
    </span>
  );
}

/** Minimal typographic priority label (no loud boxed pill) */
export function PriorityBadge({
  priority,
  compact = false,
}: {
  priority: Priority;
  compact?: boolean;
}) {
  if (!priority) return null;
  const styles: Record<Exclude<Priority, null>, string> = {
    p0: 'text-[#DC2626] dark:text-[#F87171]',
    p1: 'text-[#B45309] dark:text-[#FBBF24]',
    p2: 'text-[#78716C] dark:text-[#A1A09A]',
  };
  return (
    <span
      className={`inline-flex items-center font-mono font-semibold uppercase tracking-tight ${
        compact ? 'text-[10px] leading-none' : 'text-[11px] leading-none'
      } ${styles[priority]}`}
    >
      {priority.toUpperCase()}
    </span>
  );
}

/** Calm editorial lane indicator (whisper surface + tiny semantic dot) */
export function LanePill({
  lane,
  t,
  isRunning = false,
}: {
  lane: LaneId;
  t: Dictionary;
  isRunning?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#1C1917]/[0.08] bg-[#F4F2EC] px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-[#44403C] dark:border-white/[0.08] dark:bg-[#242421] dark:text-[#D6D3CD]">
      {lane === 'running' || isRunning ? (
        <LivePulseDot />
      ) : (
        <span className={`h-1.5 w-1.5 rounded-full ${laneAccentDot(lane)}`} />
      )}
      <span>{t.lanes[lane]}</span>
    </span>
  );
}

/** Restrained editorial attention tag (used in Drawer & Matrix, never stacked neon pills) */
export function AttentionReasonBadge({
  reason,
  t,
}: {
  reason: AttentionReason;
  t: Dictionary;
}) {
  const isError = reason === 'error';
  const isAmber =
    reason === 'needs_input' ||
    reason === 'request_feedback' ||
    reason === 'unread_update' ||
    reason === 'marked_as_unread' ||
    reason === 'follow_up_due';

  const dotColor = isError
    ? 'bg-[#DC2626] dark:bg-[#EF4444]'
    : isAmber
      ? 'bg-[#D97706] dark:bg-[#F59E0B]'
      : 'bg-[#78716C]';

  const textColor = isError
    ? 'text-[#B91C1C] dark:text-[#FCA5A5]'
    : isAmber
      ? 'text-[#92400E] dark:text-[#FCD34D]'
      : 'text-[#57534E] dark:text-[#A1A09A]';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-md border border-[#1C1917]/[0.07] bg-[#F7F5F0] px-1.5 py-0.5 text-[11px] font-medium leading-tight whitespace-nowrap dark:border-white/[0.07] dark:bg-[#22221F] ${textColor}`}
    >
      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
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
  const map: Record<SwarmMemberState, { label: string; dot: string; text: string }> = {
    working: {
      label: t.swarmView.statusWorking,
      dot: 'bg-[#16A34A] dark:bg-[#22C55E]',
      text: 'text-[#15803D] dark:text-[#4ADE80]',
    },
    waiting: {
      label: t.swarmView.statusWaiting,
      dot: 'bg-[#78716C] dark:bg-[#A1A09A]',
      text: 'text-[#57534E] dark:text-[#D6D3CD]',
    },
    stopped: {
      label: t.swarmView.statusStopped,
      dot: 'bg-[#A8A29E] dark:bg-[#666560]',
      text: 'text-[#78716C] dark:text-[#8C8B85]',
    },
    killed: {
      label: t.swarmView.statusKilled,
      dot: 'bg-[#D6D3D1] dark:bg-[#494844]',
      text: 'text-[#A8A29E] dark:text-[#666560]',
    },
  };
  const cfg = map[effective] ?? map.stopped;
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-medium whitespace-nowrap ${cfg.text}`}
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
      return 'bg-[#16A34A] dark:bg-[#22C55E]';
    case 'attention':
      return 'bg-[#D97706] dark:bg-[#F59E0B]';
    case 'active':
      return 'bg-[#57534E] dark:bg-[#A1A09A]';
    case 'stale':
      return 'bg-[#A8A29E] dark:bg-[#666560]';
    case 'archived':
      return 'bg-[#D6D3D1] dark:bg-[#44433F]';
  }
}

export function priorityRank(priority: Priority): number {
  if (priority === 'p0') return 3;
  if (priority === 'p1') return 2;
  if (priority === 'p2') return 1;
  return 0;
}

/** Pick the single highest-priority human attention reason to display cleanly */
export function primaryAttentionReason(
  reasons: AttentionReason[],
): AttentionReason | null {
  if (reasons.length === 0) return null;
  const order: AttentionReason[] = [
    'error',
    'needs_input',
    'request_feedback',
    'follow_up_due',
    'marked_as_unread',
    'unread_update',
  ];
  for (const r of order) {
    if (reasons.includes(r)) return r;
  }
  return reasons[0];
}
