import type { Dictionary, Locale } from './i18n';

export function formatRelativeTime(iso: string | null | undefined, t: Dictionary): string {
  if (!iso) return '—';
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return '—';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 15) return t.time.justNow;
  if (diffSec < 60) return t.time.secondsAgo(diffSec);
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return t.time.minutesAgo(diffMin);
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return t.time.hoursAgo(diffHr);
  const diffDay = Math.floor(diffHr / 24);
  return t.time.daysAgo(diffDay);
}

export function formatDateTime(iso: string | null | undefined, locale: Locale): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatClockTime(date: Date | null): string {
  if (!date) return '--:--:--';
  return date.toTimeString().slice(0, 8);
}

export function formatCompactNumber(n: number | null | undefined): string {
  const val = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  if (val >= 1_000_000_000) return `${(val / 1_000_000_000).toFixed(2)}B`;
  if (val >= 1_000_000) return `${(val / 1_000_000).toFixed(2)}M`;
  if (val >= 10_000) return `${(val / 1_000).toFixed(1)}K`;
  if (val >= 1_000) return `${(val / 1_000).toFixed(2)}K`;
  return String(Math.round(val));
}

export function formatExactNumber(n: number | null | undefined): string {
  const val = typeof n === 'number' && Number.isFinite(n) ? n : 0;
  return new Intl.NumberFormat('en-US').format(Math.round(val));
}

export function formatPercent(ratio: number | null | undefined): string {
  if (typeof ratio !== 'number' || !Number.isFinite(ratio)) return '0%';
  const pct = ratio <= 1 ? ratio * 100 : ratio;
  return `${Math.round(pct)}%`;
}

export function computeCacheHitRate(inputTokens: number, cacheReadTokens: number): number {
  const denom = inputTokens + cacheReadTokens;
  if (denom <= 0) return 0;
  return cacheReadTokens / denom;
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // fallback below
  }
  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Plays a refined, understated two-tone acoustic chime via Web Audio API.
 * Used when an agent finishes a run or requires user attention.
 */
export function playChime(kind: 'info' | 'attention' | 'error' = 'attention'): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;

    const notes =
      kind === 'error'
        ? [440, 349.23]
        : kind === 'attention'
          ? [587.33, 880]
          : [523.25, 659.25];

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + idx * 0.11);

      gain.gain.setValueAtTime(0.0001, now + idx * 0.11);
      gain.gain.exponentialRampToValueAtTime(0.06, now + idx * 0.11 + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.11 + 0.28);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + idx * 0.11);
      osc.stop(now + idx * 0.11 + 0.3);
    });

    setTimeout(() => {
      ctx.close().catch(() => {});
    }, 650);
  } catch {
    // ignore audio autoplay restrictions
  }
}

export function isFollowUpDue(followUpAt: string | null | undefined): boolean {
  if (!followUpAt) return false;
  const today = new Date().toISOString().slice(0, 10);
  return followUpAt.slice(0, 10) <= today;
}

export function shortModelName(model: string): string {
  return model
    .replace(/^models\//i, '')
    .replace(/-preview$/i, '')
    .replace(/^claude-/i, 'claude-')
    .trim();
}
