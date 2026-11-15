/** What the Mac app's shell offers the page (see desktop/preload.js). Absent in a browser. */
export interface DesktopBridge {
  /** Brings the window back when it was tucked away in the menu bar. */
  showWindow(): void;
}

export const desktopBridge = (): DesktopBridge | null => (globalThis as { taskflowDesktop?: DesktopBridge }).taskflowDesktop ?? null;
