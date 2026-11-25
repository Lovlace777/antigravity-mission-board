import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ConversationCard, LaneId, Priority } from '@shared/types';
import { Check, CheckCheck, Pin, RotateCcw } from 'lucide-react';
import type { Dictionary } from '../i18n';
import { laneAccentDot } from './badges';

/** Ordered for quickest triage: Needs Attention first, then Running, Active, Stale, Archived */
const MOVE_MENU_LANES: LaneId[] = [
  'attention',
  'running',
  'active',
  'stale',
  'archived',
];

export interface TaskMoveMenuState {
  card: ConversationCard;
  x: number;
  y: number;
}

interface TaskMoveMenuProps {
  menu: TaskMoveMenuState | null;
  onClose: () => void;
  onMoveLane: (card: ConversationCard, targetLane: LaneId) => void;
  onResetManualLane: (card: ConversationCard) => void;
  onTogglePin: (card: ConversationCard) => void;
  onSetPriority: (card: ConversationCard, priority: Priority) => void;
  onMarkReviewed: (card: ConversationCard) => void;
  t: Dictionary;
}

export function TaskMoveMenu({
  menu,
  onClose,
  onMoveLane,
  onResetManualLane,
  onTogglePin,
  onSetPriority,
  onMarkReviewed,
  t,
}: TaskMoveMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  useLayoutEffect(() => {
    if (!menu) return;
    const pad = 8;
    const el = ref.current;
    const width = el?.offsetWidth || 208;
    const height = el?.offsetHeight || 296;
    const maxLeft = Math.max(pad, window.innerWidth - width - pad);
    const maxTop = Math.max(pad, window.innerHeight - height - pad);
    setPos({
      left: Math.min(Math.max(pad, menu.x), maxLeft),
      top: Math.min(Math.max(pad, menu.y), maxTop),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const onWindowBlur = () => onClose();
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [menu, onClose]);

  if (!menu) return null;

  const { card } = menu;
  const needsReview = card.attentionReasons.length > 0 || card.lane === 'attention';

  return (
    <div
      ref={ref}
      role="menu"
      data-testid="task-move-menu"
      style={{ left: pos.left, top: pos.top }}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className="agmb-modal-enter fixed z-50 w-[212px] overflow-hidden rounded-xl border border-[#1C1917]/[0.12] bg-white/98 p-1.5 text-xs text-[#1C1917] shadow-[0_16px_42px_-8px_rgba(28,25,23,0.25),0_2px_6px_rgba(28,25,23,0.06)] backdrop-blur-xl dark:border-white/[0.12] dark:bg-[#1C1C1A]/98 dark:text-[#F2F1EE] dark:shadow-[0_20px_50px_-8px_rgba(0,0,0,0.82)]"
    >
      {/* Move to lane section */}
      <div className="px-2 pt-0.5 pb-1 text-[10px] font-semibold tracking-wider text-[#969088] uppercase dark:text-[#6E6D68]">
        {t.moveMenu.moveTo}
      </div>

      <div className="space-y-0.5">
        {MOVE_MENU_LANES.map((lane) => {
          const isCurrent = card.lane === lane;
          const isAuto = card.autoLane === lane;
          return (
            <button
              key={lane}
              type="button"
              role="menuitem"
              data-testid={`move-menu-lane-${lane}`}
              onClick={() => {
                if (!isCurrent) onMoveLane(card, lane);
                onClose();
              }}
              className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] transition-colors ${
                isCurrent
                  ? 'bg-[#EFECE6] font-medium text-[#1C1917] dark:bg-[#282825] dark:text-[#F2F1EE]'
                  : 'text-[#44403C] hover:bg-[#F6F5F1] dark:text-[#D6D3CD] dark:hover:bg-[#242421]'
              }`}
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${laneAccentDot(lane)}`} />
                <span className="truncate">{t.lanes[lane]}</span>
              </span>
              <span className="flex shrink-0 items-center gap-1">
                {isAuto && (
                  <span className="text-[10px] text-[#969088] dark:text-[#6E6D68]">
                    {t.card.autoLabel}
                  </span>
                )}
                {isCurrent && <Check className="h-3.5 w-3.5 text-[#1C1917] dark:text-[#F2F1EE]" />}
              </span>
            </button>
          );
        })}

        {card.isManualLane && (
          <button
            type="button"
            role="menuitem"
            data-testid="move-menu-reset-auto"
            onClick={() => {
              onResetManualLane(card);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11.5px] font-medium text-[#57534E] transition-colors hover:bg-[#F6F5F1] hover:text-[#1C1917] dark:text-[#A1A09A] dark:hover:bg-[#242421] dark:hover:text-[#F2F1EE]"
          >
            <RotateCcw className="h-3 w-3 shrink-0" />
            <span>{t.lanes.resetAutoLane}</span>
          </button>
        )}
      </div>

      {/* Divider + Quick Actions */}
      <div className="my-1.5 border-t border-[#1C1917]/[0.07] dark:border-white/[0.07]" />

      {/* Priority inline picker */}
      <div className="flex items-center justify-between gap-1 px-2 py-1">
        <span className="text-[10.5px] text-[#8C867E] dark:text-[#787771]">
          {t.priority.label}
        </span>
        <div className="flex items-center gap-0.5">
          {(
            [
              { val: 'p0' as Priority, label: 'P0', tone: 'text-[#DC2626] dark:text-[#F87171]' },
              { val: 'p1' as Priority, label: 'P1', tone: 'text-[#B45309] dark:text-[#FBBF24]' },
              { val: 'p2' as Priority, label: 'P2', tone: 'text-[#57534E] dark:text-[#D6D3CD]' },
              { val: null as Priority, label: t.priority.none, tone: 'text-[#8C867E]' },
            ] as const
          ).map(({ val, label, tone }) => {
            const active = card.overlay.priority === val;
            return (
              <button
                key={label}
                type="button"
                onClick={() => {
                  onSetPriority(card, val);
                  onClose();
                }}
                className={`tabular-nums rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold transition-colors ${
                  active
                    ? 'bg-[#1C1917] text-[#F6F5F1] dark:bg-[#F2F1EE] dark:text-[#111110]'
                    : `hover:bg-[#F2F0EB] dark:hover:bg-[#262623] ${tone}`
                }`}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Pin & Mark Reviewed */}
      <div className="mt-0.5 space-y-0.5">
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onTogglePin(card);
            onClose();
          }}
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-[#44403C] transition-colors hover:bg-[#F6F5F1] dark:text-[#D6D3CD] dark:hover:bg-[#242421]"
        >
          <Pin className={`h-3.5 w-3.5 shrink-0 ${card.overlay.pinned ? 'fill-current' : ''}`} />
          <span>{card.overlay.pinned ? t.card.unpin : t.card.pin}</span>
        </button>

        {needsReview && (
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onMarkReviewed(card);
              onClose();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12px] font-medium text-[#15803D] transition-colors hover:bg-[#16A34A]/10 dark:text-[#4ADE80] dark:hover:bg-[#22C55E]/14"
          >
            <CheckCheck className="h-3.5 w-3.5 shrink-0" />
            <span>{t.card.markReviewed}</span>
          </button>
        )}
      </div>
    </div>
  );
}
