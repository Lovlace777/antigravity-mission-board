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
    <kbd className="inline-flex min-w-[24px] items-center justify-center rounded-md border border-[#1C1917]/[0.1] bg-white px-1.5 py-0.5 text-[11px] font-medium text-[#44403C] shadow-[0_1px_0_rgba(28,25,23,0.06)] dark:border-white/[0.11] dark:bg-[#232320] dark:text-[#E7E5E0] dark:shadow-[0_1px_0_rgba(0,0,0,0.45)]">
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
        className="agmb-backdrop-enter fixed inset-0 bg-[#1C1917]/30 backdrop-blur-[2px] dark:bg-black/60"
        onClick={onClose}
      />

      <div className="agmb-modal-enter relative z-10 w-full max-w-md overflow-hidden rounded-2xl border border-[#1C1917]/[0.11] bg-white shadow-2xl dark:border-white/[0.11] dark:bg-[#191917]">
        <div className="flex items-center justify-between border-b border-[#1C1917]/[0.07] px-4 py-3 dark:border-white/[0.07]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F2F0EB] text-[#44403C] dark:bg-[#242421] dark:text-[#D6D3CD]">
              <Keyboard className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#1C1917] dark:text-[#F2F1EE]">
                {t.shortcutsModal.title}
              </h2>
              <p className="text-[11px] text-[#78716C] dark:text-[#8C8B85]">
                {t.shortcutsModal.subtitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-[#8C867E] transition-colors hover:bg-[#1C1917]/[0.06] hover:text-[#1C1917] dark:hover:bg-white/[0.08] dark:hover:text-[#F2F1EE]"
            aria-label={t.drawer.close}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          {sections.map((section) => (
            <div key={section.title}>
              <div className="mb-2 text-[10.5px] font-semibold tracking-wider text-[#969088] uppercase dark:text-[#666560]">
                {section.title}
              </div>
              <div className="divide-y divide-[#1C1917]/[0.06] rounded-xl border border-[#1C1917]/[0.07] bg-[#F6F5F1]/75 dark:divide-white/[0.06] dark:border-white/[0.06] dark:bg-[#141413]">
                {section.rows.map((row) => (
                  <div
                    key={row.label}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-xs"
                  >
                    <span className="text-[#44403C] dark:text-[#D6D3CD]">{row.label}</span>
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
