import { type BrowserWindow, globalShortcut } from "electron";

/**
 * Register global keyboard shortcuts.
 */
export function registerGlobalShortcuts(getMainWindow: () => BrowserWindow | null): void {
  // Ctrl/Cmd+Shift+T — toggle window visibility
  globalShortcut.register("CommandOrControl+Shift+T", () => {
    const win = getMainWindow();
    if (win) {
      if (win.isVisible() && win.isFocused()) {
        win.hide();
      } else {
        win.show();
        win.focus();
      }
    }
  });
}

/**
 * Unregister all global shortcuts.
 */
export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll();
}
