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
            ? 'text-[#DC2626] dark:text-[#F87171]'
            : toast.tone === 'warning'
              ? 'text-[#D97706] dark:text-[#FBBF24]'
              : toast.tone === 'success'
                ? 'text-[#16A34A] dark:text-[#4ADE80]'
                : 'text-[#57534E] dark:text-[#A1A09A]';

        return (
          <div
            key={toast.id}
            role="status"
            className="agmb-toast-enter pointer-events-auto flex items-start gap-2.5 rounded-xl border border-[#1C1917]/[0.11] bg-white/96 px-3.5 py-2.5 shadow-[0_14px_34px_-10px_rgba(28,25,23,0.22)] backdrop-blur-md dark:border-white/[0.11] dark:bg-[#1E1E1C]/96 dark:shadow-[0_18px_40px_-10px_rgba(0,0,0,0.7)]"
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
              <div className="text-xs leading-snug font-medium text-[#1C1917] dark:text-[#F2F1EE]">
                {toast.title}
              </div>
              {toast.message && (
                <div className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-[#78716C] dark:text-[#9F9E98]">
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
                className="inline-flex shrink-0 items-center gap-1 rounded-md bg-[#1C1917] px-2 py-1 text-[11px] font-medium text-[#F6F5F1] transition-opacity hover:opacity-85 dark:bg-[#F2F1EE] dark:text-[#111110]"
              >
                <RotateCcw className="h-3 w-3" />
                <span>{toast.action.label}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              className="rounded-md p-0.5 text-[#969088] transition-colors hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
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
