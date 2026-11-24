import type { ConversationCard as ConversationCardData } from '@shared/types';
import {
  CalendarClock,
  CheckCheck,
  Compass,
  FileText,
  Flag,
  Folder,
  Network,
  Pin,
  RotateCcw,
  Users,
} from 'lucide-react';
import type { Dictionary } from '../i18n';
import { formatRelativeTime, isFollowUpDue } from '../utils';
import {
  AttentionReasonBadge,
  LivePulseDot,
  PriorityBadge,
} from './badges';
import type { CardDensity } from './TopBar';

interface ConversationCardProps {
  card: ConversationCardData;
  density: CardDensity;
  isDragging?: boolean;
  isSelected?: boolean;
  onSelect: (id: string) => void;
  onTogglePin: (card: ConversationCardData) => void;
  onMarkReviewed: (card: ConversationCardData) => void;
  onCyclePriority: (card: ConversationCardData) => void;
  onResetManualLane: (card: ConversationCardData) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  t: Dictionary;
}

function getLeftAccentBarColor(card: ConversationCardData): string {
  if (card.isRunning) return 'bg-emerald-500';
  if (card.overlay.priority === 'p0' || card.hasError) return 'bg-rose-500';
  if (card.lane === 'attention' || card.overlay.priority === 'p1') return 'bg-amber-500';
  if (card.overlay.priority === 'p2' || card.lane === 'active') return 'bg-sky-500/80';
  if (card.lane === 'stale') return 'bg-zinc-400/70 dark:bg-zinc-500/70';
  return 'bg-zinc-300/70 dark:bg-zinc-700';
}

function getFlagColor(priority: ConversationCardData['overlay']['priority']): string {
  if (priority === 'p0') return 'text-rose-500 fill-rose-500/20';
  if (priority === 'p1') return 'text-amber-500 fill-amber-500/20';
  if (priority === 'p2') return 'text-sky-500 fill-sky-500/20';
  return 'text-zinc-400 dark:text-zinc-500';
}

