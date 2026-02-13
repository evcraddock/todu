import { createTodu } from "@todu/engine";
import type { Todu } from "@todu/engine";
import { BrowserWindow, app } from "electron";
import { setupChangeNotifications } from "./change-notifications.js";
import { registerIpcHandlers } from "./ipc.js";
import { createWindow, restoreWindowState, saveWindowState } from "./window.js";

let mainWindow: BrowserWindow | null = null;
let todu: Todu | null = null;

async function init(): Promise<void> {
  // Initialize engine with sync server so CLI can connect
  todu = await createTodu({ syncServer: true });

  // Register all IPC handlers
  registerIpcHandlers(todu);

  // Create the main window
  const windowState = restoreWindowState();
  mainWindow = createWindow(windowState);

  // Forward Automerge change events to renderer
  setupChangeNotifications(todu, mainWindow);

  // Save window state on move/resize
  mainWindow.on("resize", () => {
    if (mainWindow) saveWindowState(mainWindow);
  });
  mainWindow.on("move", () => {
    if (mainWindow) saveWindowState(mainWindow);
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(init);

app.on("window-all-closed", async () => {
  if (todu) {
    await todu.close();
    todu = null;
  }
  app.quit();
});

app.on("activate", () => {
  // macOS: re-create window when dock icon clicked
  if (BrowserWindow.getAllWindows().length === 0 && todu) {
    const windowState = restoreWindowState();
    mainWindow = createWindow(windowState);
  }
});
