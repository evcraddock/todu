import type { SyncStatus, Todu } from "@todu/engine";
import type { BrowserWindow } from "electron";

/**
 * Forward engine data changes to the renderer process.
 *
 * Uses coarse-grained invalidation: any change triggers a single
 * "todu:data:changed" event. The renderer invalidates all React Query
 * caches and re-fetches visible data. Simple and correct for single-user.
 *
 * Also forwards remote sync status changes so the renderer can show
 * a connection indicator without polling.
 */
export function setupChangeNotifications(todu: Todu, mainWindow: BrowserWindow): () => void {
  const unsubscribeData = todu.onChange(() => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("todu:data:changed", { type: "catalog" });
    }
  });

  const unsubscribeSync = todu.sync.onStatusChange((status: SyncStatus) => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("todu:sync:status-changed", status);
    }
  });

  return () => {
    unsubscribeData();
    unsubscribeSync();
  };
}
