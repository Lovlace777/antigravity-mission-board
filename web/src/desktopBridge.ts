export type WidgetPreset = 'S' | 'M' | 'L';
export type WidgetLayoutMode = WidgetPreset | 'custom';

export interface WidgetLayoutState {
  preset: WidgetLayoutMode;
  width: number;
  height: number;
}

export interface FocusHandoffResult {
  ok: boolean;
  copied: boolean;
  focused: boolean;
}

export interface DesktopState {
  alwaysOnTop: boolean;
  autoStart: boolean;
  widgetVisible: boolean;
  version: string;
  demoMode: boolean;
  platform: string;
  widgetLayout?: WidgetLayoutState;
}

export interface MissionBoardDesktopAPI {
  readonly isDesktop: true;
  readonly platform: string;

  // v2.1.0 Free Resize + Explicit Presets (NO unsolicited auto-resizing)
  setWidgetPreset: (preset: WidgetPreset) => Promise<WidgetLayoutState>;
  getWidgetLayout: () => Promise<WidgetLayoutState>;
  onWidgetLayoutChange: (cb: (layout: WidgetLayoutState) => void) => () => void;
  onWidgetVisibilityChange: (cb: (visible: boolean) => void) => () => void;
  resizeWidget: (opts: {
    width: number;
    height: number;
    expanded?: boolean;
  }) => Promise<void>;

  // v2.1.0 Safe Push-Forward Handoff
  copyAndFocusAntigravity: (text: string) => Promise<FocusHandoffResult>;

  // Existing v2.0 controls + v2.3 explicit quit
  openMainBoard: (conversationId?: string) => Promise<void>;
  hideWidget: () => Promise<void>;
  quitApp: () => Promise<void>;
  showWidget: () => Promise<void>;
  setWidgetVisible: (value: boolean) => Promise<boolean>;
  getDesktopState: () => Promise<DesktopState>;
  setAlwaysOnTop: (value: boolean) => Promise<boolean>;
  setAutoStart: (value: boolean) => Promise<boolean>;
  updateTraySummary: (summary: { running: number; attention: number }) => void;
  setTheme?: (theme: 'light' | 'dark' | 'system') => void;
  onOpenConversation: (cb: (conversationId: string) => void) => () => void;
  onDesktopStateChange: (cb: (state: DesktopState) => void) => () => void;
}

declare global {
  interface Window {
    missionBoardDesktop?: MissionBoardDesktopAPI;
  }
}

export const WIDGET_PRESET_SIZES: Record<WidgetPreset, { width: number; height: number }> = {
  S: { width: 336, height: 52 },
  M: { width: 390, height: 600 },
  L: { width: 700, height: 580 },
};

export function getDesktopBridge(): MissionBoardDesktopAPI | null {
  if (typeof window !== 'undefined' && window.missionBoardDesktop?.isDesktop) {
    return window.missionBoardDesktop;
  }
  return null;
}

export function isDesktopApp(): boolean {
  return getDesktopBridge() !== null;
}

export function isWidgetModeUrl(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('mode') === 'widget';
}

export function parseUrlWidgetPreset(): WidgetPreset | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const raw = (params.get('preset') ?? '').toUpperCase();
  if (raw === 'S' || raw === 'M' || raw === 'L') return raw;
  const legacyExpanded = params.get('expanded');
  if (legacyExpanded === '0' || legacyExpanded === 'false') return 'S';
  if (legacyExpanded === '1' || legacyExpanded === 'true') return 'M';
  return null;
}

export function parseHashConversationId(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (!hash) return null;
  const match = hash.match(/[#&]?conv=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
