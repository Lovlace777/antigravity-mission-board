import { useMemo, useState } from 'react';
import type { ConversationCard as ConversationCardData, LaneId } from '@shared/types';
import { Archive, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Dictionary } from '../i18n';
import { LivePulseDot, laneAccentDot, priorityRank } from './badges';
import { ConversationCard } from './ConversationCard';

const ACTIVE_LANES: LaneId[] = ['running', 'attention', 'active', 'stale'];

interface KanbanBoardProps {
  conversations: ConversationCardData[];
  selectedId: string | null;
  onSelectConversation: (id: string) => void;
  onMoveLane: (card: ConversationCardData, targetLane: LaneId) => void;
  onResetManualLane: (card: ConversationCardData) => void;
  onTogglePin: (card: ConversationCardData) => void;
  onMarkReviewed: (card: ConversationCardData) => void;
  t: Dictionary;
}

function sortLaneCards(cards: ConversationCardData[]): ConversationCardData[] {
  return [...cards].sort((a, b) => {
    if (a.overlay.pinned !== b.overlay.pinned) return a.overlay.pinned ? -1 : 1;
    const pDiff = priorityRank(b.overlay.priority) - priorityRank(a.overlay.priority);
    if (pDiff !== 0) return pDiff;
    return Date.parse(b.lastModifiedAt) - Date.parse(a.lastModifiedAt);
  });
}

export function KanbanBoard({
  conversations,
  selectedId,
  onSelectConversation,
  onMoveLane,
  onResetManualLane,
  onTogglePin,
  onMarkReviewed,
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
      map[lane] = sortLaneCards(map[lane]);
    }
    return map;
  }, [conversations]);

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
    <div className="flex min-h-[calc(100vh-225px)] items-stretch gap-3 overflow-x-auto pb-4">
      {/* 4 Active Columns with generous breathing room */}
      <div className="grid min-w-[1060px] flex-1 grid-cols-4 gap-3">
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
              className={`flex flex-col rounded-xl border transition-colors ${
                isDropTarget
                  ? 'border-dashed border-sky-500 bg-sky-50/60 dark:border-sky-400 dark:bg-sky-500/8'
                  : 'border-zinc-200/75 bg-zinc-100/55 dark:border-[#1E2330] dark:bg-[#0F1218]/90'
              }`}
            >
              {/* Column Header */}
              <div
                className="flex items-center justify-between border-b border-zinc-200/60 px-3 py-2.5 dark:border-[#1E2330]"
                title={laneDescription(lane)}
              >
                <div className="flex min-w-0 items-center gap-2">
                  {lane === 'running' && cards.length > 0 ? (
                    <LivePulseDot />
                  ) : (
                    <span className={`h-2 w-2 shrink-0 rounded-full ${laneAccentDot(lane)}`} />
                  )}
                  <h2 className="truncate text-xs font-semibold tracking-tight text-zinc-800 dark:text-zinc-200">
                    {t.lanes[lane]}
                  </h2>
                </div>
                <span className="tabular-nums rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-600 ring-1 ring-zinc-200/80 dark:bg-[#171B24] dark:text-zinc-400 dark:ring-[#262C3B]">
                  {cards.length}
                </span>
              </div>

              {/* Cards Stack */}
              <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">
                {isDropTarget && (
                  <div className="rounded-lg border border-dashed border-sky-400 bg-sky-50/70 py-2 text-center text-[11px] font-medium text-sky-700 dark:border-sky-500/60 dark:bg-sky-500/10 dark:text-sky-300">
                    {t.lanes.dropHere}
                  </div>
                )}

                {cards.length === 0 ? (
                  <div className="flex flex-1 flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200/80 py-10 text-center text-xs text-zinc-400 dark:border-[#222733] dark:text-zinc-600">
                    <span>{t.lanes.emptyColumn}</span>
                  </div>
                ) : (
                  cards.map((card) => (
                    <ConversationCard
                      key={card.id}
                      card={card}
                      isDragging={draggingId === card.id}
                      isSelected={selectedId === card.id}
                      onSelect={onSelectConversation}
                      onTogglePin={onTogglePin}
                      onMarkReviewed={onMarkReviewed}
                      onResetManualLane={onResetManualLane}
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

      {/* 5th Column: Archived (Collapsible narrow rail by default) */}
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
          className={`flex w-[300px] shrink-0 flex-col rounded-xl border transition-all ${
            dragOverLane === 'archived'
              ? 'border-dashed border-sky-500 bg-sky-50/60 dark:border-sky-400 dark:bg-sky-500/8'
              : 'border-zinc-200/75 bg-zinc-100/40 dark:border-[#1E2330] dark:bg-[#0E1016]'
          }`}
        >
          <div className="flex items-center justify-between border-b border-zinc-200/60 px-3 py-2.5 dark:border-[#1E2330]">
            <div className="flex items-center gap-2">
              <Archive className="h-3.5 w-3.5 text-zinc-400" />
              <h2 className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">
                {t.lanes.archived}
              </h2>
              <span className="tabular-nums rounded-full bg-white px-2 py-0.5 text-[11px] font-semibold text-zinc-500 ring-1 ring-zinc-200/80 dark:bg-[#171B24] dark:text-zinc-400 dark:ring-[#262C3B]">
                {archivedCards.length}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setArchivedExpanded(false)}
              title={t.lanes.collapseArchived}
              className="rounded p-1 text-zinc-400 transition-colors hover:bg-zinc-200/60 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-2.5">
            {dragOverLane === 'archived' && (
              <div className="rounded-lg border border-dashed border-sky-400 bg-sky-50/70 py-2 text-center text-[11px] font-medium text-sky-700 dark:border-sky-500/60 dark:bg-sky-500/10 dark:text-sky-300">
                {t.lanes.dropHere}
              </div>
            )}
            {archivedCards.length === 0 ? (
              <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-zinc-200/80 py-10 text-xs text-zinc-400 dark:border-[#222733] dark:text-zinc-600">
                {t.lanes.emptyColumn}
              </div>
            ) : (
              archivedCards.map((card) => (
                <ConversationCard
                  key={card.id}
                  card={card}
                  isDragging={draggingId === card.id}
                  isSelected={selectedId === card.id}
                  onSelect={onSelectConversation}
                  onTogglePin={onTogglePin}
                  onMarkReviewed={onMarkReviewed}
                  onResetManualLane={onResetManualLane}
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
          className={`flex w-11 shrink-0 flex-col items-center rounded-xl border py-3 transition-all ${
            dragOverLane === 'archived'
              ? 'w-14 border-dashed border-sky-500 bg-sky-50/70 dark:border-sky-400 dark:bg-sky-500/12'
              : 'border-zinc-200/75 bg-zinc-100/45 hover:border-zinc-300 hover:bg-zinc-100/80 dark:border-[#1E2330] dark:bg-[#0E1016] dark:hover:border-[#2E3546]'
          }`}
        >
          <button
            type="button"
            onClick={() => setArchivedExpanded(true)}
            title={t.lanes.expandArchived}
            className="flex h-full w-full flex-col items-center gap-3 text-zinc-500 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            <ChevronLeft className="h-4 w-4 shrink-0" />
            <Archive className="h-3.5 w-3.5 shrink-0" />
            <span className="tabular-nums rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold text-zinc-600 ring-1 ring-zinc-200/80 dark:bg-[#171B24] dark:text-zinc-400 dark:ring-[#262C3B]">
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
