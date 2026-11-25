'use strict';

const { contextBridge, ipcRenderer } = require('electron');

function subscribe(channel, callback) {
  if (typeof callback !== 'function') {
    return () => {};
  }
  const listener = (_event, payload) => {
    try {
      callback(payload);
    } catch {
      // Ignore renderer callback errors so IPC bridge stays healthy
    }
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const api = Object.freeze({
  isDesktop: true,
  platform: process.platform,

  // v2.1.0 Explicit Presets & Free Resize (NO unsolicited auto-resizing)
  setWidgetPreset(preset) {
    return ipcRenderer.invoke('desktop:set-widget-preset', preset);
  },

  getWidgetLayout() {
    return ipcRenderer.invoke('desktop:get-widget-layout');
  },

  onWidgetLayoutChange(cb) {
    return subscribe('desktop:widget-layout-change', cb);
  },

  onWidgetVisibilityChange(cb) {
    return subscribe('desktop:visibility-change', cb);
  },

  // Legacy compatibility alias (explicit resize only)
  resizeWidget(opts) {
    return ipcRenderer.invoke('desktop:resize-widget', opts);
  },

  // v2.1.0 Safe Push-Forward Handoff
  copyAndFocusAntigravity(text) {
    return ipcRenderer.invoke('desktop:copy-and-focus-antigravity', typeof text === 'string' ? text : '');
  },

  // Window & Tray Controls
  openMainBoard(conversationId) {
    return ipcRenderer.invoke(
      'desktop:open-main-board',
      typeof conversationId === 'string' && conversationId.trim() ? conversationId.trim() : undefined
    );
  },

  hideWidget() {
    return ipcRenderer.invoke('desktop:hide-widget');
  },

  showWidget() {
    return ipcRenderer.invoke('desktop:show-widget');
  },

  setWidgetVisible(value) {
    return ipcRenderer.invoke('desktop:set-widget-visible', Boolean(value));
  },

  quitApp() {
    return ipcRenderer.invoke('desktop:quit-app');
  },

  getDesktopState() {
    return ipcRenderer.invoke('desktop:get-state');
  },

  setAlwaysOnTop(value) {
    return ipcRenderer.invoke('desktop:set-always-on-top', Boolean(value));
  },

  setAutoStart(value) {
    return ipcRenderer.invoke('desktop:set-auto-start', Boolean(value));
  },

  updateTraySummary(summary) {
    if (!summary || typeof summary !== 'object') return;
    ipcRenderer.send('desktop:tray-summary', {
      running: Number(summary.running) || 0,
      attention: Number(summary.attention) || 0,
    });
  },

  setTheme(theme) {
    if (theme === 'light' || theme === 'dark' || theme === 'system') {
      ipcRenderer.send('desktop:set-theme', theme);
    }
  },

  onOpenConversation(cb) {
    return subscribe('desktop:open-conversation', cb);
  },

  onDesktopStateChange(cb) {
    return subscribe('desktop:state-change', cb);
  },
});

contextBridge.exposeInMainWorld('missionBoardDesktop', api);
