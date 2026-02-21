import fs from "node:fs";
import path from "node:path";
import type { Todu } from "@todu/engine";
import { createTodu } from "@todu/engine";
import { app, BrowserWindow, ipcMain } from "electron";
import { setupAgent, teardownAgent } from "./agent.js";
import { setupChangeNotifications } from "./change-notifications.js";
import { loadElectronConfig } from "./config.js";
import { registerIpcHandlers } from "./ipc.js";
import { registerOAuthIpc, unregisterOAuthIpc } from "./oauth.js";

import { registerSettingsIpc, unregisterSettingsIpc } from "./settings.js";
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from "./shortcuts.js";
import { destroyTray, setupTray } from "./tray.js";
import { createWindow, restoreWindowState, saveWindowState } from "./window.js";

let mainWindow: BrowserWindow | null = null;
let todu: Todu | null = null;
let isQuitting = false;
let currentStoragePath = "";

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
  // Load full config (data dir + remote sync) using the same config chain as CLI
  const { storagePath, remoteSync } = loadElectronConfig();
  currentStoragePath = storagePath;

  // Initialize engine with sync server so CLI can connect,
  // and connect to remote sync server if configured
  todu = await createTodu({
    storagePath,
    syncServer: true,
    remoteSync: remoteSync ?? undefined,
  });

  // Register all IPC handlers
  registerIpcHandlers(todu);

  // Join flow: Device B enters a join code (Device A's catalog document ID).
  // We write it to the catalog marker file and restart so the engine picks it up.
  ipcMain.handle("todu:sync:join", (_event, catalogId: string) => {
    const markerPath = path.join(currentStoragePath, "catalog.id");
    fs.writeFileSync(markerPath, catalogId.trim(), "utf-8");
    app.relaunch();
    app.exit(0);
  });

  // Create the main window
  const windowState = restoreWindowState();
  mainWindow = createWindow(windowState);

  // Forward Automerge change events to renderer
  setupChangeNotifications(todu, mainWindow);

  // Initialize settings, OAuth, and agent
  registerSettingsIpc();
  registerOAuthIpc(mainWindow);
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

  unregisterOAuthIpc();
  unregisterSettingsIpc();
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
