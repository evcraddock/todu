import fs from "node:fs";
import path from "node:path";
import {
  resolveSyncListenerEnableConfig,
  type SyncListenerConfig,
  type ToduFileConfig,
} from "@todu/core";
import { isMap, parseDocument } from "yaml";

function readDocument(configPath: string) {
  let content = "";
  try {
    content = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const document = parseDocument(content);
  if (document.errors.length) throw document.errors[0];
  if (document.contents !== null && !isMap(document.contents))
    throw new Error("Configuration must be a YAML mapping");
  return { content, document };
}

export function getListenerSettings(configPath: string): SyncListenerConfig {
  return (readDocument(configPath).document.toJS() as ToduFileConfig | null)?.sync?.listener ?? {};
}

/** Save the same explicit opt-in settings as the CLI; runtime binding requires a daemon restart. */
export async function configureListener(
  configPath: string,
  enabled: unknown,
): Promise<SyncListenerConfig> {
  if (typeof enabled !== "boolean") throw new Error("Listener enabled must be a boolean");
  const { content, document } = readDocument(configPath);
  const saved = (document.toJS() as ToduFileConfig | null)?.sync?.listener ?? {};
  let update: SyncListenerConfig = { enabled };
  if (enabled) {
    const resolved = await resolveSyncListenerEnableConfig({ saved });
    if (!resolved.ok) throw new Error(resolved.error.message);
    update = { enabled: true, ...resolved.value };
  }
  if (readDocument(configPath).content !== content)
    throw new Error("Configuration changed while saving. Try again.");
  for (const [key, value] of Object.entries(update)) {
    if (value !== undefined) document.setIn(["sync", "listener", key], value);
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, document.toString(), "utf8");
  return { ...saved, ...update };
}
