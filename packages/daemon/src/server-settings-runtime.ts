import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import {
  type RemoteSyncSettings,
  resolveRemoteSyncSettings,
  type ToduFileConfig,
  updateRemoteSyncSettings,
  validationError,
} from "@todu/core";
import type { Todu } from "@todu/engine";
import { isMap, parseDocument } from "yaml";
import {
  createProtocolError,
  createProtocolErrorFrame,
  createProtocolSuccessFrame,
  mapErrorToProtocolError,
  type ProtocolRequestFrame,
} from "./protocol.js";
import type { DaemonRpcNamespaceHandlers } from "./rpc.js";

/** Machine-local settings only; no dataset mutation or daemon restart. */
export function createServerSettingsRuntime(options: {
  configPath: string;
  initialSettings: RemoteSyncSettings;
  env: NodeJS.ProcessEnv;
  getTodu(): Todu | null;
  isRunning(): boolean;
  onConfigured(settings: RemoteSyncSettings): void;
}): { handlers: DaemonRpcNamespaceHandlers; isBusy(): boolean } {
  let settings = { ...options.initialSettings };
  let operation: Promise<unknown> = Promise.resolve();
  let pending = 0;
  function status() {
    return {
      configPath: options.configPath,
      ...(options.getTodu()?.sync.serverStatus() ?? {
        ...settings,
        running: false,
        state: "disconnected",
      }),
    };
  }
  async function configure(request: ProtocolRequestFrame) {
    if (!options.isRunning())
      return createProtocolErrorFrame(
        request.id,
        createProtocolError(
          "PRECONDITION_FAILED",
          "Daemon is not ready for server configuration (startup, shutdown, or dataset switch in progress)",
        ),
      );
    if (
      request.params.configPath !== undefined &&
      (typeof request.params.configPath !== "string" ||
        path.resolve(request.params.configPath) !== options.configPath)
    )
      return createProtocolErrorFrame(
        request.id,
        createProtocolError(
          "PRECONDITION_FAILED",
          `Use the running daemon's configuration: ${options.configPath}. No settings changed.`,
        ),
      );
    const input = request.params.settings;
    const validated = updateRemoteSyncSettings(settings, input);
    if (!validated.ok)
      return createProtocolErrorFrame(request.id, mapErrorToProtocolError(validated.error));
    try {
      let content = "";
      try {
        content = fs.readFileSync(options.configPath, "utf8");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const doc = parseDocument(content);
      if (doc.errors.length) throw doc.errors[0];
      if (doc.contents !== null && !isMap(doc.contents))
        throw new Error("Configuration must be a YAML mapping");
      const update = input as Record<string, unknown>;
      for (const key of Object.keys(update))
        doc.setIn(["sync", "remote", key], validated.value[key as keyof RemoteSyncSettings]);
      const next = resolveRemoteSyncSettings((doc.toJS() ?? {}) as ToduFileConfig, {
        env: options.env,
      });
      for (const key of Object.keys(update) as Array<keyof RemoteSyncSettings>) {
        if (next[key] !== validated.value[key])
          return createProtocolErrorFrame(
            request.id,
            mapErrorToProtocolError(
              validationError(
                `sync.remote.${key}`,
                `An environment override prevents this change. Update TODU_SYNC_SERVER/TODU_SYNC_ENABLED in the daemon's service environment and restart. No settings changed.`,
              ),
            ),
          );
      }
      fs.mkdirSync(path.dirname(options.configPath), { recursive: true });
      const entry = fs.lstatSync(options.configPath, { throwIfNoEntry: false });
      const filePath = entry ? fs.realpathSync(options.configPath) : options.configPath;
      const existing = entry ? fs.statSync(filePath) : undefined;
      if (existing) fs.accessSync(filePath, fs.constants.W_OK);
      const staged = `${filePath}.${randomUUID()}.tmp`;
      const mode = existing ? existing.mode & 0o777 : 0o600;
      const todu = options.getTodu();
      const previous = { ...settings };
      const previouslyRunning = todu?.sync.serverStatus().running;
      let applied = false;
      try {
        fs.writeFileSync(staged, doc.toString(), { mode });
        if (existing) fs.chmodSync(staged, mode);
        if (existing && process.platform !== "win32") {
          const stagedStat = fs.statSync(staged);
          if (stagedStat.uid !== existing.uid || stagedStat.gid !== existing.gid)
            fs.chownSync(staged, existing.uid, existing.gid);
        }
        if (todu) {
          const result = await todu.sync.configureServer(next);
          if (!result.ok)
            return createProtocolErrorFrame(request.id, mapErrorToProtocolError(result.error));
          applied = true;
        }
        const unchanged = fs.existsSync(filePath)
          ? fs.readFileSync(filePath, "utf8") === content
          : content === "";
        if (
          !unchanged ||
          (fs.existsSync(options.configPath) && fs.realpathSync(options.configPath) !== filePath)
        )
          throw new Error("Configuration changed during server update; retry after inspecting it");
        if (existing) fs.accessSync(filePath, fs.constants.W_OK);
        fs.renameSync(staged, filePath);
      } catch (error) {
        if (applied && todu) {
          const restored = await todu.sync.configureServer(previous);
          if (!restored.ok)
            throw new Error(
              `Could not save server settings or restore runtime: ${String(error)}; ${JSON.stringify(restored.error)}`,
            );
          if (previouslyRunning !== restored.value.running) {
            if (previouslyRunning) await todu.sync.start();
            else await todu.sync.stop();
          }
        }
        throw error;
      } finally {
        fs.rmSync(staged, { force: true });
      }
      settings = next;
      options.onConfigured(next);
      return createProtocolSuccessFrame(request.id, status());
    } catch (error) {
      return createProtocolErrorFrame(
        request.id,
        createProtocolError(
          "INTERNAL_ERROR",
          `Cannot update server settings in ${options.configPath}: ${String(error)}. Inspect saved and running settings before retrying.`,
        ),
      );
    }
  }
  return {
    isBusy: () => pending > 0,
    handlers: {
      sync: {
        serverStatus: (request) => createProtocolSuccessFrame(request.id, status()),
        serverConfigure: (request) => {
          pending++;
          const next = operation.then(
            () => configure(request),
            () => configure(request),
          );
          operation = next;
          return next.finally(() => {
            pending--;
          });
        },
      },
    },
  };
}
