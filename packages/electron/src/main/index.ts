import { app, BrowserWindow } from "electron";
import { setupAgent, teardownAgent } from "./agent.js";
import {
  buildReconnectRefreshEvents,
  dispatchRendererEvent,
  mapDaemonEventToRendererEvent,
  subscribeRendererToDaemonEvents,
} from "./change-notifications.js";
import { loadElectronConfig } from "./config.js";
import {
  createDaemonConnectionManager,
  DAEMON_PROTOCOL_VERSION,
  type DaemonConnectionManager,
  type DaemonConnectionResult,
  resolveDaemonSocketPath,
} from "./daemon-connection-manager.js";
import { ensureDaemonReady } from "./daemon-startup.js";
import { createDaemonToduClient } from "./daemon-todu-client.js";
import { registerIpcHandlers } from "./ipc.js";
import { registerOAuthIpc, unregisterOAuthIpc } from "./oauth.js";

import { registerSettingsIpc, unregisterSettingsIpc } from "./settings.js";
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from "./shortcuts.js";
import { destroyTray, setupTray } from "./tray.js";
import { createWindow, restoreWindowState, saveWindowState } from "./window.js";

let mainWindow: BrowserWindow | null = null;
let daemonConnectionManager: DaemonConnectionManager | null = null;
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

function assertRequestOk<T>(
  result: DaemonConnectionResult<T>,
  method: string,
): asserts result is { ok: true; value: T } {
  if (!result.ok) {
    throw new Error(`Daemon ${method} failed: ${result.error.code} ${result.error.message}`);
  }
}

async function init(): Promise<void> {
  const { storagePath } = loadElectronConfig();

  daemonConnectionManager = createDaemonConnectionManager({
    socketPath: resolveDaemonSocketPath(storagePath),
    hooks: {
      onConnected: async ({ request }) => {
        const hello = await request("daemon.hello", {
          protocolVersion: DAEMON_PROTOCOL_VERSION,
        });
        assertRequestOk(hello, "daemon.hello");

        await subscribeRendererToDaemonEvents({ request });
      },
      onReconnected: async ({ request }) => {
        const refreshEvents = await buildReconnectRefreshEvents({ request });
        for (const event of refreshEvents) {
          dispatchRendererEvent(getMainWindow(), event);
        }
      },
      onEvent: (event) => {
        const rendererEvent = mapDaemonEventToRendererEvent(event);
        if (!rendererEvent) {
          return;
        }

        dispatchRendererEvent(getMainWindow(), rendererEvent);
      },
    },
  });
  daemonConnectionManager.start();

  await ensureDaemonReady(daemonConnectionManager, {
    protocolVersion: DAEMON_PROTOCOL_VERSION,
  });

  const daemonTodu = createDaemonToduClient(daemonConnectionManager);

  // Register all IPC handlers
  registerIpcHandlers({
    daemon: daemonConnectionManager,
    storagePath,
  });

  // Create the main window
  const windowState = restoreWindowState();
  mainWindow = createWindow(windowState);

  // Initialize settings, OAuth, and agent
  registerSettingsIpc();
  registerOAuthIpc(mainWindow);
  setupAgent(daemonTodu, mainWindow);

  // Set up system tray
  setupTray(daemonTodu, getMainWindow, () => showWindowWithAction("new-task"));

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

app
  .whenReady()
  .then(init)
  .catch((error) => {
    console.error(error);
    app.quit();
  });

// Mark as quitting so the close handler allows it through
app.on("before-quit", () => {
  isQuitting = true;
  daemonConnectionManager?.stop();
  daemonConnectionManager = null;
});

app.on("window-all-closed", async () => {
  unregisterGlobalShortcuts();
  destroyTray();
  teardownAgent();

  unregisterOAuthIpc();
  unregisterSettingsIpc();
  daemonConnectionManager?.stop();
  daemonConnectionManager = null;

  app.quit();
});

app.on("will-quit", () => {
  unregisterGlobalShortcuts();
  destroyTray();
});

app.on("activate", () => {
  // macOS: re-create window when dock icon clicked
  if (BrowserWindow.getAllWindows().length === 0) {
    const windowState = restoreWindowState();
    mainWindow = createWindow(windowState);
  } else if (mainWindow && !mainWindow.isVisible()) {
    mainWindow.show();
    mainWindow.focus();
  }
});
