import { useMemo, useState } from 'react';
import type { ConversationCard as ConversationCardData, LaneId } from '@shared/types';
import { Archive, CheckCheck, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Dictionary } from '../i18n';
import { LivePulseDot, laneAccentDot, priorityRank } from './badges';
import { ConversationCard } from './ConversationCard';
import type { CardDensity, KanbanSortMode } from './TopBar';

const ACTIVE_LANES: LaneId[] = ['running', 'attention', 'active', 'stale'];

interface KanbanBoardProps {
  conversations: ConversationCardData[];
  selectedId: string | null;
  density: CardDensity;
  sortMode: KanbanSortMode;
  onSelectConversation: (id: string) => void;
  onMoveLane: (card: ConversationCardData, targetLane: LaneId) => void;
  onResetManualLane: (card: ConversationCardData) => void;
  onTogglePin: (card: ConversationCardData) => void;
  onMarkReviewed: (card: ConversationCardData) => void;
  onCyclePriority: (card: ConversationCardData) => void;
  onOpenMoveMenu: (card: ConversationCardData, x: number, y: number) => void;
  onMarkAllAttentionRead: (cards: ConversationCardData[]) => void;
  t: Dictionary;
}

function sortLaneCards(
  cards: ConversationCardData[],
  sortMode: KanbanSortMode,
): ConversationCardData[] {
  return [...cards].sort((a, b) => {
    if (a.overlay.pinned !== b.overlay.pinned) return a.overlay.pinned ? -1 : 1;

    if (sortMode === 'recent') {
      return Date.parse(b.lastModifiedAt) - Date.parse(a.lastModifiedAt);
    }
    if (sortMode === 'steps') {
      if (b.stepCount !== a.stepCount) return b.stepCount - a.stepCount;
      return Date.parse(b.lastModifiedAt) - Date.parse(a.lastModifiedAt);
    }
    if (sortMode === 'priority') {
      const pDiff = priorityRank(b.overlay.priority) - priorityRank(a.overlay.priority);
      if (pDiff !== 0) return pDiff;
      return Date.parse(b.lastModifiedAt) - Date.parse(a.lastModifiedAt);
    }

    const pDiff = priorityRank(b.overlay.priority) - priorityRank(a.overlay.priority);
    if (pDiff !== 0) return pDiff;
    const urgency = (c: ConversationCardData) =>
      (c.hasError ? 4 : 0) +
      (c.hasPendingQuestion ? 3 : 0) +
      (c.pendingFeedbackCount > 0 ? 2 : 0) +
      (c.isRunning ? 1 : 0);
    const uDiff = urgency(b) - urgency(a);
    if (uDiff !== 0) return uDiff;
    return Date.parse(b.lastModifiedAt) - Date.parse(a.lastModifiedAt);
  });
}

