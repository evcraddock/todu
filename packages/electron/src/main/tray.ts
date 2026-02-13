import type { Todu } from "@todu/engine";
import { type BrowserWindow, Menu, Tray, app, nativeImage } from "electron";

let tray: Tray | null = null;

/**
 * Create a tray icon from an embedded 16x16 PNG.
 */
function createTrayIcon(): Tray {
  const img = nativeImage.createFromDataURL(
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAA" +
      "jklEQVQ4T2NkoBAwUqifAacBf/78+c/AwMDIQIoBjMguwGZAeHg4w5UrVxjOnTvH8P37" +
      "dwYGBgYGLS0thvDwcIaIiAiGsLAwBmxqsRqAyyBkQ7AagMsgdENwGkDIIGwuwGoAIYOI" +
      "MgCfQdgMwWkAPoPQDcJpAD6D0A0iyQBsBmEzhGgDsBmEbAgAg5RJEUfYDJkAAAAASUVO" +
      "RK5CYII=",
  );

  if (process.platform === "darwin") {
    img.setTemplateImage(true);
  }

  return new Tray(img);
}

/**
 * Build the tray context menu with live counts.
 */
async function buildContextMenu(
  todu: Todu,
  mainWindow: BrowserWindow | null,
  onNewTask: () => void,
): Promise<Menu> {
  let dueToday = 0;
  let habitsToCheck = 0;

  try {
    const tasksResult = await todu.task.list({ today: true });
    if (tasksResult.ok) {
      dueToday = tasksResult.value.filter(
        (t) => t.status !== "done" && t.status !== "canceled",
      ).length;
    }
  } catch {
    // Ignore errors in tray menu
  }

  try {
    const habitsResult = await todu.habit.list({ paused: false });
    if (habitsResult.ok) {
      for (const habit of habitsResult.value) {
        try {
          const streakResult = await todu.habit.streak(habit.id);
          if (streakResult.ok && !streakResult.value.completedToday) {
            habitsToCheck++;
          }
        } catch {
          // Ignore per-habit errors
        }
      }
    }
  } catch {
    // Ignore errors in tray menu
  }

  const isVisible = mainWindow?.isVisible() ?? false;

  return Menu.buildFromTemplate([
    {
      label: isVisible ? "Hide todu" : "Show todu",
      click: () => {
        if (mainWindow) {
          if (mainWindow.isVisible()) {
            mainWindow.hide();
          } else {
            mainWindow.show();
            mainWindow.focus();
          }
        }
      },
    },
    { type: "separator" },
    {
      label: "+ New Task…",
      click: () => {
        onNewTask();
      },
    },
    { type: "separator" },
    {
      label: `📋 ${dueToday} task${dueToday === 1 ? "" : "s"} due today`,
      enabled: false,
    },
    {
      label: `🔥 ${habitsToCheck} habit${habitsToCheck === 1 ? "" : "s"} to check`,
      enabled: false,
    },
    { type: "separator" },
    {
      label: "Quit",
      click: () => {
        app.quit();
      },
    },
  ]);
}

/**
 * Set up the system tray icon and context menu.
 */
export function setupTray(
  todu: Todu,
  getMainWindow: () => BrowserWindow | null,
  onNewTask: () => void,
): void {
  tray = createTrayIcon();
  tray.setToolTip("todu");

  if (process.platform === "darwin") {
    // macOS: click shows context menu (standard macOS tray behavior)
    tray.on("click", async () => {
      const menu = await buildContextMenu(todu, getMainWindow(), onNewTask);
      tray?.popUpContextMenu(menu);
    });
  } else {
    // Linux/Windows: click toggles window, right-click shows menu
    tray.on("click", () => {
      const win = getMainWindow();
      if (win) {
        if (win.isVisible()) {
          win.hide();
        } else {
          win.show();
          win.focus();
        }
      }
    });
    tray.on("right-click", async () => {
      const menu = await buildContextMenu(todu, getMainWindow(), onNewTask);
      tray?.popUpContextMenu(menu);
    });
  }
}

/**
 * Destroy the tray icon.
 */
export function destroyTray(): void {
  if (tray) {
    tray.destroy();
    tray = null;
  }
}
