import type { ConversationCard as ConversationCardData } from '@shared/types';
import {
  ArrowLeftRight,
  CalendarClock,
  CheckCheck,
  FileText,
  Flag,
  Network,
  Pin,
  RotateCcw,
  Users,
} from 'lucide-react';
import type { Dictionary } from '../i18n';
import { formatRelativeTime, isFollowUpDue, resolveDistinctSubtitle } from '../utils';
import {
  LivePulseDot,
  PriorityBadge,
  primaryAttentionReason,
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
  onOpenMoveMenu: (card: ConversationCardData, x: number, y: number) => void;
  onDragStart: (e: React.DragEvent, id: string) => void;
  onDragEnd: () => void;
  t: Dictionary;
}

function getFlagColor(priority: ConversationCardData['overlay']['priority']): string {
  if (priority === 'p0') return 'text-[#DC2626] dark:text-[#F87171]';
  if (priority === 'p1') return 'text-[#D97706] dark:text-[#FBBF24]';
  if (priority === 'p2') return 'text-[#57534E] dark:text-[#D6D3CD]';
  return 'text-[#A8A29E] dark:text-[#666560]';
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
  onOpenMoveMenu,
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
  const topReason = primaryAttentionReason(card.attentionReasons);
  const secondaryCopy = resolveDistinctSubtitle(
    card.title,
    card.currentFocus,
    card.preview,
  );

  const dotColor = card.hasError
    ? 'bg-[#DC2626] dark:bg-[#EF4444]'
    : card.lane === 'attention' || card.attentionReasons.length > 0
      ? 'bg-[#D97706] dark:bg-[#F59E0B]'
      : card.lane === 'active'
        ? 'bg-[#78716C] dark:bg-[#8C8B85]'
        : 'bg-[#D6D3D1] dark:bg-[#4A4945]';

  const reasonToneClass =
    topReason === 'error'
      ? 'text-[#DC2626] dark:text-[#F87171]'
      : 'text-[#B45309] dark:text-[#FBBF24]';

  return (
    <article
      draggable
      onDragStart={(e) => onDragStart(e, card.id)}
      onDragEnd={onDragEnd}
      onClick={() => onSelect(card.id)}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onOpenMoveMenu(card, e.clientX, e.clientY);
      }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(card.id);
        }
      }}
      className={`agmb-card group relative cursor-pointer rounded-xl px-3.5 transition-all duration-150 select-none hover:-translate-y-[1px] ${
        isCompact ? 'py-2.5' : 'py-3'
      } ${
        isSelected
          ? 'ring-2 ring-[#1C1917]/20 dark:ring-[#F2F1EE]/25'
          : ''
      } ${isDragging ? 'scale-[0.985] opacity-40' : ''}`}
    >
      {/* Quiet Hover Quick-Action Bar (fades in cleanly on top-right) */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="absolute top-2 right-2 z-10 flex items-center gap-0.5 rounded-lg border border-[#1C1917]/[0.1] bg-white/95 p-0.5 opacity-0 shadow-sm backdrop-blur-md transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100 dark:border-white/[0.12] dark:bg-[#242421]/95"
      >
        <button
          type="button"
          data-testid={`card-move-btn-${card.id}`}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            onOpenMoveMenu(card, rect.left - 120, rect.bottom + 4);
          }}
          title={t.moveMenu.triggerTooltip}
          aria-label={t.moveMenu.triggerTooltip}
          className="rounded-md p-1 text-[#8C867E] transition-colors hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
        >
          <ArrowLeftRight className="h-3 w-3" />
        </button>

        <button
          type="button"
          onClick={() => onTogglePin(card)}
          title={card.overlay.pinned ? t.card.unpin : t.card.pin}
          className={`rounded-md p-1 transition-colors ${
            card.overlay.pinned
              ? 'text-[#1C1917] dark:text-[#F2F1EE]'
              : 'text-[#8C867E] hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]'
          }`}
        >
          <Pin className={`h-3 w-3 ${card.overlay.pinned ? 'fill-current' : ''}`} />
        </button>

        <button
          type="button"
          onClick={() => onCyclePriority(card)}
          title={t.priority.cycleTooltip}
          className="rounded-md p-1 transition-colors hover:bg-[#1C1917]/[0.06] dark:hover:bg-white/[0.08]"
        >
          <Flag className={`h-3 w-3 ${getFlagColor(card.overlay.priority)}`} />
        </button>

        {showReviewButton && (
          <button
            type="button"
            onClick={() => onMarkReviewed(card)}
            title={t.card.markReviewed}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] font-medium text-[#15803D] transition-colors hover:bg-[#16A34A]/10 dark:text-[#4ADE80] dark:hover:bg-[#22C55E]/14"
          >
            <CheckCheck className="h-3 w-3" />
            {!isCompact && <span>{t.card.markReviewed}</span>}
          </button>
        )}
      </div>

      {/* LAYER 1: Top Meta Line (6px dot + plain monospace workspace + right-aligned time & minimal markers) */}
      <div className="flex items-center justify-between gap-2 text-[11px]">
        <div className="flex min-w-0 items-center gap-1.5">
          {card.isRunning ? (
            <LivePulseDot />
          ) : (
            <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotColor}`} />
          )}

          {card.workspace && (
            <span
              title={card.workspacePath || card.workspace}
              className="truncate text-[11px] text-[#78716C] dark:text-[#8C8B85]"
            >
              {card.workspace}
            </span>
          )}

          {card.isManualLane && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onResetManualLane(card);
              }}
              title={`${t.lanes.manualBadge} · ${t.lanes.resetAutoLane} (${t.lanes[card.autoLane]})`}
              className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-[#A8A29E] transition-colors hover:text-[#1C1917] dark:text-[#666560] dark:hover:text-[#F2F1EE]"
            >
              <span>· {t.lanes.manualBadge}</span>
              <RotateCcw className="h-2.5 w-2.5" />
            </button>
          )}
        </div>

        <div className="tabular-nums flex shrink-0 items-center gap-1.5 text-[#8C867E] transition-opacity group-hover:opacity-0 dark:text-[#6E6D68]">
          {card.overlay.pinned && (
            <Pin
              className="h-2.5 w-2.5 fill-current text-[#57534E] dark:text-[#A1A09A]"
              aria-label={t.card.pin}
            />
          )}
          <PriorityBadge priority={card.overlay.priority} compact />
          <span className="text-[11px]">{formatRelativeTime(card.lastModifiedAt, t)}</span>
        </div>
      </div>

      {/* LAYER 2: Core Content — Clean Editorial Title + ONE concise secondary status/focus line */}
      <h3
        className={`mt-1.5 text-[13.5px] leading-[1.38] font-medium tracking-[-0.012em] text-[#1C1917] dark:text-[#F2F1EE] ${
          isCompact ? 'line-clamp-1' : 'line-clamp-2'
        }`}
      >
        {card.title || t.card.untitled}
      </h3>

      {!isCompact && (topReason || secondaryCopy) && (
        <p className="mt-1.5 line-clamp-1 text-[12px] leading-[1.45] text-[#57534E] dark:text-[#9F9E98]">
          {topReason && (
            <span className={`font-medium ${reasonToneClass}`}>
              {t.attentionReasons[topReason]}
            </span>
          )}
          {topReason && secondaryCopy && (
            <span className="mx-1 text-[#A8A29E] dark:text-[#666560]">·</span>
          )}
          {secondaryCopy && <span>{secondaryCopy}</span>}
        </p>
      )}

      {isCompact && topReason && (
        <p className={`mt-1 truncate text-[11px] font-medium ${reasonToneClass}`}>
          {t.attentionReasons[topReason]}
        </p>
      )}

      {/* LAYER 3: Quiet Footer (whisper-thin 2px monochrome progress track + plain metadata) */}
      {(card.stepsTotal > 0 ||
        visibleTags.length > 0 ||
        card.swarm ||
        card.subagentCount > 0 ||
        card.artifactCount > 0 ||
        card.overlay.followUpAt ||
        card.stepCount > 0) && (
        <div className={isCompact ? 'mt-2 space-y-1.5' : 'mt-2.5 space-y-2'}>
          {card.stepsTotal > 0 && (
            <div className="flex items-center gap-2">
              <div className="h-[2px] flex-1 overflow-hidden rounded-full bg-[#1C1917]/[0.08] dark:bg-white/[0.08]">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    card.hasError
                      ? 'bg-[#DC2626] dark:bg-[#EF4444]'
                      : progressPct === 100
                        ? 'bg-[#16A34A] dark:bg-[#22C55E]'
                        : 'bg-[#1C1917] dark:bg-[#E7E5E0]'
                  }`}
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              <span className="tabular-nums text-[10px] text-[#78716C] dark:text-[#8C8B85]">
                {card.stepsCompleted}/{card.stepsTotal}
              </span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-[#8C867E] dark:text-[#73726C]">
            {visibleTags.map((tag) => (
              <span key={tag} className="max-w-[96px] truncate">
                #{tag}
              </span>
            ))}
            {extraTagCount > 0 && (
              <span className="tabular-nums text-[10.5px]">+{extraTagCount}</span>
            )}

            {!isCompact && card.overlay.followUpAt && (
              <span
                className={`tabular-nums inline-flex items-center gap-1 ${
                  followUpDue
                    ? 'font-medium text-[#DC2626] dark:text-[#F87171]'
                    : ''
                }`}
              >
                <CalendarClock className="h-3 w-3" />
                <span>{card.overlay.followUpAt.slice(5, 10)}</span>
              </span>
            )}

            <div className="tabular-nums ml-auto flex shrink-0 items-center gap-2.5">
              {card.swarm && (
                <span
                  className="inline-flex items-center gap-1 text-[10.5px] text-[#57534E] dark:text-[#A1A09A]"
                  title={card.swarm.title || t.card.swarm}
                >
                  <Network className="h-3 w-3 opacity-70" />
                  <span>
                    {card.swarm.workingCount > 0
                      ? `${card.swarm.workingCount}/${card.swarm.totalMembers}`
                      : card.swarm.totalMembers}
                  </span>
                </span>
              )}

              {!card.swarm && card.subagentCount > 0 && (
                <span className="inline-flex items-center gap-1 text-[10.5px]">
                  <Users className="h-3 w-3 opacity-70" />
                  <span>{card.subagentCount}</span>
                </span>
              )}

              {!isCompact && card.artifactCount > 0 && (
                <span
                  className="inline-flex items-center gap-0.5 text-[10.5px]"
                  title={`${card.artifactCount} ${t.card.artifacts}`}
                >
                  <FileText className="h-3 w-3 opacity-70" />
                  {card.artifactCount}
                </span>
              )}

              <span className="text-[10.5px]">
                {card.stepCount} {t.card.steps}
              </span>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}
