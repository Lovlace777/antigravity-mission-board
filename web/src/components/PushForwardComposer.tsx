import { useState } from 'react';
import type { ConversationCard } from '@shared/types';
import { CornerDownLeft, Loader2 } from 'lucide-react';
import { dispatchConversationPrompt } from '../api';
import { getDesktopBridge } from '../desktopBridge';
import type { Dictionary } from '../i18n';
import { copyToClipboard } from '../utils';

interface PushForwardComposerProps {
  conversationId: string;
  compact?: boolean;
  autoFocus?: boolean;
  onDispatched?: (message: string, updatedCard: ConversationCard | null) => void;
  onError?: (message: string) => void;
  t: Dictionary;
}

export function PushForwardComposer({
  conversationId,
  compact = false,
  autoFocus = false,
  onDispatched,
  onError,
  t,
}: PushForwardComposerProps) {
  const [prompt, setPrompt] = useState('');
  const [sending, setSending] = useState(false);

  const submitPrompt = async (raw: string) => {
    const text = raw.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const res = await dispatchConversationPrompt(conversationId, {
        prompt: text,
        saveToNotes: false,
      });

      if (res.mode === 'agy_cli') {
        setPrompt('');
        onDispatched?.(t.widget.dispatchSuccessCli, res.card);
        return;
      }

      const bridge = getDesktopBridge();
      let focused = false;
      if (bridge) {
        const handoff = await bridge.copyAndFocusAntigravity(res.copiedPrompt || text);
        focused = handoff.focused;
      } else {
        await copyToClipboard(res.copiedPrompt || text);
      }

      setPrompt('');
      onDispatched?.(
        focused ? t.widget.dispatchHandoffFocused : t.widget.dispatchHandoffCopied,
        res.card,
      );
    } catch {
      onError?.(t.widget.dispatchFailed);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-1.5">
      {/* 1-line prompt input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submitPrompt(prompt);
        }}
        className="flex items-center gap-1.5"
      >
        <input
          type="text"
          value={prompt}
          autoFocus={autoFocus}
          disabled={sending}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={t.widget.pushPlaceholder}
          className={`min-w-0 flex-1 rounded-lg border border-[#1C1917]/[0.1] bg-[#FAF9F6] text-[#1C1917] placeholder:text-[#969088] transition-colors focus:border-[#1C1917]/40 focus:bg-white focus:outline-none disabled:opacity-55 dark:border-white/[0.1] dark:bg-[#141413] dark:text-[#F2F1EE] dark:placeholder:text-[#666560] dark:focus:border-white/[0.3] ${
            compact ? 'h-7 px-2 text-[11px]' : 'h-8 px-2.5 text-xs'
          }`}
        />
        <button
          type="submit"
          disabled={sending || !prompt.trim()}
          title={t.widget.pushButton}
          className={`inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-[#1C1917] font-medium text-[#F6F5F1] transition-opacity hover:opacity-88 disabled:opacity-35 dark:bg-[#F2F1EE] dark:text-[#111110] ${
            compact ? 'h-7 px-2 text-[11px]' : 'h-8 px-2.5 text-xs'
          }`}
        >
          {sending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <CornerDownLeft className="h-3 w-3" />
          )}
          <span>{t.widget.pushButton}</span>
        </button>
      </form>

      {/* 3 subtle 1-click quick push chips */}
      <div className="flex flex-wrap items-center gap-1">
        {t.widget.quickPrompts.map((chip) => (
          <button
            key={chip}
            type="button"
            disabled={sending}
            onClick={() => void submitPrompt(chip)}
            className="rounded-md border border-[#1C1917]/[0.08] bg-[#FAF9F6] px-1.5 py-0.5 text-[10.5px] text-[#57534E] transition-colors hover:border-[#1C1917]/25 hover:bg-white hover:text-[#1C1917] disabled:opacity-45 dark:border-white/[0.08] dark:bg-[#151513] dark:text-[#9F9E98] dark:hover:border-white/[0.2] dark:hover:bg-[#1F1F1D] dark:hover:text-[#F2F1EE]"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}
