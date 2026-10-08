import { createSocket, type Socket } from "node:dgram";
import { isIP } from "node:net";
import os from "node:os";
import {
  type ResolvedSyncListenerConfig,
  resolveSyncListenerConfig,
  type SyncListenerConfig,
} from "./config.js";
import { err, ok, type Result, type ValidationError, validationError } from "./types.js";

/** Resolve settings only for explicit enablement; daemon startup uses the persisted literal bind. */
export async function resolveSyncListenerEnableConfig(options: {
  bind?: string;
  port?: number;
  saved?: SyncListenerConfig;
}): Promise<Result<ResolvedSyncListenerConfig, ValidationError>> {
  const bind = options.bind !== undefined ? options.bind : options.saved?.bind;
  const port = options.port !== undefined ? options.port : options.saved?.port;
  const validated = resolveSyncListenerConfig({
    enabled: true,
    bind: bind === undefined ? "127.0.0.1" : bind,
    port,
  });
  if (!validated.ok) return validated;
  if (!validated.value) throw new Error("Explicit listener enablement resolved as disabled");
  if (bind !== undefined) return ok(validated.value);
  const detected = await detectLanAddress();
  if (!detected.ok) return detected;
  return ok({ bind: detected.value, port: validated.value.port });
}

async function detectLanAddress(): Promise<Result<string, ValidationError>> {
  let addresses: string[];
  try {
    addresses = [
      ...new Set(
        Object.values(os.networkInterfaces()).flatMap((entries) =>
          (entries ?? [])
            .filter((entry) => !entry.internal && isPrivateAddress(entry.address))
            .map((entry) => normalizeAddress(entry.address)),
        ),
      ),
    ].sort();
  } catch (error) {
    return selectionError(`Cannot enumerate local LAN addresses: ${String(error)}.`);
  }
  for (const family of [4, 6] as const) {
    const candidates = addresses.filter((address) => isIP(address) === family);
    if (candidates.length === 0) continue;
    if (candidates.length === 1) return ok(candidates[0]);
    const source = await routeSource(family);
    if (source.ok) {
      const selected = candidates.find((candidate) => candidate === normalizeAddress(source.value));
      if (selected) return ok(selected);
    }
    const reason = source.ok ? "The OS route source does not select a candidate." : source.error;
    return selectionError(`Ambiguous local LAN addresses: ${candidates.join(", ")}. ${reason}`);
  }
  return selectionError("No non-internal private IPv4 or unique-local IPv6 address is available.");
}

function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) return /^f[cd][0-9a-f]{2}:/i.test(address);
  if (isIP(address) !== 4) return false;
  const [first, second] = address.split(".").map(Number);
  return (
    first === 10 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  );
}

function normalizeAddress(address: string): string {
  return isIP(address) === 6 ? new URL(`http://[${address}]`).hostname.slice(1, -1) : address;
}

function selectionError(message: string): Result<never, ValidationError> {
  return err(
    validationError(
      "sync.listener.bind",
      `${message} Use --bind <literal-address> to explicitly select an address assigned to this machine. Private addressing does not establish network trust.`,
    ),
  );
}

/** Ask the OS for its route source without sending packets or depending on platform shell tools. */
function routeSource(family: 4 | 6): Promise<Result<string, string>> {
  let socket: Socket;
  try {
    socket = createSocket(family === 4 ? "udp4" : "udp6");
  } catch (error) {
    return Promise.resolve(err(`Cannot inspect the OS route source: ${String(error)}.`));
  }
  return new Promise((resolve) => {
    let finished = false;
    const finish = (result: Result<string, string>): void => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try {
        socket.close(() => resolve(result));
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ERR_SOCKET_DGRAM_NOT_RUNNING")
          resolve(result);
        else resolve(err(`Cannot close the route-source socket: ${String(error)}.`));
      }
    };
    const timer = setTimeout(() => finish(err("OS route-source lookup timed out.")), 1000);
    socket.once("error", (error) =>
      finish(err(`Cannot inspect the OS route source: ${error.message}.`)),
    );
    socket.once("connect", () => {
      try {
        finish(ok(socket.address().address));
      } catch (error) {
        finish(err(`Cannot read the OS route source: ${String(error)}.`));
      }
    });
    try {
      socket.connect(9, family === 4 ? "192.0.2.1" : "2001:db8::1");
    } catch (error) {
      finish(err(`Cannot inspect the OS route source: ${String(error)}.`));
    }
  });
}
