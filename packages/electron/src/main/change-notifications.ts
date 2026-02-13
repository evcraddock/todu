import type { Todu } from "@todu/engine";
import type { BrowserWindow } from "electron";

/**
 * Forward engine data changes to the renderer process.
 *
 * Uses coarse-grained invalidation: any change triggers a single
 * "todu:data:changed" event. The renderer invalidates all React Query
 * caches and re-fetches visible data. Simple and correct for single-user.
 */
export function setupChangeNotifications(todu: Todu, mainWindow: BrowserWindow): () => void {
  return todu.onChange(() => {
    if (!mainWindow.isDestroyed()) {
      mainWindow.webContents.send("todu:data:changed", { type: "catalog" });
    }
  });
}
