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
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  FileText,
  Folder,
  Hash,
  LayoutDashboard,
  Loader2,
  Network,
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
  onClose: () => void;
  onPatchOverlay: (id: string, patch: OverlayPatch) => Promise<void>;
  onMarkReviewed: (card: ConversationCard) => Promise<void>;
  locale: Locale;
  t: Dictionary;
}

export function DetailDrawer({
  conversationId,
  initialTab = 'overview',
  cardFromBoard,
  allTags,
  onClose,
  onPatchOverlay,
  onMarkReviewed,
  locale,
  t,
}: DetailDrawerProps) {
  const [activeTab, setActiveTab] = useState<DrawerTab>(initialTab);
  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedField, setCopiedField] = useState<'id' | 'path' | null>(null);

  // Follow-up panel state
  const [followUpExpanded, setFollowUpExpanded] = useState(true);
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
      return;
    }
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

  // Close on Esc
  useEffect(() => {
    if (!conversationId) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [conversationId, onClose]);

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

  return (
    <div
      className="fixed inset-0 z-40 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-label={activeCard?.title || 'Conversation detail'}
    >
      {/* Subtle Backdrop */}
      <div
        className="fixed inset-0 bg-zinc-950/30 backdrop-blur-[1px] transition-opacity dark:bg-black/55"
        onClick={onClose}
      />

      {/* Slide-over Panel */}
      <div className="relative z-10 flex h-full w-full max-w-[780px] flex-col border-l border-zinc-200 bg-[#F7F8FA] shadow-2xl dark:border-[#242A37] dark:bg-[#0C0F14]">
        {/* Sticky Header */}
        <div className="shrink-0 border-b border-zinc-200/90 bg-white px-5 pt-4 pb-3 dark:border-[#222733] dark:bg-[#12151C]">
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
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                    <LivePulseDot />
                    {t.card.runningNow}
                  </span>
                )}
                {activeCard?.attentionReasons.map((r) => (
                  <AttentionReasonBadge key={r} reason={r} t={t} />
                ))}
              </div>
              <h2 className="mt-2 text-base leading-snug font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
                {activeCard?.title || t.card.untitled}
              </h2>

              {/* Copyable Workspace Path & Conversation ID */}
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-zinc-500 dark:text-zinc-400">
                {activeCard?.workspacePath && (
                  <button
                    type="button"
                    onClick={() => handleCopy('path', activeCard.workspacePath)}
                    title={t.drawer.copyPath}
                    className="inline-flex max-w-[360px] items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10.5px] text-zinc-600 transition-colors hover:bg-zinc-200 dark:bg-[#1B202C] dark:text-zinc-300 dark:hover:bg-[#252B3B]"
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
                  className="inline-flex items-center gap-1 rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10.5px] text-zinc-500 transition-colors hover:bg-zinc-200 dark:bg-[#1B202C] dark:text-zinc-400 dark:hover:bg-[#252B3B]"
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

            <button
              type="button"
              onClick={onClose}
              title={t.drawer.close}
              className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-800 dark:hover:bg-[#1E2330] dark:hover:text-zinc-200"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Action Controls Bar */}
          {activeCard && overlay && (
            <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-2.5 dark:border-[#1E2330]">
              {/* Pin */}
              <button
                type="button"
                onClick={() =>
                  void onPatchOverlay(activeCard.id, { pinned: !overlay.pinned })
                }
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
                  overlay.pinned
                    ? 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-300'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-[#262C3B] dark:bg-[#181C25] dark:text-zinc-300'
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
                    : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 dark:border-[#262C3B] dark:bg-[#181C25] dark:text-zinc-300'
                }`}
              >
                <CheckCheck className="h-3.5 w-3.5" />
                <span>{t.card.markReviewed}</span>
              </button>

              {/* Priority selector */}
              <select
                value={overlay.priority ?? ''}
                onChange={(e) =>
                  handlePriorityChange(
                    (e.target.value || null) as Priority,
                  )
                }
                aria-label={t.priority.label}
                className="h-7 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-700 focus:border-sky-500 focus:outline-none dark:border-[#262C3B] dark:bg-[#181C25] dark:text-zinc-200"
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
                  className="h-7 rounded-md border border-zinc-200 bg-white px-2 text-xs font-medium text-zinc-700 focus:border-sky-500 focus:outline-none dark:border-[#262C3B] dark:bg-[#181C25] dark:text-zinc-200"
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
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Personal Follow-up Panel */}
          {overlay && (
            <section className="mb-4 rounded-xl border border-zinc-200/90 bg-white dark:border-[#222733] dark:bg-[#13161D]">
              <button
                type="button"
                onClick={() => setFollowUpExpanded((v) => !v)}
                className="flex w-full items-center justify-between px-3.5 py-2.5 text-left"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                  <StickyNote className="h-3.5 w-3.5 text-sky-500" />
                  <span>{t.drawer.followUpPanel}</span>
                  {currentTags.length > 0 && (
                    <span className="tabular-nums rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-[#1E2330] dark:text-zinc-400">
                      {t.drawer.tagsCount(currentTags.length)}
                    </span>
                  )}
                  {followUpDateVal && (
                    <span
                      className={`tabular-nums rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                        followUpOverdue
                          ? 'bg-rose-50 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300'
                          : 'bg-zinc-100 text-zinc-600 dark:bg-[#1E2330] dark:text-zinc-300'
                      }`}
                    >
                      {followUpDateVal}
                    </span>
                  )}
                </div>
                {followUpExpanded ? (
                  <ChevronUp className="h-3.5 w-3.5 text-zinc-400" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5 text-zinc-400" />
                )}
              </button>

              {followUpExpanded && (
                <div className="space-y-3 border-t border-zinc-100 px-3.5 py-3 dark:border-[#1E2330]">
                  {/* Tags Editor */}
                  <div>
                    <label className="flex items-center gap-1 text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      <Tag className="h-3 w-3" />
                      <span>{t.drawer.tagsLabel}</span>
                    </label>
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
                          className="h-6.5 w-36 rounded-md border border-zinc-200 bg-zinc-50 px-2 text-[11px] text-zinc-800 placeholder:text-zinc-400 focus:border-sky-500 focus:bg-white focus:outline-none dark:border-[#262C3B] dark:bg-[#0F1218] dark:text-zinc-200"
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
                        className="mt-1 w-full resize-y rounded-md border border-zinc-200 bg-zinc-50/70 px-2.5 py-1.5 text-xs leading-relaxed text-zinc-800 placeholder:text-zinc-400 focus:border-sky-500 focus:bg-white focus:outline-none dark:border-[#262C3B] dark:bg-[#0F1218] dark:text-zinc-200 dark:placeholder:text-zinc-500"
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
                          className="h-8 w-full rounded-md border border-zinc-200 bg-zinc-50/70 px-2 font-mono text-xs text-zinc-800 focus:border-sky-500 focus:bg-white focus:outline-none dark:border-[#262C3B] dark:bg-[#0F1218] dark:text-zinc-200"
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
          <div className="mb-4 flex items-center gap-1 border-b border-zinc-200/80 dark:border-[#222733]">
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
