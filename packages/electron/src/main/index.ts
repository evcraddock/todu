import { app, BrowserWindow, dialog } from "electron";
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
import { createDesktopErrorLog, formatDesktopStartupError } from "./error-log.js";
import { registerIpcHandlers } from "./ipc.js";
import { registerOAuthIpc, unregisterOAuthIpc } from "./oauth.js";

import { registerSettingsIpc, unregisterSettingsIpc } from "./settings.js";
import { registerGlobalShortcuts, unregisterGlobalShortcuts } from "./shortcuts.js";
import { destroyTray, setupTray } from "./tray.js";
import { createWindow, restoreWindowState, saveWindowState } from "./window.js";

let mainWindow: BrowserWindow | null = null;
let daemonConnectionManager: DaemonConnectionManager | null = null;
let isQuitting = false;
let daemonVersion: string | undefined;
let daemonSocketPath: string | undefined;

app.setAppLogsPath();
const errorLog = createDesktopErrorLog({ directory: app.getPath("logs") });
const errorContext = () => ({
  socketPath: daemonSocketPath,
  desktopVersion: app.getVersion(),
  daemonVersion,
  clientProtocol: DAEMON_PROTOCOL_VERSION,
});

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
    throw Object.assign(
      new Error(`Daemon ${method} failed: ${result.error.code} ${result.error.message}`, {
        cause: result.error,
      }),
      { code: result.error.code },
    );
  }
}

async function init(): Promise<void> {
  const { storagePath } = loadElectronConfig();
  const socketPath = resolveDaemonSocketPath(storagePath);

  daemonSocketPath = socketPath;

  daemonConnectionManager = createDaemonConnectionManager({
    socketPath,
    hooks: {
      onConnected: async ({ request }) => {
        const hello = await request<{ daemonVersion: string }>("daemon.hello", {
          protocolVersion: DAEMON_PROTOCOL_VERSION,
        });
        assertRequestOk(hello, "daemon.hello");
        daemonVersion = hello.value.daemonVersion;
        await subscribeRendererToDaemonEvents({ request });
      },
      onReconnected: async ({ request }) => {
        const refreshEvents = await buildReconnectRefreshEvents({ request });
        for (const event of refreshEvents) {
          dispatchRendererEvent(getMainWindow(), event);
        }
      },
      onDisconnected: ({ reason }) => {
        if (!isQuitting) errorLog.write("disconnect", reason, errorContext());
      },
      onReconnectScheduled: (info) => {
        errorLog.write("reconnect", info.reason, {
          ...errorContext(),
          attempt: info.attempt,
          delayMs: info.delayMs,
        });
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
    protocolMismatchHint:
      "Use desktop and daemon releases with compatible protocol versions. The desktop app will not replace or restart the existing daemon.",
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
    errorLog.write("startup", error, errorContext());
    dialog.showErrorBox("todu startup failed", formatDesktopStartupError(error, errorLog));
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
