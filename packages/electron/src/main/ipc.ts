import fs from "node:fs";
import path from "node:path";
import type { Todu } from "@todu/engine";
import { app, ipcMain } from "electron";

/**
 * Register all IPC handlers for the engine SDK.
 *
 * Channel naming convention: todu:<namespace>:<method>
 * Each handler wraps the corresponding engine SDK method and returns
 * the Result<T> directly — the renderer handles ok/error.
 */
export function registerIpcHandlers(todu: Todu, storagePath: string): void {
  // ── Project ──────────────────────────────────────────────────────────
  ipcMain.handle("todu:project:list", (_, filter) => todu.project.list(filter));
  ipcMain.handle("todu:project:get", (_, id) => todu.project.get(id));
  ipcMain.handle("todu:project:create", (_, input) => todu.project.create(input));
  ipcMain.handle("todu:project:update", (_, id, input) => todu.project.update(id, input));
  ipcMain.handle("todu:project:delete", (_, id) => todu.project.delete(id));

  // ── Task ─────────────────────────────────────────────────────────────
  ipcMain.handle("todu:task:list", (_, filter, sort) => todu.task.list(filter, sort));
  ipcMain.handle("todu:task:get", (_, id) => todu.task.get(id));
  ipcMain.handle("todu:task:create", (_, input) => todu.task.create(input));
  ipcMain.handle("todu:task:update", (_, id, input) => todu.task.update(id, input));
  ipcMain.handle("todu:task:delete", (_, id) => todu.task.delete(id));
  ipcMain.handle("todu:task:move", (_, id, projectId) => todu.task.move(id, projectId));
  ipcMain.handle("todu:task:search", (_, query) => todu.task.search(query));

  // ── Label ────────────────────────────────────────────────────────────
  ipcMain.handle("todu:label:list", () => todu.label.list());
  ipcMain.handle("todu:label:create", (_, input) => todu.label.create(input));
  ipcMain.handle("todu:label:update", (_, id, input) => todu.label.update(id, input));
  ipcMain.handle("todu:label:delete", (_, id) => todu.label.delete(id));

  // ── Note ─────────────────────────────────────────────────────────────
  ipcMain.handle("todu:note:list", (_, filter) => todu.note.list(filter));
  ipcMain.handle("todu:note:create", (_, input) => todu.note.create(input));
  ipcMain.handle("todu:note:update", (_, id, input) => todu.note.update(id, input));
  ipcMain.handle("todu:note:delete", (_, id) => todu.note.delete(id));

  // ── Recurring ────────────────────────────────────────────────────────
  ipcMain.handle("todu:recurring:list", (_, filter) => todu.recurring.list(filter));
  ipcMain.handle("todu:recurring:get", (_, id) => todu.recurring.get(id));
  ipcMain.handle("todu:recurring:create", (_, input) => todu.recurring.create(input));
  ipcMain.handle("todu:recurring:update", (_, id, input) => todu.recurring.update(id, input));
  ipcMain.handle("todu:recurring:delete", (_, id) => todu.recurring.delete(id));
  ipcMain.handle("todu:recurring:pause", (_, id) => todu.recurring.pause(id));
  ipcMain.handle("todu:recurring:resume", (_, id) => todu.recurring.resume(id));
  ipcMain.handle("todu:recurring:upcoming", (_, options) => todu.recurring.upcoming(options));
  ipcMain.handle("todu:recurring:generate", (_, templateId, date) =>
    todu.recurring.generate(templateId, date),
  );
  ipcMain.handle("todu:recurring:process", () => todu.recurring.process());

  // ── Habit ────────────────────────────────────────────────────────────
  ipcMain.handle("todu:habit:list", (_, filter) => todu.habit.list(filter));
  ipcMain.handle("todu:habit:get", (_, id) => todu.habit.get(id));
  ipcMain.handle("todu:habit:create", (_, input) => todu.habit.create(input));
  ipcMain.handle("todu:habit:update", (_, id, input) => todu.habit.update(id, input));
  ipcMain.handle("todu:habit:delete", (_, id) => todu.habit.delete(id));
  ipcMain.handle("todu:habit:pause", (_, id) => todu.habit.pause(id));
  ipcMain.handle("todu:habit:resume", (_, id) => todu.habit.resume(id));
  ipcMain.handle("todu:habit:check", (_, id) => todu.habit.check(id));
  ipcMain.handle("todu:habit:uncheck", (_, id) => todu.habit.uncheck(id));
  ipcMain.handle("todu:habit:streak", (_, id) => todu.habit.streak(id));
  ipcMain.handle("todu:habit:history", (_, id, days) => todu.habit.history(id, days));

  // ── Sync ─────────────────────────────────────────────────────────────
  ipcMain.handle("todu:sync:status", () => todu.sync.status());
  ipcMain.handle("todu:sync:start", () => todu.sync.start());
  ipcMain.handle("todu:sync:stop", () => todu.sync.stop());
  ipcMain.handle("todu:sync:catalog-id", () => todu.sync.getCatalogId());

  // Join flow: Device B writes Device A's catalog document ID to the
  // marker file and restarts so the engine picks it up on next launch.
  //
  // Basic format guard: Automerge document IDs are URL-safe base58/base64
  // strings of ~22+ characters. Reject obviously malformed input to avoid
  // restarting into a broken state that requires manual file recovery.
  ipcMain.handle("todu:sync:join", (_event, catalogId: unknown) => {
    if (typeof catalogId !== "string") {
      throw new Error("Invalid join code: must be a string");
    }
    const trimmed = catalogId.trim();
    if (trimmed.length < 10) {
      throw new Error("Invalid join code: too short");
    }
    if (!/^[a-zA-Z0-9+/=_-]+$/.test(trimmed)) {
      throw new Error("Invalid join code: contains unexpected characters");
    }
    const markerPath = path.join(storagePath, "catalog.id");
    fs.writeFileSync(markerPath, trimmed, "utf-8");
    app.relaunch();
    app.exit(0);
  });
}
