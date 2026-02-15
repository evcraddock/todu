import fs from "node:fs";
import path from "node:path";
import { is } from "@electron-toolkit/utils";
import { app, BrowserWindow, shell } from "electron";

// ============================================================================
// Window State Persistence
// ============================================================================

export interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
  maximized: boolean;
}

const DEFAULT_STATE: WindowState = {
  width: 1200,
  height: 800,
  maximized: false,
};

function getStatePath(): string {
  const configDir = path.join(app.getPath("userData"));
  return path.join(configDir, "window-state.json");
}

export function restoreWindowState(): WindowState {
  try {
    const statePath = getStatePath();
    if (fs.existsSync(statePath)) {
      const data = fs.readFileSync(statePath, "utf-8");
      const parsed = JSON.parse(data) as Partial<WindowState>;
      return {
        x: parsed.x,
        y: parsed.y,
        width: parsed.width ?? DEFAULT_STATE.width,
        height: parsed.height ?? DEFAULT_STATE.height,
        maximized: parsed.maximized ?? DEFAULT_STATE.maximized,
      };
    }
  } catch {
    // Ignore corrupt state file, use defaults
  }
  return { ...DEFAULT_STATE };
}

export function saveWindowState(win: BrowserWindow): void {
  if (win.isDestroyed()) return;

  const maximized = win.isMaximized();
  // Only save position/size when not maximized
  const bounds = maximized ? undefined : win.getBounds();

  const state: WindowState = {
    x: bounds?.x,
    y: bounds?.y,
    width: bounds?.width ?? DEFAULT_STATE.width,
    height: bounds?.height ?? DEFAULT_STATE.height,
    maximized,
  };

  try {
    const statePath = getStatePath();
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf-8");
  } catch {
    // Non-critical, ignore write failures
  }
}

// ============================================================================
// Window Creation
// ============================================================================

export function createWindow(state: WindowState): BrowserWindow {
  const win = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 800,
    minHeight: 600,
    show: false,
    title: "todu",
    webPreferences: {
      preload: path.join(__dirname, "../preload/index.mjs"),
      sandbox: false,
    },
  });

  if (state.maximized) {
    win.maximize();
  }

  // Show window when ready to avoid visual flash
  win.once("ready-to-show", () => {
    win.show();
  });

  // Open external links in default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Load renderer
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    win.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    win.loadFile(path.join(__dirname, "../renderer/index.html"));
  }

  return win;
}
