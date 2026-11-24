import { AlertCircle, BellRing, CheckCircle2, Info, X } from 'lucide-react';

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  tone: 'info' | 'success' | 'warning' | 'error';
  conversationId?: string;
}

export function ToastContainer({
  toasts,
  onDismiss,
  onOpenConversation,
}: {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
  onOpenConversation: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => {
        const Icon =
          toast.tone === 'error'
            ? AlertCircle
            : toast.tone === 'warning'
              ? BellRing
              : toast.tone === 'success'
                ? CheckCircle2
                : Info;
        const iconColor =
          toast.tone === 'error'
            ? 'text-rose-500'
            : toast.tone === 'warning'
              ? 'text-amber-500'
              : toast.tone === 'success'
                ? 'text-emerald-500'
                : 'text-sky-500';

        return (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex items-start gap-2.5 rounded-lg border border-zinc-200/90 bg-white/95 p-3 shadow-lg backdrop-blur-md transition-all dark:border-[#2A3040] dark:bg-[#161A23]/95"
          >
            <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${iconColor}`} />
            <div
              className={`min-w-0 flex-1 ${toast.conversationId ? 'cursor-pointer' : ''}`}
              onClick={() => {
                if (toast.conversationId) {
                  onOpenConversation(toast.conversationId);
                  onDismiss(toast.id);
                }
              }}
            >
              <div className="truncate text-xs font-semibold text-zinc-900 dark:text-zinc-100">
                {toast.title}
              </div>
              {toast.message && (
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-600 dark:text-zinc-400">
                  {toast.message}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded p-0.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
