import type { RemoteSyncSettings } from "./config.js";
import { err, ok, type Result, type ValidationError, validationError } from "./types.js";

/** Validate an explicit local update; preserve existing URLs and disabled destinations. */
export function updateRemoteSyncSettings(
  current: RemoteSyncSettings,
  input: unknown,
): Result<RemoteSyncSettings, ValidationError> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return err(validationError("sync.remote", "Expected server settings"));
  const update = input as Record<string, unknown>;
  if (
    !Object.keys(update).length ||
    Object.keys(update).some((key) => !["server", "enabled"].includes(key))
  )
    return err(validationError("sync.remote", "Supply server and/or enabled settings only"));
  let server = current.server;
  if ("server" in update) {
    if (typeof update.server !== "string" || !update.server.trim())
      return err(validationError("sync.remote.server", "Supply a non-empty ws:// or wss:// URL"));
    server = update.server.trim();
    if (server !== current.server) {
      try {
        const url = new URL(server);
        if (!["ws:", "wss:"].includes(url.protocol) || !url.hostname || url.hash)
          throw new Error("Invalid WebSocket URL");
      } catch {
        return err(
          validationError(
            "sync.remote.server",
            "Supply a valid ws:// or wss:// URL without a fragment",
          ),
        );
      }
    }
  }
  if ("enabled" in update && typeof update.enabled !== "boolean")
    return err(validationError("sync.remote.enabled", "Expected true or false"));
  const enabled =
    typeof update.enabled === "boolean"
      ? update.enabled
      : current.server
        ? current.enabled
        : Boolean(server);
  if (enabled && !server)
    return err(
      validationError(
        "sync.remote.server",
        "Configure a server URL before enabling the server path",
      ),
    );
  if (enabled && server) {
    try {
      const url = new URL(server);
      if (!["ws:", "wss:", "http:", "https:"].includes(url.protocol) || !url.hostname || url.hash)
        throw new Error("Invalid saved server URL");
    } catch {
      return err(
        validationError(
          "sync.remote.server",
          "Set a valid server URL before enabling the server path",
        ),
      );
    }
  }
  return ok({ ...(server ? { server } : {}), enabled });
}
