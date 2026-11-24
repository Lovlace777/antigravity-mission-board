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

  // Follow-up panel collapsed by default into sleek 1-line bar so Overview/Tabs get prime viewport!
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

  // Keep detail's live overlay & summary in sync with SSE board updates
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

  // Keyboard shortcuts inside Drawer: Esc to close, ArrowLeft / ArrowRight for Prev / Next
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
      {/* Subtle Blurred Backdrop */}
      <div
        className="agmb-backdrop-enter fixed inset-0 bg-zinc-950/32 backdrop-blur-[2px] dark:bg-black/58"
        onClick={onClose}
      />

      {/* Slide-over Panel */}
      <div className="agmb-drawer-enter relative z-10 flex h-full w-full max-w-[800px] flex-col border-l border-zinc-200/90 bg-[#F6F7F9] shadow-2xl dark:border-[#242A37] dark:bg-[#0B0E14]">
        {/* Sticky Header */}
        <div className="shrink-0 border-b border-zinc-200/85 bg-white px-5 pt-3.5 pb-3 dark:border-[#202634] dark:bg-[#11151D]">
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
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:text-emerald-300">
                    <LivePulseDot />
                    {t.card.runningNow}
                  </span>
                )}
                {activeCard?.attentionReasons.map((r) => (
                  <AttentionReasonBadge key={r} reason={r} t={t} />
                ))}
              </div>
              <h2 className="mt-1.5 text-[15px] leading-snug font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {activeCard?.title || t.card.untitled}
              </h2>

              {/* Copyable Workspace Path & Conversation ID */}
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                {activeCard?.workspacePath && (
                  <button
                    type="button"
                    onClick={() => handleCopy('path', activeCard.workspacePath)}
                    title={t.drawer.copyPath}
                    className="inline-flex max-w-[360px] items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10.5px] text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-[#1A202D] dark:text-zinc-300 dark:hover:bg-[#232B3C]"
                  >
                    <Folder className="h-3 w-3 shrink-0 text-zinc-400" />
                    <span className="truncate">{activeCard.workspacePath}</span>
                    {copiedField === 'path' ? (
                      <Check className="h-3 w-3 shrink-0 text-emerald-500" />
                    ) : (
                      <Copy className="h-2.5 w-2.5 shrink-0 opacity-60" />
                    )}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => handleCopy('id', conversationId)}
                  title={t.drawer.copyId}
                  className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10.5px] text-zinc-500 transition-colors hover:bg-zinc-200 dark:bg-[#1A202D] dark:text-zinc-400 dark:hover:bg-[#232B3C]"
                >
                  <Hash className="h-2.5 w-2.5" />
                  <span>{conversationId.slice(0, 12)}</span>
                  {copiedField === 'id' ? (
                    <Check className="h-3 w-3 text-emerald-500" />
                  ) : (
                    <Copy className="h-2.5 w-2.5 opacity-60" />
                  )}
                </button>
              </div>
            </div>

            {/* Prev / Next Triage Navigation + Close */}
            <div className="flex shrink-0 items-center gap-1">
              {totalCount > 1 && currentIndex >= 0 && (
                <div className="mr-1 inline-flex items-center rounded-md border border-zinc-200/80 bg-zinc-50/80 p-0.5 dark:border-[#242B3B] dark:bg-[#161B25]">
                  <button
                    type="button"
                    onClick={onPrev}
                    disabled={!hasPrev}
                    title={t.drawer.prevConversation}
                    aria-label={t.drawer.prevConversation}
                    className="rounded p-1 text-zinc-500 transition-colors hover:bg-white hover:text-zinc-900 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-[#222938] dark:hover:text-zinc-100"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <span className="tabular-nums px-1.5 font-mono text-[10.5px] text-zinc-500 dark:text-zinc-400">
                    {currentIndex + 1}/{totalCount}
                  </span>
                  <button
                    type="button"
                    onClick={onNext}
                    disabled={!hasNext}
                    title={t.drawer.nextConversation}
                    aria-label={t.drawer.nextConversation}
                    className="rounded p-1 text-zinc-500 transition-colors hover:bg-white hover:text-zinc-900 disabled:opacity-30 dark:text-zinc-400 dark:hover:bg-[#222938] dark:hover:text-zinc-100"
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
                className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-[#1E2330] dark:hover:text-zinc-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Action Controls Bar */}
          {activeCard && overlay && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-2.5 dark:border-[#1D2330]">
              {/* Pin */}
              <button
                type="button"
                onClick={() =>
                  void onPatchOverlay(activeCard.id, { pinned: !overlay.pinned })
                }
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  overlay.pinned
                    ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-[#262C3B] dark:bg-[#171C26] dark:text-zinc-300'
                }`}
              >
                <Pin className={`h-3.5 w-3.5 ${overlay.pinned ? 'fill-current' : ''}`} />
                <span>{overlay.pinned ? t.card.unpin : t.card.pin}</span>
              </button>

              {/* Mark Reviewed */}
              <button
                type="button"
                onClick={() => void onMarkReviewed(activeCard)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  activeCard.attentionReasons.length > 0
                    ? 'border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-[#262C3B] dark:bg-[#171C26] dark:text-zinc-300'
                }`}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>{t.card.markReviewed}</span>
              </button>

              {/* Priority selector */}
              <select
                value={overlay.priority ?? ''}
                onChange={(e) =>
                  handlePriorityChange((e.target.value || null) as Priority)
                }
                aria-label={t.priority.label}
                className="h-7 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-700 focus:border-sky-500 focus:outline-none dark:border-[#262C3B] dark:bg-[#171C26] dark:text-zinc-200"
              >
                <option value="">
                  {t.priority.label}: {t.priority.none}
                </option>
                <option value="p0">{t.priority.p0}</option>
                <option value="p1">{t.priority.p1}</option>
                <option value="p2">{t.priority.p2}</option>
              </select>

              {/* Manual Lane Selector + Reset */}
              <div className="ml-auto flex items-center gap-1.5">
                <select
                  value={activeCard.lane}
                  onChange={(e) => handleLaneChange(e.target.value as LaneId)}
                  aria-label={t.drawer.laneControl}
                  className="h-7 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-700 focus:border-sky-500 focus:outline-none dark:border-[#262C3B] dark:bg-[#171C26] dark:text-zinc-200"
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
                    className="inline-flex h-7 items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 text-[11px] font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:border-[#262C3B] dark:bg-[#1A1F2B] dark:text-zinc-300"
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
          {/* Sleek 1-line Interactive Personal Follow-up Bar (collapsed by default) */}
          {overlay && (
            <section className="mb-3.5 rounded-xl border border-zinc-200/85 bg-white transition-colors dark:border-[#212633] dark:bg-[#12151C]">
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
                className="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-zinc-50/70 dark:hover:bg-[#161B25]"
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  <StickyNote className="h-3.5 w-3.5 shrink-0 text-sky-500" />

                  {currentTags.length > 0 && (
                    <div className="flex shrink-0 items-center gap-1">
                      {currentTags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[10.5px] font-medium text-sky-700 dark:bg-sky-500/14 dark:text-sky-300"
                        >
                          #{tag}
                        </span>
                      ))}
                      {currentTags.length > 3 && (
                        <span className="tabular-nums rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-[#1E2432] dark:text-zinc-400">
                          +{currentTags.length - 3}
                        </span>
                      )}
                    </div>
                  )}

                  {noteSnippet ? (
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-zinc-600 dark:text-zinc-400">
                      {noteSnippet}
                    </span>
                  ) : currentTags.length === 0 && !followUpDateVal ? (
                    <span className="min-w-0 flex-1 truncate text-[11.5px] text-zinc-400 dark:text-zinc-500">
                      {t.drawer.addFollowUpHint}
                    </span>
                  ) : (
                    <span className="flex-1" />
                  )}

                  {followUpDateVal && (
                    <span
                      className={`tabular-nums inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-medium ${
                        followUpOverdue
                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                          : 'bg-zinc-100 text-zinc-600 dark:bg-[#1E2432] dark:text-zinc-300'
                      }`}
                    >
                      <CalendarClock className="h-2.5 w-2.5" />
                      {followUpDateVal}
                    </span>
                  )}
                </div>

                <span className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-200/80 bg-zinc-50 px-2 py-0.5 text-[10.5px] font-medium text-zinc-600 dark:border-[#283042] dark:bg-[#181D27] dark:text-zinc-300">
                  <Pencil className="h-2.5 w-2.5" />
                  <span>
                    {followUpExpanded ? t.drawer.doneEditing : t.drawer.editFollowUp}
                  </span>
                </span>
              </div>

              {followUpExpanded && (
                <div className="space-y-3 border-t border-zinc-100 px-3.5 py-3 dark:border-[#1E2330]">
                  {/* Tags Editor */}
                  <div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        <Tag className="h-3 w-3" />
                        <span>{t.drawer.tagsLabel}</span>
                      </label>
                      {currentTags.length > 0 && (
                        <span className="tabular-nums text-[10.5px] text-zinc-400">
                          {t.drawer.tagsCount(currentTags.length)}
                        </span>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      {currentTags.map((tag) => (
                        <span
                          key={tag}
                          className="inline-flex items-center gap-1 rounded-full bg-sky-50 py-0.5 pr-1.5 pl-2 text-[11px] font-medium text-sky-700 ring-1 ring-inset ring-sky-600/20 dark:bg-sky-500/12 dark:text-sky-300 dark:ring-sky-400/25"
                        >
                          <span>#{tag}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveTag(tag)}
                            className="rounded-full p-0.5 hover:bg-sky-200/60 dark:hover:bg-sky-500/30"
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
                          className="h-6.5 w-36 rounded-md border border-zinc-200 bg-zinc-50 px-2 text-[11px] text-zinc-800 placeholder:text-zinc-400 focus:border-sky-500 focus:bg-white focus:outline-none dark:border-[#262C3B] dark:bg-[#0E1117] dark:text-zinc-200"
                        />
                        {tagInput.trim() && (
                          <button
                            type="button"
                            onClick={() => handleAddTag(tagInput)}
                            className="inline-flex h-6.5 items-center gap-0.5 rounded-md bg-zinc-900 px-2 text-[11px] font-medium text-white dark:bg-zinc-100 dark:text-zinc-900"
                          >
                            <Plus className="h-3 w-3" />
                            <span>{t.drawer.addTagBtn}</span>
                          </button>
                        )}
                      </div>
                    </div>
                    {suggestedTags.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <span className="text-[10px] text-zinc-400">
                          {t.drawer.suggestedTags}:
                        </span>
                        {suggestedTags.map((st) => (
                          <button
                            key={st}
                            type="button"
                            onClick={() => handleAddTag(st)}
                            className="rounded-full border border-dashed border-zinc-300 px-1.5 py-0.5 text-[10px] text-zinc-500 transition-colors hover:border-sky-400 hover:text-sky-600 dark:border-[#2A3040] dark:text-zinc-400 dark:hover:border-sky-400 dark:hover:text-sky-300"
                          >
                            +{st}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Notes + Follow-up Reminder Date */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_170px]">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                          {t.drawer.notesLabel}
                        </label>
                        {notesState === 'saving' && (
                          <span className="text-[10.5px] text-zinc-400">
                            {t.drawer.notesSaving}
                          </span>
                        )}
                        {notesState === 'saved' && (
                          <span className="inline-flex items-center gap-0.5 text-[10.5px] text-emerald-600 dark:text-emerald-400">
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
                        className="mt-1 w-full resize-y rounded-md border border-zinc-200 bg-zinc-50/70 px-2.5 py-1.5 text-xs leading-relaxed text-zinc-800 placeholder:text-zinc-400 focus:border-sky-500 focus:bg-white focus:outline-none dark:border-[#262C3B] dark:bg-[#0E1117] dark:text-zinc-200 dark:placeholder:text-zinc-500"
                      />
                    </div>

                    <div>
                      <label className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                        <CalendarClock className="h-3 w-3" />
                        <span>{t.drawer.followUpDateLabel}</span>
                      </label>
                      <div className="mt-1 flex items-center gap-1">
                        <input
                          type="date"
                          value={followUpDateVal}
                          onChange={(e) => handleFollowUpChange(e.target.value)}
                          className="h-8 w-full rounded-md border border-zinc-200 bg-zinc-50/70 px-2 font-mono text-xs text-zinc-800 focus:border-sky-500 focus:bg-white focus:outline-none dark:border-[#262C3B] dark:bg-[#0E1117] dark:text-zinc-200"
                        />
                        {followUpDateVal && (
                          <button
                            type="button"
                            onClick={() => handleFollowUpChange('')}
                            title={t.drawer.clearDate}
                            className="rounded p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
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

          {/* 4 Clean Tabs */}
          <div className="mb-3.5 flex items-center gap-1 border-b border-zinc-200/80 dark:border-[#212633]">
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
                      ? 'border-zinc-900 text-zinc-900 dark:border-sky-400 dark:text-zinc-50'
                      : 'border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{label}</span>
                  {count !== null && count > 0 && (
                    <span className="tabular-nums rounded-full bg-zinc-200/70 px-1.5 py-0.2 text-[10px] font-semibold text-zinc-600 dark:bg-[#1E2330] dark:text-zinc-400">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Tab Body */}
          {loading && !detail ? (
            <div className="flex items-center justify-center gap-2 py-16 text-xs text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{t.drawer.loadingDetail}</span>
            </div>
          ) : error && !detail ? (
            <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-4 text-xs text-rose-700 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300">
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
