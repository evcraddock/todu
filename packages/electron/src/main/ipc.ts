import fs from "node:fs";
import path from "node:path";
import { CATALOG_DOC_KEY, err, ok, type Result, type ToduError } from "@todu/core";
import { app, ipcMain } from "electron";
import type { DaemonConnectionManager } from "./daemon-connection-manager.js";
import { formatDaemonInvocationError, mapDaemonErrorToToduError } from "./daemon-error-mapping.js";

interface IpcAppLifecycle {
  relaunch(): void;
  exit(code?: number): void;
}

interface RegisterIpcHandlersOptions {
  daemon: Pick<DaemonConnectionManager, "request">;
  storagePath: string;
}

interface CreateDaemonIpcHandlersOptions extends RegisterIpcHandlersOptions {
  appLifecycle: IpcAppLifecycle;
}

type IpcHandler = (_event: unknown, ...args: unknown[]) => Promise<unknown> | unknown;

export { mapDaemonErrorToToduError };

/**
 * Register all IPC handlers for renderer API channels.
 *
 * Channel naming convention: todu:<namespace>:<method>
 */
export function registerIpcHandlers(options: RegisterIpcHandlersOptions): void {
  const handlers = createDaemonIpcHandlers({
    ...options,
    appLifecycle: app,
  });

  for (const [channel, handler] of Object.entries(handlers)) {
    ipcMain.handle(channel, handler);
  }
}

export function createDaemonIpcHandlers(
  options: CreateDaemonIpcHandlersOptions,
): Record<string, IpcHandler> {
  const invokeResult = <T>(method: string, params: Record<string, unknown> = {}) =>
    invokeDaemonResult<T>(options.daemon, method, params);

  const invokeRaw = <T>(method: string, params: Record<string, unknown> = {}) =>
    invokeDaemonRaw<T>(options.daemon, method, params);

  return {
    // ── Project ───────────────────────────────────────────────────────────
    "todu:project:list": (_event, filter) => invokeResult("project.list", { filter }),
    "todu:project:get": (_event, id) => invokeResult("project.get", { id }),
    "todu:project:create": (_event, input) => invokeResult("project.create", { input }),
    "todu:project:update": (_event, id, input) => invokeResult("project.update", { id, input }),
    "todu:project:delete": (_event, id) => invokeResult("project.delete", { id }),

    // ── Task ──────────────────────────────────────────────────────────────
    "todu:task:list": (_event, filter, sort) => invokeResult("task.list", { filter, sort }),
    "todu:task:get": (_event, id) => invokeResult("task.get", { id }),
    "todu:task:create": (_event, input) => invokeResult("task.create", { input }),
    "todu:task:update": (_event, id, input) => invokeResult("task.update", { id, input }),
    "todu:task:delete": (_event, id) => invokeResult("task.delete", { id }),
    "todu:task:move": (_event, id, projectId) => invokeResult("task.move", { id, projectId }),
    "todu:task:search": (_event, query) => invokeResult("task.search", { query }),

    // ── Label ─────────────────────────────────────────────────────────────
    "todu:label:list": () => invokeResult("label.list"),
    "todu:label:create": (_event, input) => invokeResult("label.create", { input }),
    "todu:label:update": (_event, id, input) => invokeResult("label.update", { id, input }),
    "todu:label:delete": (_event, id) => invokeResult("label.delete", { id }),

    // ── Note ──────────────────────────────────────────────────────────────
    "todu:note:list": (_event, filter) => invokeResult("note.list", { filter }),
    "todu:note:create": (_event, input) => invokeResult("note.create", { input }),
    "todu:note:update": (_event, id, input) => invokeResult("note.update", { id, input }),
    "todu:note:delete": (_event, id) => invokeResult("note.delete", { id }),

    // ── Recurring ─────────────────────────────────────────────────────────
    "todu:recurring:list": (_event, filter) => invokeResult("recurring.list", { filter }),
    "todu:recurring:get": (_event, id) => invokeResult("recurring.get", { id }),
    "todu:recurring:create": (_event, input) => invokeResult("recurring.create", { input }),
    "todu:recurring:update": (_event, id, input) => invokeResult("recurring.update", { id, input }),
    "todu:recurring:delete": (_event, id) => invokeResult("recurring.delete", { id }),
    "todu:recurring:pause": (_event, id) => invokeResult("recurring.pause", { id }),
    "todu:recurring:resume": (_event, id) => invokeResult("recurring.resume", { id }),
    "todu:recurring:upcoming": (_event, optionsArg) =>
      invokeResult("recurring.upcoming", { options: optionsArg }),
    "todu:recurring:generate": (_event, templateId, date) =>
      invokeResult("recurring.generate", { templateId, date }),
    "todu:recurring:process": () => invokeResult("recurring.process"),

    // ── Habit ─────────────────────────────────────────────────────────────
    "todu:habit:list": (_event, filter) => invokeResult("habit.list", { filter }),
    "todu:habit:get": (_event, id) => invokeResult("habit.get", { id }),
    "todu:habit:create": (_event, input) => invokeResult("habit.create", { input }),
    "todu:habit:update": (_event, id, input) => invokeResult("habit.update", { id, input }),
    "todu:habit:delete": (_event, id) => invokeResult("habit.delete", { id }),
    "todu:habit:pause": (_event, id) => invokeResult("habit.pause", { id }),
    "todu:habit:resume": (_event, id) => invokeResult("habit.resume", { id }),
    "todu:habit:check": (_event, id) => invokeResult("habit.check", { id }),
    "todu:habit:uncheck": (_event, id) => invokeResult("habit.uncheck", { id }),
    "todu:habit:streak": (_event, id) => invokeResult("habit.streak", { id }),
    "todu:habit:history": (_event, id, days) => invokeResult("habit.history", { id, days }),

    // ── Sync ──────────────────────────────────────────────────────────────
    "todu:sync:status": () => invokeRaw("sync.status"),
    "todu:sync:start": () => invokeRaw("sync.start"),
    "todu:sync:stop": () => invokeRaw("sync.stop"),
    "todu:sync:catalog-id": () => invokeRaw("sync.catalogId"),

    // Join flow: Device B writes Device A's catalog document ID to the
    // marker file and restarts so the engine picks it up on next launch.
    //
    // Basic format guard: Automerge document IDs are URL-safe base58/base64
    // strings of ~22+ characters. Reject obviously malformed input to avoid
    // restarting into a broken state that requires manual file recovery.
    "todu:sync:join": (_event, catalogId: unknown) => {
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

      const markerPath = path.join(options.storagePath, `${CATALOG_DOC_KEY}.id`);
      fs.writeFileSync(markerPath, trimmed, "utf-8");
      options.appLifecycle.relaunch();
      options.appLifecycle.exit(0);
    },
  };
}

async function invokeDaemonResult<T>(
  daemon: Pick<DaemonConnectionManager, "request">,
  method: string,
  params: Record<string, unknown>,
): Promise<Result<T, ToduError>> {
  const response = await daemon.request<T>(method, params);
  if (response.ok) {
    return ok(response.value);
  }

  return err(mapDaemonErrorToToduError(method, response.error));
}

async function invokeDaemonRaw<T>(
  daemon: Pick<DaemonConnectionManager, "request">,
  method: string,
  params: Record<string, unknown>,
): Promise<T> {
  const response = await daemon.request<T>(method, params);
  if (response.ok) {
    return response.value;
  }

  throw new Error(formatDaemonInvocationError(method, response.error));
}
