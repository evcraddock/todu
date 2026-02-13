import { resolveStoragePath } from "@todu/core";
import { createTodu } from "@todu/engine";
import type { Todu } from "@todu/engine";
import { BrowserWindow, app } from "electron";
import { setupAgent, teardownAgent } from "./agent.js";
import { setupChangeNotifications } from "./change-notifications.js";
import { registerIpcHandlers } from "./ipc.js";
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from "./shortcuts.js";
import { destroyTray, setupTray } from "./tray.js";
import { createWindow, restoreWindowState, saveWindowState } from "./window.js";

let mainWindow: BrowserWindow | null = null;
let todu: Todu | null = null;
let isQuitting = false;

function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/**
 * Show the main window and send an action to the renderer.
 */
function showWindowWithAction(action: string): void {
  if (mainWindow) {
    if (!mainWindow.isVisible()) mainWindow.show();
    mainWindow.focus();
    mainWindow.webContents.send("todu:action", action);
  }
}

async function init(): Promise<void> {
  // Resolve storage path using the same config chain as CLI
  const storagePath = resolveStoragePath();

  // Initialize engine with sync server so CLI can connect
  todu = await createTodu({ storagePath, syncServer: true });

  // Register all IPC handlers
  registerIpcHandlers(todu);

  // Create the main window
  const windowState = restoreWindowState();
  mainWindow = createWindow(windowState);

  // Forward Automerge change events to renderer
  setupChangeNotifications(todu, mainWindow);

  // Initialize agent with todu tools
  setupAgent(todu, mainWindow);

  // Set up system tray
  setupTray(todu, getMainWindow, () => showWindowWithAction("new-task"));

  // Register global shortcuts
  registerGlobalShortcuts(getMainWindow);

  // Save window state on move/resize
  mainWindow.on("resize", () => {
    if (mainWindow) saveWindowState(mainWindow);
  });
  mainWindow.on("move", () => {
    if (mainWindow) saveWindowState(mainWindow);
  });

  // Minimize to tray on close instead of quitting
  mainWindow.on("close", (event) => {
    if (!isQuitting && mainWindow) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(init);

// Mark as quitting so the close handler allows it through
app.on("before-quit", () => {
  isQuitting = true;
});

app.on("window-all-closed", async () => {
  unregisterGlobalShortcuts();
  destroyTray();
  teardownAgent();
  if (todu) {
    await todu.close();
    todu = null;
  }
  app.quit();
});

app.on("will-quit", () => {
  unregisterGlobalShortcuts();
  destroyTray();
});

app.on("activate", () => {
  // macOS: re-create window when dock icon clicked
  if (BrowserWindow.getAllWindows().length === 0 && todu) {
    const windowState = restoreWindowState();
    mainWindow = createWindow(windowState);
  } else if (mainWindow && !mainWindow.isVisible()) {
    mainWindow.show();
    mainWindow.focus();
  }
});
