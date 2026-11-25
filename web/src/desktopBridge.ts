export interface DesktopState {
  alwaysOnTop: boolean;
  autoStart: boolean;
  widgetVisible: boolean;
  version: string;
  demoMode: boolean;
  platform: string;
}

export interface MissionBoardDesktopAPI {
  readonly isDesktop: true;
  readonly platform: string;
  resizeWidget: (opts: {
    width: number;
    height: number;
    expanded: boolean;
  }) => Promise<void>;
  openMainBoard: (conversationId?: string) => Promise<void>;
  hideWidget: () => Promise<void>;
  showWidget: () => Promise<void>;
  setWidgetVisible: (value: boolean) => Promise<boolean>;
  getDesktopState: () => Promise<DesktopState>;
  setAlwaysOnTop: (value: boolean) => Promise<boolean>;
  setAutoStart: (value: boolean) => Promise<boolean>;
  updateTraySummary: (summary: { running: number; attention: number }) => void;
  setTheme?: (theme: 'light' | 'dark') => void;
  onOpenConversation: (cb: (conversationId: string) => void) => () => void;
  onDesktopStateChange: (cb: (state: DesktopState) => void) => () => void;
}

declare global {
  interface Window {
    missionBoardDesktop?: MissionBoardDesktopAPI;
  }
}

export function getDesktopBridge(): MissionBoardDesktopAPI | null {
  if (typeof window !== 'undefined' && window.missionBoardDesktop?.isDesktop) {
    return window.missionBoardDesktop;
  }
  return null;
}

export function isWidgetModeUrl(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('mode') === 'widget';
}

export function parseHashConversationId(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash;
  if (!hash) return null;
  const match = hash.match(/[#&]?conv=([^&]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}
