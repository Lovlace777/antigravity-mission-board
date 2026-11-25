import { useEffect, useRef, useState } from 'react';
import type {
  ConversationCard,
  ConversationDetail,
  LaneId,
  OverlayPatch,
  Priority,
} from '@shared/types';
import {
  CalendarClock,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  FileText,
  Folder,
  Hash,
  LayoutDashboard,
  Loader2,
  Network,
  Pencil,
  Pin,
  Plus,
  RotateCcw,
  StickyNote,
  Tag,
  X,
} from 'lucide-react';
import { fetchConversationDetail } from '../api';
import type { Dictionary, Locale } from '../i18n';
import { copyToClipboard, isFollowUpDue } from '../utils';
import {
  AttentionReasonBadge,
  LANE_ORDER,
  LanePill,
  LivePulseDot,
} from './badges';
import {
  AgentsTab,
  ArtifactsTab,
  OverviewTab,
  TimelineTab,
} from './drawer/DrawerTabs';

export type DrawerTab = 'overview' | 'agents' | 'artifacts' | 'timeline';

interface DetailDrawerProps {
  conversationId: string | null;
  initialTab?: DrawerTab;
  cardFromBoard: ConversationCard | null;
  allTags: string[];
  currentIndex: number;
  totalCount: number;
  hasPrev: boolean;
  hasNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  onClose: () => void;
  onPatchOverlay: (id: string, patch: OverlayPatch) => Promise<void>;
  onMarkReviewed: (card: ConversationCard) => Promise<void>;
  onCopySuccess?: (kind: 'id' | 'path') => void;
  locale: Locale;
  t: Dictionary;
}

