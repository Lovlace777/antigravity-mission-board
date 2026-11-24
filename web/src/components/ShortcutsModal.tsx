import { useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';
import type { Dictionary } from '../i18n';

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
  t: Dictionary;
}

function KeyCap({ children }: { children: string }) {
  return (
    <kbd className="inline-flex min-w-[24px] items-center justify-center rounded-md border border-zinc-200/90 bg-zinc-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-zinc-700 shadow-[0_1px_0_rgba(0,0,0,0.06)] dark:border-[#2E3647] dark:bg-[#191E2A] dark:text-zinc-200 dark:shadow-[0_1px_0_rgba(0,0,0,0.45)]">
      {children}
    </kbd>
  );
}

export function ShortcutsModal({ open, onClose, t }: ShortcutsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const sections = [
    {
      title: t.shortcutsModal.groupNavigation,
      rows: [
        { label: t.shortcutsModal.openCommandPalette, keys: ['Ctrl+K', '/'] },
        { label: t.shortcutsModal.switchKanban, keys: ['1'] },
        { label: t.shortcutsModal.switchMatrix, keys: ['2'] },
        { label: t.shortcutsModal.switchSwarm, keys: ['3'] },
      ],
    },
    {
      title: t.shortcutsModal.groupTriage,
      rows: [
        { label: t.shortcutsModal.refreshBoard, keys: ['R'] },
        { label: t.shortcutsModal.openShortcuts, keys: ['?'] },
      ],
    },
    {
      title: t.shortcutsModal.groupDrawer,
      rows: [
        { label: t.shortcutsModal.prevNextConversation, keys: ['←', '→'] },
        { label: t.shortcutsModal.closeOverlay, keys: ['Esc'] },
      ],
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t.shortcutsModal.title}
    >
      <div
        className="agmb-backdrop-enter fixed inset-0 bg-zinc-950/35 backdrop-blur-[2px] dark:bg-black/60"
        onClick={onClose}
      />

      <div className="agmb-modal-enter relative z-10 w-full max-w-md overflow-hidden rounded-xl border border-zinc-200/90 bg-white shadow-2xl dark:border-[#293040] dark:bg-[#131720]">
        <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3 dark:border-[#1E2432]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-zinc-100 text-zinc-700 dark:bg-[#1C2230] dark:text-zinc-300">
              <Keyboard className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
                {t.shortcutsModal.title}
              </h2>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {t.shortcutsModal.subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-[#1E2432] dark:hover:text-zinc-200"
            aria-label={t.drawer.close}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {sections.map((section) => (
            <div key={section.title}>
              <div className="mb-2 text-[10.5px] font-semibold tracking-wider text-zinc-400 uppercase dark:text-zinc-500">
                {section.title}
              </div>
              <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-100 bg-zinc-50/50 dark:divide-[#1E2432] dark:border-[#1E2432] dark:bg-[#0E1117]">
                {section.rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <span className="text-zinc-700 dark:text-zinc-300">{row.label}</span>
                    <div className="flex items-center gap-1">
                      {row.keys.map((k) => (
                        <KeyCap key={k}>{k}</KeyCap>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
