import { contextBridge, ipcRenderer } from "electron";

/**
 * Typed API exposed to the renderer via contextBridge.
 * The renderer accesses this as `window.todu`.
 *
 * Each method maps 1:1 to an IPC channel registered in main/ipc.ts.
 */
const api = {
  // ── Actor ──────────────────────────────────────────────────────────
  actor: {
    list: () => ipcRenderer.invoke("todu:actor:list"),
    create: (input: unknown) => ipcRenderer.invoke("todu:actor:create", input),
    rename: (id: string, displayName: string) =>
      ipcRenderer.invoke("todu:actor:rename", id, displayName),
    archive: (id: string) => ipcRenderer.invoke("todu:actor:archive", id),
    unarchive: (id: string) => ipcRenderer.invoke("todu:actor:unarchive", id),
  },

  // ── Project ────────────────────────────────────────────────────────
  project: {
    list: (filter?: unknown) => ipcRenderer.invoke("todu:project:list", filter),
    get: (id: string) => ipcRenderer.invoke("todu:project:get", id),
    create: (input: unknown) => ipcRenderer.invoke("todu:project:create", input),
    update: (id: string, input: unknown) => ipcRenderer.invoke("todu:project:update", id, input),
    delete: (id: string) => ipcRenderer.invoke("todu:project:delete", id),
  },

  // ── Task ───────────────────────────────────────────────────────────
  task: {
    list: (filter?: unknown, sort?: unknown) => ipcRenderer.invoke("todu:task:list", filter, sort),
    get: (id: string) => ipcRenderer.invoke("todu:task:get", id),
    create: (input: unknown) => ipcRenderer.invoke("todu:task:create", input),
    update: (id: string, input: unknown) => ipcRenderer.invoke("todu:task:update", id, input),
    delete: (id: string) => ipcRenderer.invoke("todu:task:delete", id),
    move: (id: string, projectId: string) => ipcRenderer.invoke("todu:task:move", id, projectId),
    search: (query: string) => ipcRenderer.invoke("todu:task:search", query),
  },

  // ── Approval ───────────────────────────────────────────────────────
  approval: {
    list: (filter?: unknown) => ipcRenderer.invoke("todu:approval:list", filter),
    approveTaskDescription: (taskId: string) =>
      ipcRenderer.invoke("todu:approval:approve-task-description", taskId),
    approveNoteContent: (noteId: string) =>
      ipcRenderer.invoke("todu:approval:approve-note-content", noteId),
  },

  // ── Label ──────────────────────────────────────────────────────────
  label: {
    list: () => ipcRenderer.invoke("todu:label:list"),
    create: (input: unknown) => ipcRenderer.invoke("todu:label:create", input),
    update: (id: string, input: unknown) => ipcRenderer.invoke("todu:label:update", id, input),
    delete: (id: string) => ipcRenderer.invoke("todu:label:delete", id),
  },

  // ── Note ───────────────────────────────────────────────────────────
  note: {
    list: (filter?: unknown) => ipcRenderer.invoke("todu:note:list", filter),
    get: (id: string) => ipcRenderer.invoke("todu:note:get", id),
    create: (input: unknown) => ipcRenderer.invoke("todu:note:create", input),
    update: (id: string, input: unknown) => ipcRenderer.invoke("todu:note:update", id, input),
    delete: (id: string) => ipcRenderer.invoke("todu:note:delete", id),
  },

  // ── Recurring ──────────────────────────────────────────────────────
  recurring: {
    list: (filter?: unknown) => ipcRenderer.invoke("todu:recurring:list", filter),
    get: (id: string) => ipcRenderer.invoke("todu:recurring:get", id),
    create: (input: unknown) => ipcRenderer.invoke("todu:recurring:create", input),
    update: (id: string, input: unknown) => ipcRenderer.invoke("todu:recurring:update", id, input),
    delete: (id: string) => ipcRenderer.invoke("todu:recurring:delete", id),
    pause: (id: string) => ipcRenderer.invoke("todu:recurring:pause", id),
    resume: (id: string) => ipcRenderer.invoke("todu:recurring:resume", id),
    upcoming: (options?: unknown) => ipcRenderer.invoke("todu:recurring:upcoming", options),
    generate: (templateId: string, date: string) =>
      ipcRenderer.invoke("todu:recurring:generate", templateId, date),
    process: () => ipcRenderer.invoke("todu:recurring:process"),
  },

  // ── Habit ──────────────────────────────────────────────────────────
  habit: {
    list: (filter?: unknown) => ipcRenderer.invoke("todu:habit:list", filter),
    get: (id: string) => ipcRenderer.invoke("todu:habit:get", id),
    create: (input: unknown) => ipcRenderer.invoke("todu:habit:create", input),
    update: (id: string, input: unknown) => ipcRenderer.invoke("todu:habit:update", id, input),
    delete: (id: string) => ipcRenderer.invoke("todu:habit:delete", id),
    pause: (id: string) => ipcRenderer.invoke("todu:habit:pause", id),
    resume: (id: string) => ipcRenderer.invoke("todu:habit:resume", id),
    check: (id: string) => ipcRenderer.invoke("todu:habit:check", id),
    uncheck: (id: string) => ipcRenderer.invoke("todu:habit:uncheck", id),
    streak: (id: string) => ipcRenderer.invoke("todu:habit:streak", id),
    history: (id: string, days?: number) => ipcRenderer.invoke("todu:habit:history", id, days),
  },

  // ── Agent ──────────────────────────────────────────────────────────
  agent: {
    send: (message: string) => ipcRenderer.invoke("todu:agent:send", message),
    abort: () => ipcRenderer.invoke("todu:agent:abort"),
    clear: () => ipcRenderer.invoke("todu:agent:clear"),
    setModel: (provider: string, modelId: string) =>
      ipcRenderer.invoke("todu:agent:set-model", provider, modelId),
    focusEntity: (entityType: string, entityId: string) =>
      ipcRenderer.invoke("todu:agent:focus-entity", entityType, entityId),
    clearFocusedEntity: () => ipcRenderer.invoke("todu:agent:clear-focused-entity"),
  },

  // ── OAuth ──────────────────────────────────────────────────────
  oauth: {
    login: (providerId: string) => ipcRenderer.invoke("todu:oauth:login", providerId),
    promptResponse: (code: string) => ipcRenderer.invoke("todu:oauth:prompt-response", code),
    cancel: () => ipcRenderer.invoke("todu:oauth:cancel"),
    status: () => ipcRenderer.invoke("todu:oauth:status"),
    disconnect: (providerId: string) => ipcRenderer.invoke("todu:oauth:disconnect", providerId),
  },

  // ── Settings ─────────────────────────────────────────────────────
  settings: {
    get: () => ipcRenderer.invoke("todu:settings:get"),
    save: (settings: { provider: string; modelId: string; timezone: string }) =>
      ipcRenderer.invoke("todu:settings:save", settings),
    setApiKey: (provider: string, key: string) =>
      ipcRenderer.invoke("todu:settings:set-api-key", provider, key),
    removeApiKey: (provider: string) =>
      ipcRenderer.invoke("todu:settings:remove-api-key", provider),
    storedProviders: () => ipcRenderer.invoke("todu:settings:stored-providers"),
    providers: () => ipcRenderer.invoke("todu:settings:providers"),
    version: () => ipcRenderer.invoke("todu:settings:version"),
  },

  // ── Sync ─────────────────────────────────────────────────────────
  sync: {
    status: () => ipcRenderer.invoke("todu:sync:status"),
    start: () => ipcRenderer.invoke("todu:sync:start"),
    stop: () => ipcRenderer.invoke("todu:sync:stop"),
    getCatalogId: () => ipcRenderer.invoke("todu:sync:catalog-id"),
    joinCheck: (catalogId: string) => ipcRenderer.invoke("todu:sync:join-check", catalogId),
    join: (catalogId: string) => ipcRenderer.invoke("todu:sync:join", catalogId),
  },

  // ── Events ─────────────────────────────────────────────────────────
  // For change notifications and future agent events.
  // Restricted to an allowlist of known channels for security.
  on: (channel: string, callback: (data: unknown) => void) => {
    const ALLOWED_CHANNELS = [
      "todu:data:changed",
      "todu:agent:event",
      "todu:oauth:event",
      "todu:action",
      "todu:ui-action",
      "todu:sync:status-changed",
    ];
    if (!ALLOWED_CHANNELS.includes(channel)) {
      console.warn(`Blocked listen on unknown channel: ${channel}`);
      return () => {};
    }
    const listener = (_event: Electron.IpcRendererEvent, data: unknown): void => {
      callback(data);
    };
    ipcRenderer.on(channel, listener);
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(channel, listener);
    };
  },
};

contextBridge.exposeInMainWorld("todu", api);

export type ToduApi = typeof api;