export function DetailDrawer({
  conversationId,
  initialTab = 'overview',
  cardFromBoard,
  allTags,
  currentIndex,
  totalCount,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
  onClose,
  onPatchOverlay,
  onMarkReviewed,
  onCopySuccess,
  locale,
  t,
}: DetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>(initialTab);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'id' | 'path' | null>(null);

  const [followUpExpanded, setFollowUpExpanded] = useState(false);
  const [tagInput, setTagInput] = useState('');
  const [notesDraft, setNotesDraft] = useState('');
  const [notesState, setNotesState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const notesTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSavedNotesRef = useRef<string>('');
  const errorDetailTextRef = useRef(t.drawer.errorDetail);
  errorDetailTextRef.current = t.drawer.errorDetail;

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab, conversationId]);

  useEffect(() => {
    if (!conversationId) {
      setDetail(null);
      setFollowUpExpanded(false);
      return;
    }
    setFollowUpExpanded(false);
    if (cardFromBoard && cardFromBoard.id === conversationId) {
      const initialNotes = cardFromBoard.overlay.notes ?? '';
      setNotesDraft(initialNotes);
      lastSavedNotesRef.current = initialNotes;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetchConversationDetail(conversationId)
      .then((data) => {
        if (!cancelled) {
          setDetail(data);
          setNotesDraft(data.overlay.notes ?? '');
          lastSavedNotesRef.current = data.overlay.notes ?? '';
          setNotesState('idle');
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : errorDetailTextRef.current);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  useEffect(() => {
    if (!cardFromBoard) return;
    setDetail((prev) => {
      if (!prev || prev.id !== cardFromBoard.id) return prev;
      return {
        ...prev,
        ...cardFromBoard,
      };
    });
  }, [cardFromBoard]);

  useEffect(() => {
    if (!conversationId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      const isEditing =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);
      if (isEditing || e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === 'ArrowLeft' && hasPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [conversationId, onClose, hasPrev, hasNext, onPrev, onNext]);

  useEffect(() => {
    return () => {
      if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    };
  }, []);

  if (!conversationId) return null;

  const activeCard = detail ?? cardFromBoard;
  const overlay = activeCard?.overlay;
  const currentTags = overlay?.tags ?? [];
  const suggestedTags = allTags.filter((tag) => !currentTags.includes(tag)).slice(0, 8);

  const handleCopy = async (field: 'id' | 'path', value: string) => {
    if (!value) return;
    const ok = await copyToClipboard(value);
    if (ok) {
      setCopiedField(field);
      onCopySuccess?.(field);
      setTimeout(() => setCopiedField(null), 1400);
    }
  };

  const commitNotes = async (value: string) => {
    if (!conversationId || value === lastSavedNotesRef.current) return;
    setNotesState('saving');
    try {
      await onPatchOverlay(conversationId, { notes: value });
      lastSavedNotesRef.current = value;
      setNotesState('saved');
      setTimeout(() => {
        setNotesState((s) => (s === 'saved' ? 'idle' : s));
      }, 1600);
    } catch {
      setNotesState('idle');
    }
  };

  const handleNotesChange = (val: string) => {
    setNotesDraft(val);
    if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
    notesTimerRef.current = setTimeout(() => {
      void commitNotes(val);
    }, 650);
  };

  const handleAddTag = (raw: string) => {
    if (!conversationId) return;
    const cleaned = raw.trim().replace(/^#+/, '').slice(0, 32);
    if (!cleaned || currentTags.includes(cleaned)) {
      setTagInput('');
      return;
    }
    setTagInput('');
    void onPatchOverlay(conversationId, { tags: [...currentTags, cleaned] });
  };

  const handleRemoveTag = (tag: string) => {
    if (!conversationId) return;
    void onPatchOverlay(conversationId, {
      tags: currentTags.filter((tItem) => tItem !== tag),
    });
  };

  const handleLaneChange = (lane: LaneId) => {
    if (!activeCard) return;
    const manualLane = lane === activeCard.autoLane ? null : lane;
    void onPatchOverlay(activeCard.id, { manualLane });
  };

  const handlePriorityChange = (priority: Priority) => {
    if (!conversationId) return;
    void onPatchOverlay(conversationId, { priority });
  };

  const handleFollowUpChange = (val: string) => {
    if (!conversationId) return;
    void onPatchOverlay(conversationId, { followUpAt: val || null });
  };

  const followUpDateVal = overlay?.followUpAt ? overlay.followUpAt.slice(0, 10) : '';
  const followUpOverdue = isFollowUpDue(overlay?.followUpAt);
  const noteSnippet = (notesDraft || overlay?.notes || '').trim();

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={activeCard?.title || 'Conversation detail'}
    >
      <div
        className="agmb-backdrop-enter fixed inset-0 bg-[#1C1917]/28 backdrop-blur-[2px] dark:bg-black/60"
        onClick={onClose}
      />

      {/* Warm Editorial Slide-over Panel */}
      <div className="agmb-drawer-enter relative z-10 flex h-full w-full max-w-[800px] flex-col border-l border-[#1C1917]/[0.09] bg-[#F6F5F1] shadow-2xl dark:border-white/[0.08] dark:bg-[#121210]">
        {/* Sticky Header */}
        <div className="shrink-0 border-b border-[#1C1917]/[0.075] bg-white px-5 pt-3.5 pb-3 dark:border-white/[0.07] dark:bg-[#181816]">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                {activeCard && (
                  <LanePill
                    lane={activeCard.lane}
                    t={t}
                    isRunning={activeCard.isRunning}
                  />
                )}
                {activeCard?.isRunning && activeCard.lane !== 'running' && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#15803D] dark:text-[#4ADE80]">
                    <LivePulseDot />
                    {t.card.runningNow}
                  </span>
                )}
                {activeCard?.attentionReasons.map((r) => (
                  <AttentionReasonBadge key={r} reason={r} t={t} />
                ))}
              </div>
              <h2 className="mt-1.5 text-[15px] leading-snug font-semibold tracking-[-0.015em] text-[#1C1917] dark:text-[#F2F1EE]">
                {activeCard?.title || t.card.untitled}
              </h2>

              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[#78716C] dark:text-[#8C8B85]">
                {activeCard?.workspacePath && (
                  <button
                    type="button"
                    onClick={() => handleCopy('path', activeCard.workspacePath)}
                    title={t.drawer.copyPath}
                    className="inline-flex max-w-[360px] items-center gap-1 rounded-md bg-[#F2F0EB] px-1.5 py-0.5 font-mono text-[10.5px] text-[#57534E] transition-colors hover:bg-[#E7E4DC] dark:bg-[#222220] dark:text-[#A1A09A] dark:hover:bg-[#2B2B28]"
                  >
                    <Folder className="h-3 w-3 shrink-0 opacity-65" />
                    <span className="truncate">{activeCard.workspacePath}</span>
                    {copiedField === 'path' ? (
                      <Check className="h-3 w-3 shrink-0 text-[#16A34A]" />
                    ) : (
                      <Copy className="h-2.5 w-2.5 shrink-0 opacity-55" />
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleCopy('id', conversationId)}
                  title={t.drawer.copyId}
                  className="inline-flex items-center gap-1 rounded-md bg-[#F2F0EB] px-1.5 py-0.5 font-mono text-[10.5px] text-[#78716C] transition-colors hover:bg-[#E7E4DC] dark:bg-[#222220] dark:text-[#8C8B85] dark:hover:bg-[#2B2B28]"
                >
                  <Hash className="h-2.5 w-2.5" />
                  <span>{conversationId.slice(0, 12)}</span>
                  {copiedField === 'id' ? (
                    <Check className="h-3 w-3 text-[#16A34A]" />
                  ) : (
                    <Copy className="h-2.5 w-2.5 opacity-55" />
                  )}
                </button>
              </div>
            </div>

            {/* Prev / Next Triage Navigation + Close */}
            <div className="flex shrink-0 items-center gap-1">
              {totalCount > 1 && currentIndex >= 0 && (
                <div className="mr-1 inline-flex items-center rounded-lg border border-[#1C1917]/[0.09] bg-[#F6F5F1] p-0.5 dark:border-white/[0.08] dark:bg-[#20201D]">
                  <button
                    type="button"
                    onClick={onPrev}
                    disabled={!hasPrev}
                    title={t.drawer.prevConversation}
                    aria-label={t.drawer.prevConversation}
                    className="rounded p-1 text-[#57534E] transition-colors hover:bg-white hover:text-[#1C1917] disabled:opacity-30 dark:text-[#9F9E98] dark:hover:bg-[#2B2B28] dark:hover:text-[#F2F1EE]"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="tabular-nums px-1.5 font-mono text-[10.5px] text-[#78716C] dark:text-[#8C8B85]">
                    {currentIndex + 1}/{totalCount}
                  </span>
                  <button
                    type="button"
                    onClick={onNext}
                    disabled={!hasNext}
                    title={t.drawer.nextConversation}
                    aria-label={t.drawer.nextConversation}
                    className="rounded p-1 text-[#57534E] transition-colors hover:bg-white hover:text-[#1C1917] disabled:opacity-30 dark:text-[#9F9E98] dark:hover:bg-[#2B2B28] dark:hover:text-[#F2F1EE]"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={onClose}
                title={t.drawer.close}
                aria-label={t.drawer.close}
                className="rounded-lg p-1.5 text-[#8C867E] transition-colors hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Action Controls Bar */}
          {activeCard && overlay && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-[#1C1917]/[0.06] pt-2.5 dark:border-white/[0.06]">
              <button
                type="button"
                onClick={() =>
                  void onPatchOverlay(activeCard.id, { pinned: !overlay.pinned })
                }
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  overlay.pinned
                    ? 'border-[#1C1917] bg-[#1C1917] text-[#F6F5F1] dark:border-[#F2F1EE] dark:bg-[#F2F1EE] dark:text-[#111110]'
                    : 'border-[#1C1917]/[0.1] bg-white text-[#57534E] hover:border-[#1C1917]/25 hover:text-[#1C1917] dark:border-white/[0.09] dark:bg-[#20201D] dark:text-[#D6D3CD]'
                }`}
              >
                <Pin className={`h-3.5 w-3.5 ${overlay.pinned ? 'fill-current' : ''}`} />
                <span>{overlay.pinned ? t.card.unpin : t.card.pin}</span>
              </button>

              <button
                type="button"
                onClick={() => void onMarkReviewed(activeCard)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeCard.attentionReasons.length > 0
                    ? 'border-[#16A34A]/35 bg-[#F0FDF4] text-[#15803D] hover:bg-[#DCFCE7] dark:border-[#22C55E]/35 dark:bg-[#14261B] dark:text-[#4ADE80]'
                    : 'border-[#1C1917]/[0.1] bg-white text-[#57534E] hover:border-[#1C1917]/25 hover:text-[#1C1917] dark:border-white/[0.09] dark:bg-[#20201D] dark:text-[#D6D3CD]'
                }`}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>{t.card.markReviewed}</span>
              </button>

              <select
                value={overlay.priority ?? ''}
                onChange={(e) =>
                  handlePriorityChange((e.target.value || null) as Priority)
                }
                aria-label={t.priority.label}
                className="h-7 rounded-lg border border-[#1C1917]/[0.1] bg-white px-2 text-xs font-medium text-[#44403C] focus:border-[#1C1917]/40 focus:outline-none dark:border-white/[0.09] dark:bg-[#20201D] dark:text-[#D6D3CD]"
              >
                <option value="">
                  {t.priority.label}: {t.priority.none}
                </option>
                <option value="p0">{t.priority.p0}</option>
                <option value="p1">{t.priority.p1}</option>
                <option value="p2">{t.priority.p2}</option>
              </select>

              <div className="ml-auto flex items-center gap-1.5">
                <select
                  value={activeCard.lane}
                  onChange={(e) => handleLaneChange(e.target.value as LaneId)}
                  aria-label={t.drawer.laneControl}
                  className="h-7 rounded-lg border border-[#1C1917]/[0.1] bg-white px-2 text-xs font-medium text-[#44403C] focus:border-[#1C1917]/40 focus:outline-none dark:border-white/[0.09] dark:bg-[#20201D] dark:text-[#D6D3CD]"
                >
                  {LANE_ORDER.map((laneId) => (
                    <option key={laneId} value={laneId}>
                      {t.lanes[laneId]}
                      {laneId === activeCard.autoLane ? ` (${t.card.autoLabel})` : ''}
                    </option>
                  ))}
                </select>

                {activeCard.isManualLane && (
                  <button
                    type="button"
                    onClick={() =>
                      void onPatchOverlay(activeCard.id, { manualLane: null })
                    }
                    title={t.drawer.autoLaneNote(t.lanes[activeCard.autoLane])}
                    className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#1C1917]/[0.1] bg-[#FAF9F6] px-2 text-[11px] font-medium text-[#57534E] transition-colors hover:bg-[#EFECE6] hover:text-[#1C1917] dark:border-white/[0.09] dark:bg-[#20201D] dark:text-[#D6D3CD]"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>{t.lanes.resetAutoLane}</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-5 py-3.5">
          {/* Collapsed 1-line Personal Follow-up Bar */}
          {overlay && (
            <section className="mb-3.5 rounded-xl border border-[#1C1917]/[0.075] bg-white transition-colors dark:border-white/[0.065] dark:bg-[#191917]">
              <div
                role="button"
                tabIndex={0}
                onClick={() => setFollowUpExpanded((v) => !v)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setFollowUpExpanded((v) => !v);
                  }
                }}
                className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-[#FAF9F6] dark:hover:bg-[#1F1F1D]"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <StickyNote className="h-3.5 w-3.5 shrink-0 text-[#8C867E]" />

                  {currentTags.length > 0 && (
                    <div className="flex shrink-0 items-center gap-1.5 text-[11px] text-[#57534E] dark:text-[#A1A09A]">
                      {currentTags.slice(0, 3).map((tag) => (
                        <span key={tag}>#{tag}</span>
                      ))}
                      {currentTags.length > 3 && (
                        <span className="tabular-nums text-[10px] text-[#969088]">
                          +{currentTags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {noteSnippet ? (
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-[#78716C] dark:text-[#9F9E98]">
                      {currentTags.length > 0 ? '· ' : ''}
                      {noteSnippet}
                    </span>
                  ) : currentTags.length === 0 && !followUpDateVal ? (
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-[#969088] dark:text-[#666560]">
                      {t.drawer.addFollowUpHint}
                    </span>
                  ) : (
                    <span className="flex-1" />
                  )}

                  {followUpDateVal && (
                    <span
                      className={`tabular-nums inline-flex shrink-0 items-center gap-1 font-mono text-[10.5px] font-medium ${
                        followUpOverdue
                          ? 'text-[#DC2626] dark:text-[#F87171]'
                          : 'text-[#78716C] dark:text-[#A1A09A]'
                      }`}
                    >
                      <CalendarClock className="h-3 w-3" />
                      {followUpDateVal}
                    </span>
                  )}
                </div>

                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#1C1917]/[0.09] bg-[#FAF9F6] px-2 py-0.5 text-[10.5px] font-medium text-[#57534E] dark:border-white/[0.08] dark:bg-[#222220] dark:text-[#D6D3CD]">
                  <Pencil className="h-2.5 w-2.5" />
                  <span>
                    {followUpExpanded ? t.drawer.doneEditing : t.drawer.editFollowUp}
                  </span>
                </span>
              </div>

              {followUpExpanded && (
                <div className="space-y-3 border-t border-[#1C1917]/[0.06] px-3.5 py-3 dark:border-white/[0.06]">
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1 text-[11px] font-medium text-[#78716C] dark:text-[#8C8B85]">
                        <Tag className="h-3 w-3" />
                        <span>{t.drawer.tagsLabel}</span>
                      </label>
                      {currentTags.length > 0 && (
                        <span className="tabular-nums text-[10.5px] text-[#969088]">
                          {t.drawer.tagsCount(currentTags.length)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {currentTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-md border border-[#1C1917]/[0.1] bg-[#FAF9F6] py-0.5 pr-1.5 pl-2 text-[11px] font-medium text-[#44403C] dark:border-white/[0.09] dark:bg-[#222220] dark:text-[#D6D3CD]"
                        >
                          <span>#{tag}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="rounded p-0.5 hover:bg-[#1C1917]/[0.08] dark:hover:bg-white/[0.1]"
                            aria-label={`Remove ${tag}`}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={tagInput}
                          onChange={(e) => setTagInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              handleAddTag(tagInput);
                            }
                          }}
                          placeholder={t.drawer.addTagPlaceholder}
                          className="h-6.5 w-36 rounded-md border border-[#1C1917]/[0.1] bg-[#FAF9F6] px-2 text-[11px] text-[#1C1917] placeholder:text-[#969088] focus:border-[#1C1917]/40 focus:bg-white focus:outline-none dark:border-white/[0.09] dark:bg-[#141413] dark:text-[#F2F1EE]"
                        />
                        {tagInput.trim() && (
                          <button
                            type="button"
                            onClick={() => handleAddTag(tagInput)}
                            className="inline-flex h-6.5 items-center gap-0.5 rounded-md bg-[#1C1917] px-2 text-[11px] font-medium text-[#F6F5F1] dark:bg-[#F2F1EE] dark:text-[#111110]"
                          >
                            <Plus className="h-3 w-3" />
                            <span>{t.drawer.addTagBtn}</span>
                          </button>
                        )}
                      </div>
                    </div>
                    {suggestedTags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-[#969088]">
                          {t.drawer.suggestedTags}:
                        </span>
                        {suggestedTags.map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleAddTag(st)}
                            className="rounded-md border border-dashed border-[#1C1917]/[0.15] px-1.5 py-0.5 text-[10px] text-[#78716C] transition-colors hover:border-[#1C1917]/40 hover:text-[#1C1917] dark:border-white/[0.12] dark:text-[#8C8B85] dark:hover:border-white/[0.3] dark:hover:text-[#F2F1EE]"
                          >
                            +{st}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_170px]">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-medium text-[#78716C] dark:text-[#8C8B85]">
                          {t.drawer.notesLabel}
                        </label>
                        {notesState === 'saving' && (
                          <span className="text-[10.5px] text-[#969088]">
                            {t.drawer.notesSaving}
                          </span>
                        )}
                        {notesState === 'saved' && (
                          <span className="inline-flex items-center gap-0.5 text-[10.5px] text-[#15803D] dark:text-[#4ADE80]">
                            <Check className="h-3 w-3" />
                            {t.drawer.notesSaved}
                          </span>
                        )}
                      </div>
                      <textarea
                        rows={2}
                        value={notesDraft}
                        onChange={(e) => handleNotesChange(e.target.value)}
                        onBlur={() => {
                          if (notesTimerRef.current) clearTimeout(notesTimerRef.current);
                          void commitNotes(notesDraft);
                        }}
                        placeholder={t.drawer.notesPlaceholder}
                        className="mt-1 w-full resize-y rounded-lg border border-[#1C1917]/[0.1] bg-[#FAF9F6] px-2.5 py-1.5 text-xs leading-relaxed text-[#1C1917] placeholder:text-[#969088] focus:border-[#1C1917]/40 focus:bg-white focus:outline-none dark:border-white/[0.09] dark:bg-[#141413] dark:text-[#F2F1EE] dark:placeholder:text-[#666560]"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-medium text-[#78716C] dark:text-[#8C8B85]">
                        <CalendarClock className="h-3 w-3" />
                        <span>{t.drawer.followUpDateLabel}</span>
                      </label>
                      <div className="mt-1 flex items-center gap-1">
                        <input
                          type="date"
                          value={followUpDateVal}
                          onChange={(e) => handleFollowUpChange(e.target.value)}
                          className="h-8 w-full rounded-lg border border-[#1C1917]/[0.1] bg-[#FAF9F6] px-2 font-mono text-xs text-[#1C1917] focus:border-[#1C1917]/40 focus:bg-white focus:outline-none dark:border-white/[0.09] dark:bg-[#141413] dark:text-[#F2F1EE]"
                        />
                        {followUpDateVal && (
                          <button
                            type="button"
                            onClick={() => handleFollowUpChange('')}
                            title={t.drawer.clearDate}
                            className="rounded p-1.5 text-[#8C867E] hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 4 Monochrome Editorial Tabs */}
          <div className="mb-3.5 flex items-center gap-1 border-b border-[#1C1917]/[0.08] dark:border-white/[0.07]">
            {(
              [
                {
                  id: 'overview' as const,
                  label: t.drawer.tabs.overview,
                  Icon: LayoutDashboard,
                  count: null,
                },
                {
                  id: 'agents' as const,
                  label: t.drawer.tabs.agents,
                  Icon: Network,
                  count:
                    (detail?.swarmDetail?.totalMembers ?? activeCard?.swarm?.totalMembers ?? 0) +
                    (detail?.subagentCount ?? activeCard?.subagentCount ?? 0),
                },
                {
                  id: 'artifacts' as const,
                  label: t.drawer.tabs.artifacts,
                  Icon: FileText,
                  count: detail?.artifacts.length ?? activeCard?.artifactCount ?? 0,
                },
                {
                  id: 'timeline' as const,
                  label: t.drawer.tabs.timeline,
                  Icon: Clock,
                  count: detail?.timeline.length ?? null,
                },
              ] as const
            ).map(({ id, label, Icon, count }) => {
              const active = activeTab === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setActiveTab(id)}
                  className={`relative -mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors ${
                    active
                      ? 'border-[#1C1917] text-[#1C1917] dark:border-[#F2F1EE] dark:text-[#F2F1EE]'
                      : 'border-transparent text-[#78716C] hover:text-[#1C1917] dark:text-[#8C8B85] dark:hover:text-[#F2F1EE]'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                  {count !== null && count > 0 && (
                    <span className="tabular-nums font-mono text-[10.5px] opacity-65">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {loading && !detail ? (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-[#8C867E]">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t.drawer.loadingDetail}</span>
            </div>
          ) : error && !detail ? (
            <div className="rounded-xl border border-[#DC2626]/25 bg-[#FEF2F2] p-4 text-xs text-[#B91C1C] dark:border-[#EF4444]/25 dark:bg-[#2A1616] dark:text-[#FCA5A5]">
              {t.drawer.errorDetail}: {error}
            </div>
          ) : detail ? (
            <>
              {activeTab === 'overview' && (
                <OverviewTab detail={detail} locale={locale} t={t} />
              )}
              {activeTab === 'agents' && <AgentsTab detail={detail} t={t} />}
              {activeTab === 'artifacts' && (
                <ArtifactsTab
                  conversationId={detail.id}
                  artifacts={detail.artifacts}
                  locale={locale}
                  t={t}
                />
              )}
              {activeTab === 'timeline' && (
                <TimelineTab timeline={detail.timeline} locale={locale} t={t} />
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
