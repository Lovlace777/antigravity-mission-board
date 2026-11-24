import { AlertCircle, BellRing, CheckCircle2, Info, RotateCcw, X } from 'lucide-react';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: string;
  title: string;
  message?: string;
  tone: 'info' | 'success' | 'warning' | 'error';
  conversationId?: string;
  action?: ToastAction;
}

export function ToastHost({
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
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2">
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
            className="agmb-toast-enter pointer-events-auto flex items-start gap-2.5 rounded-xl border border-zinc-200/90 bg-white/95 px-3.5 py-2.5 shadow-[0_12px_32px_-8px_rgba(15,23,42,0.18)] backdrop-blur-md dark:border-[#2A3142] dark:bg-[#151922]/96 dark:shadow-[0_16px_36px_-10px_rgba(0,0,0,0.65)]"
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
              <div className="text-xs leading-snug font-medium text-zinc-900 dark:text-zinc-100">
                {toast.title}
              </div>
              {toast.message && (
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  {toast.message}
                </div>
              )}
            </div>

            {toast.action && (
              <button
                type="button"
                onClick={() => {
                  toast.action?.onClick();
                  onDismiss(toast.id);
                }}
                className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1 text-[11px] font-semibold text-zinc-800 transition-colors hover:border-zinc-300 hover:bg-zinc-100 dark:border-[#2F374A] dark:bg-[#1E2432] dark:text-zinc-100 dark:hover:border-sky-400/50 dark:hover:bg-[#262E40]"
              >
                <RotateCcw className="h-3 w-3" />
                <span>{toast.action.label}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded-md p-0.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
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