export function KanbanBoard({
  conversations,
  selectedId,
  density,
  sortMode,
  onSelectConversation,
  onMoveLane,
  onResetManualLane,
  onTogglePin,
  onMarkReviewed,
  onCyclePriority,
  onOpenMoveMenu,
  onMarkAllAttentionRead,
  t,
}: KanbanBoardProps) {
  const [archivedExpanded, setArchivedExpanded] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverLane, setDragOverLane] = useState<LaneId | null>(null);

  const grouped = useMemo(() => {
    const map: Record<LaneId, ConversationCardData[]> = {
      running: [],
      attention: [],
      active: [],
      stale: [],
      archived: [],
    };
    for (const card of conversations) {
      map[card.lane].push(card);
    }
    for (const lane of Object.keys(map) as LaneId[]) {
      map[lane] = sortLaneCards(map[lane], sortMode);
    }
    return map;
  }, [conversations, sortMode]);

  const cardById = useMemo(() => {
    const m = new Map<string, ConversationCardData>();
    for (const c of conversations) m.set(c.id, c);
    return m;
  }, [conversations]);

  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggingId(id);
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragEnd = () => {
    setDraggingId(null);
    setDragOverLane(null);
  };

  const handleDragOver = (e: React.DragEvent, lane: LaneId) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverLane !== lane) {
      setDragOverLane(lane);
    }
  };

  const handleDrop = (e: React.DragEvent, targetLane: LaneId) => {
    e.preventDefault();
    const id = e.dataTransfer.getData('text/plain') || draggingId;
    setDraggingId(null);
    setDragOverLane(null);
    if (!id) return;
    const card = cardById.get(id);
    if (!card || card.lane === targetLane) return;
    onMoveLane(card, targetLane);
  };

  const laneDescription = (lane: LaneId): string => {
    switch (lane) {
      case 'running':
        return t.lanes.runningDesc;
      case 'attention':
        return t.lanes.attentionDesc;
      case 'active':
        return t.lanes.activeDesc;
      case 'stale':
        return t.lanes.staleDesc;
      case 'archived':
        return t.lanes.archivedDesc;
    }
  };

  const archivedCards = grouped.archived;

  return (
    <div className="flex min-h-[calc(100vh-195px)] items-stretch gap-3.5 overflow-x-auto pb-4">
      {/* 4 Active Editorial Column Wells */}
      <div className="grid min-w-[1040px] flex-1 grid-cols-4 gap-3.5">
        {ACTIVE_LANES.map((lane) => {
          const cards = grouped[lane];
          const isDropTarget = dragOverLane === lane;

          return (
            <section
              key={lane}
              onDragOver={(e) => handleDragOver(e, lane)}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node)) {
                  setDragOverLane((prev) => (prev === lane ? null : prev));
                }
              }}
              onDrop={(e) => handleDrop(e, lane)}
              aria-label={t.lanes[lane]}
              className={`flex flex-col rounded-2xl border transition-colors ${
                isDropTarget
                  ? 'border-dashed border-[#1C1917]/40 bg-[#EAE6DE] dark:border-[#F2F1EE]/40 dark:bg-[#1E1E1C]'
                  : 'border-[#1C1917]/[0.05] bg-[#EFECE6]/70 dark:border-white/[0.045] dark:bg-[#171715]'
              }`}
            >
              {/* Quiet Column Header */}
              <div
                className="flex items-center justify-between gap-2 px-3.5 pt-3 pb-2"
                title={laneDescription(lane)}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {lane === 'running' && cards.length > 0 ? (
                    <LivePulseDot />
                  ) : (
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${laneAccentDot(lane)}`} />
                  )}
                  <h2 className="truncate text-xs font-semibold tracking-[-0.01em] text-[#44403C] dark:text-[#D6D3CD]">
                    {t.lanes[lane]}
                  </h2>
                  <span className="tabular-nums text-[11px] text-[#969088] dark:text-[#6E6D68]">
                    {cards.length}
                  </span>
                </div>

                {lane === 'attention' && cards.length > 0 && (
                  <button
                    type="button"
                    onClick={() => onMarkAllAttentionRead(cards)}
                    className="inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium whitespace-nowrap text-[#57534E] transition-colors hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:text-[#9F9E98] dark:hover:bg-white/[0.07] dark:hover:text-[#F2F1EE]"
                  >
                    <CheckCheck className="h-3 w-3" />
                    <span>{t.lanes.markAllRead}</span>
                  </button>
                )}
              </div>

              {/* Cards Stack */}
              <div
                className={`flex flex-1 flex-col overflow-y-auto px-2.5 pb-2.5 ${
                  density === 'compact' ? 'gap-2' : 'gap-2.5'
                }`}
              >
                {isDropTarget && (
                  <div className="rounded-xl border border-dashed border-[#1C1917]/30 bg-white/70 py-2 text-center text-[11px] font-medium text-[#44403C] dark:border-white/30 dark:bg-[#222220] dark:text-[#D6D3CD]">
                    {t.lanes.dropHere}
                  </div>
                )}

                {cards.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-xl border border-dashed border-[#1C1917]/[0.08] py-10 text-center text-xs text-[#A8A29E] dark:border-white/[0.06] dark:text-[#575652]">
                    <span>{t.lanes.emptyColumn}</span>
                  </div>
                ) : (
                  cards.map((card) => (
                    <ConversationCard
                      key={card.id}
                      card={card}
                      density={density}
                      isDragging={draggingId === card.id}
                      isSelected={selectedId === card.id}
                      onSelect={onSelectConversation}
                      onTogglePin={onTogglePin}
                      onMarkReviewed={onMarkReviewed}
                      onCyclePriority={onCyclePriority}
                      onResetManualLane={onResetManualLane}
                      onOpenMoveMenu={onOpenMoveMenu}
                      onDragStart={handleDragStart}
                      onDragEnd={handleDragEnd}
                      t={t}
                    />
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>

      {/* 5th Column: Archived (Quiet collapsible narrow rail by default) */}
      {archivedExpanded ? (
        <section
          onDragOver={(e) => handleDragOver(e, 'archived')}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDragOverLane((prev) => (prev === 'archived' ? null : prev));
            }
          }}
          onDrop={(e) => handleDrop(e, 'archived')}
          aria-label={t.lanes.archived}
          className={`flex w-[296px] shrink-0 flex-col rounded-2xl border transition-all ${
            dragOverLane === 'archived'
              ? 'border-dashed border-[#1C1917]/40 bg-[#EAE6DE] dark:border-[#F2F1EE]/40 dark:bg-[#1E1E1C]'
              : 'border-[#1C1917]/[0.05] bg-[#EFECE6]/55 dark:border-white/[0.045] dark:bg-[#151513]'
          }`}
        >
          <div className="flex items-center justify-between px-3.5 pt-3 pb-2">
            <div className="flex items-center gap-2">
              <Archive className="h-3.5 w-3.5 text-[#8C867E]" />
              <h2 className="text-xs font-semibold text-[#57534E] dark:text-[#9F9E98]">
                {t.lanes.archived}
              </h2>
              <span className="tabular-nums text-[11px] text-[#969088] dark:text-[#666560]">
                {archivedCards.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setArchivedExpanded(false)}
              title={t.lanes.collapseArchived}
              className="rounded-md p-1 text-[#8C867E] transition-colors hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div
            className={`flex flex-1 flex-col overflow-y-auto px-2.5 pb-2.5 ${
              density === 'compact' ? 'gap-2' : 'gap-2.5'
            }`}
          >
            {dragOverLane === 'archived' && (
              <div className="rounded-xl border border-dashed border-[#1C1917]/30 bg-white/70 py-2 text-center text-[11px] font-medium text-[#44403C] dark:border-white/30 dark:bg-[#222220] dark:text-[#D6D3CD]">
                {t.lanes.dropHere}
              </div>
            )}
            {archivedCards.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-[#1C1917]/[0.08] py-10 text-xs text-[#A8A29E] dark:border-white/[0.06] dark:text-[#575652]">
                {t.lanes.emptyColumn}
              </div>
            ) : (
              archivedCards.map((card) => (
                <ConversationCard
                  key={card.id}
                  card={card}
                  density={density}
                  isDragging={draggingId === card.id}
                  isSelected={selectedId === card.id}
                  onSelect={onSelectConversation}
                  onTogglePin={onTogglePin}
                  onMarkReviewed={onMarkReviewed}
                  onCyclePriority={onCyclePriority}
                  onResetManualLane={onResetManualLane}
                  onOpenMoveMenu={onOpenMoveMenu}
                  onDragStart={handleDragStart}
                  onDragEnd={handleDragEnd}
                  t={t}
                />
              ))
            )}
          </div>
        </section>
      ) : (
        <aside
          onDragOver={(e) => handleDragOver(e, 'archived')}
          onDragLeave={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget as Node)) {
              setDragOverLane((prev) => (prev === 'archived' ? null : prev));
            }
          }}
          onDrop={(e) => handleDrop(e, 'archived')}
          className={`flex w-11 shrink-0 flex-col items-center rounded-2xl border py-3 transition-all ${
            dragOverLane === 'archived'
              ? 'w-14 border-dashed border-[#1C1917]/40 bg-[#EAE6DE] dark:border-[#F2F1EE]/40 dark:bg-[#1E1E1C]'
              : 'border-[#1C1917]/[0.05] bg-[#EFECE6]/55 hover:border-[#1C1917]/[0.12] hover:bg-[#EAE6DE]/80 dark:border-white/[0.045] dark:bg-[#151513] dark:hover:border-white/[0.1] dark:hover:bg-[#1A1A18]'
          }`}
        >
          <button
            type="button"
            onClick={() => setArchivedExpanded(true)}
            title={t.lanes.expandArchived}
            className="flex h-full w-full flex-col items-center gap-3 text-[#78716C] transition-colors hover:text-[#1C1917] dark:text-[#787771] dark:hover:text-[#F2F1EE]"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <Archive className="h-3.5 w-3.5 shrink-0" />
            <span className="tabular-nums text-[11px] font-medium">
              {archivedCards.length}
            </span>
            <span
              className="mt-1 text-[11px] font-medium tracking-wide whitespace-nowrap"
              style={{ writingMode: 'vertical-rl' }}
            >
              {t.lanes.archived}
            </span>
          </button>
        </aside>
      )}
    </div>
  );
}
