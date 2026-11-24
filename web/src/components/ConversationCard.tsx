import type { ConversationCard as ConversationCardData } from '@shared/types';
import {
  CalendarClock,
  CheckCheck,
  Compass,
  FileText,
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

interface ConversationCardProps {
  card: ConversationCardData;
  isDragging?: boolean;
  isSelected?: boolean;
  onSelect: (id: string) => void;
  onTogglePin: (card: ConversationCardData) => void;
  onMarkReviewed: (card: ConversationCardData) => void;
  onResetManualLane: (card: ConversationCardData) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  t: Dictionary;
}

export function ConversationCard({
  card,
  isDragging = false,
  isSelected = false,
  onSelect,
  onTogglePin,
  onMarkReviewed,
  onResetManualLane,
  onDragStart,
  onDragEnd,
  t,
}: ConversationCardProps) {
  const showReviewButton =
    card.attentionReasons.length > 0 || card.lane === 'attention';
  const progressPct =
    card.stepsTotal > 0
      ? Math.min(100, Math.round((card.stepsCompleted / card.stepsTotal) * 100))
      : 0;
  const visibleTags = card.overlay.tags.slice(0, 2);
  const extraTagCount = Math.max(0, card.overlay.tags.length - 2);
  const followUpDue = isFollowUpDue(card.overlay.followUpAt);

  // Subtle top/left accent styling for high-signal scanning
  const borderAccent = isSelected
    ? 'border-sky-500/80 ring-2 ring-sky-500/15 dark:border-sky-400/70'
    : card.overlay.priority === 'p0'
      ? 'border-rose-300/80 hover:border-rose-400 dark:border-rose-500/35 dark:hover:border-rose-400/60'
      : card.isRunning
        ? 'border-emerald-300/80 hover:border-emerald-400 dark:border-emerald-500/35 dark:hover:border-emerald-400/55'
        : 'border-zinc-200/90 hover:border-zinc-300 dark:border-[#222733] dark:hover:border-[#343C4F]';

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
      className={`group relative cursor-pointer rounded-lg border bg-white p-3 shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-all select-none hover:shadow-[0_3px_10px_rgba(16,24,40,0.06)] dark:bg-[#13161D] dark:shadow-none dark:hover:bg-[#161A23] ${borderAccent} ${
        isDragging ? 'opacity-40 scale-[0.98]' : ''
      }`}
    >
      {/* Top Row: Priority + Running indicator + Manual lane pill + Quick Actions */}
      <div className="flex items-center justify-between gap-1.5">
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          {card.isRunning && (
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
              title={t.card.runningNow}
            >
              <LivePulseDot />
              <span>{t.card.runningNow}</span>
            </span>
          )}
          <PriorityBadge priority={card.overlay.priority} compact />
          {card.isManualLane && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onResetManualLane(card);
              }}
              title={`${t.lanes.manualBadge} · ${t.lanes.resetAutoLane} (${t.lanes[card.autoLane]})`}
              className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 transition-colors hover:bg-zinc-200 hover:text-zinc-800 dark:bg-[#1E2330] dark:text-zinc-400 dark:hover:bg-[#282F40] dark:hover:text-zinc-200"
            >
              <span>{t.lanes.manualBadge}</span>
              <RotateCcw className="h-2.5 w-2.5" />
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {showReviewButton && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onMarkReviewed(card);
              }}
              title={t.card.markReviewed}
              className="inline-flex items-center gap-1 rounded border border-zinc-200/80 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 opacity-0 transition-all group-hover:opacity-100 hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 focus:opacity-100 dark:border-[#2A3040] dark:bg-[#1A1F2B] dark:text-zinc-300 dark:hover:border-emerald-500/40 dark:hover:bg-emerald-500/15 dark:hover:text-emerald-300"
            >
              <CheckCheck className="h-3 w-3" />
              <span>{t.card.markReviewed}</span>
            </button>
          )}

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onTogglePin(card);
            }}
            title={card.overlay.pinned ? t.card.unpin : t.card.pin}
            className={`rounded p-1 transition-all ${
              card.overlay.pinned
                ? 'text-amber-500 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-500/10'
                : 'text-zinc-300 opacity-0 group-hover:opacity-100 hover:bg-zinc-100 hover:text-zinc-600 focus:opacity-100 dark:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300'
            }`}
          >
            <Pin
              className={`h-3.5 w-3.5 ${card.overlay.pinned ? 'fill-current' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Title */}
      <h3 className="mt-1.5 line-clamp-2 text-[13px] leading-snug font-semibold text-zinc-900 dark:text-zinc-100">
        {card.title || t.card.untitled}
      </h3>

      {/* Attention Reason Badges */}
      {card.attentionReasons.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center gap-1">
          {card.attentionReasons.slice(0, 3).map((reason) => (
            <AttentionReasonBadge key={reason} reason={reason} t={t} />
          ))}
        </div>
      )}

      {/* Current Focus or 1-line Preview */}
      {(card.currentFocus || card.preview) && (
        <div className="mt-2 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-zinc-500 dark:text-zinc-400">
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
        <div className="mt-2.5 flex items-center gap-2">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-100 dark:bg-[#1E2330]">
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

      {/* Footer: Workspace + Tags + Swarm/Subagent + Meta */}
      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-t border-zinc-100 pt-2 dark:border-[#1D222E]">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {card.workspace && (
            <span
              title={card.workspacePath || card.workspace}
              className="inline-flex max-w-[130px] items-center gap-1 truncate rounded bg-zinc-100/90 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600 dark:bg-[#1B202C] dark:text-zinc-400"
            >
              <Folder className="h-2.5 w-2.5 shrink-0 text-zinc-400" />
              <span className="truncate">{card.workspace}</span>
            </span>
          )}

          {visibleTags.map((tag) => (
            <span
              key={tag}
              className="max-w-[84px] truncate rounded bg-sky-50/80 px-1.5 py-0.5 text-[10px] font-medium text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
            >
              #{tag}
            </span>
          ))}
          {extraTagCount > 0 && (
            <span className="tabular-nums rounded bg-zinc-100 px-1 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-[#1E2330] dark:text-zinc-400">
              +{extraTagCount}
            </span>
          )}

          {card.swarm && (
            <span
              className="tabular-nums inline-flex items-center gap-1 rounded bg-indigo-50/80 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 dark:bg-indigo-500/12 dark:text-indigo-300"
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
            <span className="tabular-nums inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-[#1E2330] dark:text-zinc-300">
              <Users className="h-2.5 w-2.5" />
              <span>{card.subagentCount}</span>
            </span>
          )}

          {card.overlay.followUpAt && (
            <span
              className={`tabular-nums inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                followUpDue
                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                  : 'bg-zinc-100 text-zinc-500 dark:bg-[#1E2330] dark:text-zinc-400'
              }`}
            >
              <CalendarClock className="h-2.5 w-2.5" />
              <span>{card.overlay.followUpAt.slice(5, 10)}</span>
            </span>
          )}
        </div>

        <div className="tabular-nums ml-auto flex shrink-0 items-center gap-2 text-[10.5px] text-zinc-400 dark:text-zinc-500">
          {card.artifactCount > 0 && (
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