export function ConversationCard({
  card,
  density,
  isDragging = false,
  isSelected = false,
  onSelect,
  onTogglePin,
  onMarkReviewed,
  onCyclePriority,
  onResetManualLane,
  onDragStart,
  onDragEnd,
  t,
}: ConversationCardProps) {
  const isCompact = density === 'compact';
  const showReviewButton =
    card.attentionReasons.length > 0 || card.lane === 'attention';
  const progressPct =
    card.stepsTotal > 0
      ? Math.min(100, Math.round((card.stepsCompleted / card.stepsTotal) * 100))
      : 0;
  const visibleTags = card.overlay.tags.slice(0, isCompact ? 1 : 2);
  const extraTagCount = Math.max(0, card.overlay.tags.length - visibleTags.length);
  const followUpDue = isFollowUpDue(card.overlay.followUpAt);
  const accentColor = getLeftAccentBarColor(card);

  return (
    <article
      draggable
      onDragStart={(e) => onDragStart(e, card.id)}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(card.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(card.id);
        }
      }}
      className={`group relative cursor-pointer overflow-hidden rounded-xl border bg-white pl-3.5 pr-3 transition-all duration-150 select-none hover:-translate-y-[1px] hover:shadow-[0_6px_18px_-6px_rgba(15,23,42,0.1)] dark:bg-[#12151C] dark:hover:bg-[#151923] dark:hover:shadow-[0_10px_24px_-8px_rgba(0,0,0,0.55)] ${
        isCompact ? 'py-2' : 'py-2.5'
      } ${
        isSelected
          ? 'border-sky-500/75 ring-2 ring-sky-500/18 dark:border-sky-400/70 dark:ring-sky-400/20'
          : 'border-zinc-200/85 hover:border-zinc-300/95 dark:border-[#212633] dark:hover:border-[#323B4E]'
      } ${isDragging ? 'scale-[0.98] opacity-40' : ''}`}
    >
      {/* Refined 3px left semantic accent strip */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-2 bottom-2 left-0 w-[3px] rounded-r-full transition-opacity ${accentColor}`}
      />

      {/* Sleek Hover Quick-Action Pill (top-right, 1-second triage) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-2 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-zinc-200/90 bg-white/95 p-0.5 opacity-0 shadow-sm backdrop-blur-md transition-all duration-150 group-hover:opacity-100 focus-within:opacity-100 dark:border-[#2B3345] dark:bg-[#171C26]/95"
      >
        <button
          type="button"
          onClick={() => onTogglePin(card)}
          title={card.overlay.pinned ? t.card.unpin : t.card.pin}
          className={`rounded-md p-1 transition-colors ${
            card.overlay.pinned
              ? 'bg-amber-50 text-amber-500 dark:bg-amber-500/15 dark:text-amber-400'
              : 'text-zinc-400 hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-[#232A3A] dark:hover:text-zinc-200'
          }`}
        >
          <Pin className={`h-3 w-3 ${card.overlay.pinned ? 'fill-current' : ''}`} />
        </button>

        <button
          type="button"
          onClick={() => onCyclePriority(card)}
          title={t.priority.cycleTooltip}
          className="rounded-md p-1 transition-colors hover:bg-zinc-100 dark:hover:bg-[#232A3A]"
        >
          <Flag className={`h-3 w-3 ${getFlagColor(card.overlay.priority)}`} />
        </button>

        {showReviewButton && (
          <button
            type="button"
            onClick={() => onMarkReviewed(card)}
            title={t.card.markReviewed}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10px] font-medium text-emerald-700 transition-colors hover:bg-emerald-50 dark:text-emerald-300 dark:hover:bg-emerald-500/15"
          >
            <CheckCheck className="h-3 w-3" />
            {!isCompact && <span>{t.card.markReviewed}</span>}
          </button>
        )}
      </div>

      {/* Top Meta Row: Running + Priority + Pinned indicator + Manual lane pill */}
      {(card.isRunning ||
        card.overlay.priority ||
        card.overlay.pinned ||
        card.isManualLane) && (
        <div className="mb-1 flex min-w-0 flex-wrap items-center gap-1.5 pr-7">
          {card.isRunning && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/14 dark:text-emerald-300"
              title={t.card.runningNow}
            >
              <LivePulseDot />
              <span>{t.card.runningNow}</span>
            </span>
          )}

          <PriorityBadge priority={card.overlay.priority} compact />

          {card.overlay.pinned && (
            <Pin
              className="h-3 w-3 shrink-0 fill-amber-500 text-amber-500 dark:fill-amber-400 dark:text-amber-400"
              aria-label={t.card.pin}
            />
          )}

          {card.isManualLane && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onResetManualLane(card);
              }}
              title={`${t.lanes.manualBadge} · ${t.lanes.resetAutoLane} (${t.lanes[card.autoLane]})`}
              className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-800 dark:bg-[#1D2230] dark:text-zinc-400 dark:hover:bg-[#272E40] dark:hover:text-zinc-200"
            >
              <span>{t.lanes.manualBadge}</span>
              <RotateCcw className="h-2.5 w-2.5" />
            </button>
          )}
        </div>
      )}

      {/* Title */}
      <h3
        className={`text-[13px] leading-snug font-semibold text-zinc-900 dark:text-zinc-100 ${
          isCompact ? 'line-clamp-1 pr-6' : 'line-clamp-2'
        }`}
      >
        {card.title || t.card.untitled}
      </h3>

      {/* Attention Reason Badges */}
      {card.attentionReasons.length > 0 && (
        <div className={`flex flex-wrap items-center gap-1 ${isCompact ? 'mt-1.5' : 'mt-2'}`}>
          {card.attentionReasons.slice(0, isCompact ? 1 : 3).map((reason) => (
            <AttentionReasonBadge key={reason} reason={reason} t={t} />
          ))}
          {isCompact && card.attentionReasons.length > 1 && (
            <span className="tabular-nums rounded bg-amber-500/10 px-1 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
              +{card.attentionReasons.length - 1}
            </span>
          )}
        </div>
      )}

      {/* Current Focus or 1-line Preview (hidden in compact mode for 2x vertical density) */}
      {!isCompact && (card.currentFocus || card.preview) && (
        <div className="mt-1.5 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
          {card.currentFocus && (
            <Compass className="mt-0.5 h-3.5 w-3.5 shrink-0 text-sky-500/80" />
          )}
          <p className="line-clamp-1 min-w-0 flex-1">
            {card.currentFocus || card.preview}
          </p>
        </div>
      )}

      {/* Compact update_steps progress bar */}
      {card.stepsTotal > 0 && (
        <div className={`flex items-center gap-2 ${isCompact ? 'mt-1.5' : 'mt-2'}`}>
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-[#1E2432]">
            <div
              className={`h-full rounded-full transition-all duration-300 ${
                progressPct === 100
                  ? 'bg-emerald-500'
                  : card.hasError
                    ? 'bg-rose-500'
                    : 'bg-sky-500'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="tabular-nums font-mono text-[10px] font-medium text-zinc-500 dark:text-zinc-400">
            {card.stepsCompleted}/{card.stepsTotal}
          </span>
        </div>
      )}

      {/* Footer: Workspace + Tags + Swarm/Subagent + Meta (ml-auto right aligned) */}
      <div
        className={`flex flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-zinc-100 dark:border-[#1B202C] ${
          isCompact ? 'mt-1.5 pt-1.5' : 'mt-2.5 pt-2'
        }`}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {card.workspace && (
            <span
              title={card.workspacePath || card.workspace}
              className="inline-flex max-w-[125px] items-center gap-1 truncate rounded bg-zinc-100/90 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-[#1B202C] dark:text-zinc-400"
            >
              <Folder className="h-2.5 w-2.5 shrink-0 text-zinc-400" />
              <span className="truncate">{card.workspace}</span>
            </span>
          )}

          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="max-w-[80px] truncate rounded bg-sky-500/8 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-500/12 dark:text-sky-300"
            >
              #{tag}
            </span>
          ))}
          {extraTagCount > 0 && (
            <span className="tabular-nums rounded bg-zinc-100 px-1 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-[#1E2432] dark:text-zinc-400">
              +{extraTagCount}
            </span>
          )}

          {card.swarm && (
            <span
              className="tabular-nums inline-flex items-center gap-1 rounded bg-sky-500/10 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-500/15 dark:text-sky-300"
              title={card.swarm.title || t.card.swarm}
            >
              <Network className="h-2.5 w-2.5" />
              <span>
                {card.swarm.workingCount > 0
                  ? `${card.swarm.workingCount}/${card.swarm.totalMembers}`
                  : card.swarm.totalMembers}
              </span>
            </span>
          )}

          {!card.swarm && card.subagentCount > 0 && (
            <span className="tabular-nums inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-[#1E2432] dark:text-zinc-300">
              <Users className="h-2.5 w-2.5" />
              <span>{card.subagentCount}</span>
            </span>
          )}

          {!isCompact && card.overlay.followUpAt && (
            <span
              className={`tabular-nums inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                followUpDue
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                  : 'bg-zinc-100 text-zinc-500 dark:bg-[#1E2432] dark:text-zinc-400'
              }`}
            >
              <CalendarClock className="h-2.5 w-2.5" />
              <span>{card.overlay.followUpAt.slice(5, 10)}</span>
            </span>
          )}
        </div>

        <div className="tabular-nums ml-auto flex shrink-0 items-center gap-2 text-[10.5px] text-zinc-400 dark:text-zinc-500">
          {!isCompact && card.artifactCount > 0 && (
            <span
              className="inline-flex items-center gap-0.5"
              title={`${card.artifactCount} ${t.card.artifacts}`}
            >
              <FileText className="h-2.5 w-2.5" />
              {card.artifactCount}
            </span>
          )}
          <span>
            {card.stepCount} {t.card.steps}
          </span>
          <span className="font-medium text-zinc-500 dark:text-zinc-400">
            {formatRelativeTime(card.lastModifiedAt, t)}
          </span>
        </div>
      </div>
    </article>
  );
}
