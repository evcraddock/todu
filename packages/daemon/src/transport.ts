import { randomBytes } from "node:crypto";
import fs from "node:fs";
import net, { type Server, type Socket } from "node:net";
import path from "node:path";

export const DEFAULT_DAEMON_SOCKET_FILENAME = "daemon.sock";
export const DEFAULT_DAEMON_SOCKET_MODE = 0o600;
const CLIENT_CLOSE_GRACE_MS = 100;

export interface UdsTransportConfig {
  storagePath: string;
  socketPath?: string;
  socketMode?: number;
  onConnection?: (socket: Socket) => void;
}

export interface UdsEndpoint {
  kind: "uds";
  path: string;
  mode: number;
}

export interface UdsTransport {
  start(): Promise<UdsEndpoint>;
  stop(drain?: () => Promise<void>): Promise<void>;
  endpoint(): UdsEndpoint;
}

export function resolveUdsSocketPath(storagePath: string, socketPath?: string): string {
  if (!socketPath) {
    return path.join(storagePath, DEFAULT_DAEMON_SOCKET_FILENAME);
  }

  return path.isAbsolute(socketPath) ? socketPath : path.resolve(socketPath);
}

export function createUdsTransport(config: UdsTransportConfig): UdsTransport {
  const endpoint: UdsEndpoint = {
    kind: "uds",
    path: resolveUdsSocketPath(config.storagePath, config.socketPath),
    mode: config.socketMode ?? DEFAULT_DAEMON_SOCKET_MODE,
  };

  const sockets = new Set<Socket>();
  let server: Server | null = null;
  let startPromise: Promise<UdsEndpoint> | null = null;
  let stopPromise: Promise<void> | null = null;
  let ownedSocket: fs.Stats | null = null;
  const lockPath = `${endpoint.path}.lock`;

  async function acquireSocketLock(): Promise<() => Promise<void>> {
    const deadline = Date.now() + 2_000;
    while (true) {
      try {
        await fs.promises.mkdir(lockPath, { mode: 0o700 });
        return () => fs.promises.rmdir(lockPath);
      } catch (error) {
        if (errorCode(error) !== "EEXIST") throw error;
        if (Date.now() >= deadline) {
          throw new Error(
            `Daemon socket startup/cleanup already in progress: ${lockPath}. If this lock remains after a crash, verify no daemon is starting or stopping before removing the lock directory.`,
          );
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 25));
      }
    }
  }

  async function unlinkOwnedSocket(): Promise<void> {
    if (!ownedSocket) {
      return;
    }
    try {
      const stats = await fs.promises.lstat(endpoint.path);
      if (stats.isSocket() && stats.dev === ownedSocket.dev && stats.ino === ownedSocket.ino) {
        await fs.promises.unlink(endpoint.path);
      }
    } catch (error) {
      if (errorCode(error) !== "ENOENT") {
        throw error;
      }
    }
    ownedSocket = null;
  }

  async function ensureSocketDirectory(): Promise<void> {
    await fs.promises.mkdir(path.dirname(endpoint.path), { recursive: true, mode: 0o700 });
  }

  async function ensureSocketAvailable(): Promise<void> {
    try {
      const stats = await fs.promises.lstat(endpoint.path);
      if (!stats.isSocket()) {
        throw new Error(`Refusing to replace non-socket path: ${endpoint.path}`);
      }

      const state = await probeSocket(endpoint.path);
      if (state === "active") {
        throw new Error(`Daemon socket already in use: ${endpoint.path}`);
      }

      await fs.promises.unlink(endpoint.path);
    } catch (error) {
      const code = errorCode(error);
      if (code !== "ENOENT") {
        throw error;
      }
    }
  }

  async function bindPrivateServer(): Promise<{ server: Server; path: string }> {
    const publicName = path.basename(endpoint.path);
    // Never increase the configured address's byte length, including short and
    // multibyte basenames at the platform's Unix socket limit.
    const budget = Math.min(22, Buffer.byteLength(publicName));
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-";
    const offset = randomBytes(1).readUInt8(0) % alphabet.length;
    const attempts = budget <= 2 ? alphabet.length : 32;

    for (let attempt = 0; attempt < attempts; attempt += 1) {
      const suffix =
        budget <= 2
          ? alphabet.charAt((offset + attempt) % alphabet.length)
          : randomBytes(budget)
              .toString("base64url")
              .slice(0, budget - 1);
      const name = budget === 1 ? suffix : `.${suffix}`;
      // Also exclude case aliases of the public name on case-insensitive filesystems.
      if (name.toLowerCase() === publicName.toLowerCase()) continue;
      const bindPath = path.join(path.dirname(endpoint.path), name);
      try {
        await fs.promises.lstat(bindPath);
        continue;
      } catch (error) {
        if (errorCode(error) !== "ENOENT") throw error;
      }
      const created = net.createServer((socket) => {
        sockets.add(socket);
        socket.once("close", () => sockets.delete(socket));
        config.onConnection?.(socket);
      });
      try {
        await new Promise<void>((resolve, reject) => {
          created.once("error", reject);
          created.listen(bindPath, () => {
            created.off("error", reject);
            resolve();
          });
        });
        return { server: created, path: bindPath };
      } catch (error) {
        await closeServer(created);
        if (errorCode(error) !== "EADDRINUSE") throw error;
      }
    }
    throw new Error(
      `No available private socket name within the address length budget: ${endpoint.path}`,
    );
  }

  async function startServer(): Promise<UdsEndpoint> {
    if (process.platform === "win32") {
      throw new Error("UDS transport is not supported on win32");
    }

    await ensureSocketDirectory();
    const releaseLock = await acquireSocketLock();
    // libuv unlinks its bind path on close. Bind privately so closing this
    // instance cannot unlink a replacement daemon's public socket.
    let created: Server | null = null;

    try {
      await ensureSocketAvailable();
      const bound = await bindPrivateServer();
      created = bound.server;
      await fs.promises.chmod(bound.path, endpoint.mode);
      const identity = await fs.promises.lstat(bound.path);
      // link() publishes without overwriting an endpoint claimed by another instance.
      await fs.promises.link(bound.path, endpoint.path);
      ownedSocket = identity;
      server = created;
      return endpoint;
    } catch (error) {
      if (created) {
        const closing = closeServer(created);
        await closeClients(sockets);
        await closing;
      }
      await unlinkOwnedSocket();
      throw error;
    } finally {
      await releaseLock();
    }
  }

  return {
    async start(): Promise<UdsEndpoint> {
      if (stopPromise) {
        await stopPromise;
      }
      if (server) {
        return endpoint;
      }

      if (startPromise) {
        return startPromise;
      }

      startPromise = startServer().finally(() => {
        startPromise = null;
      });

      return startPromise;
    },

    async stop(drain?: () => Promise<void>): Promise<void> {
      if (stopPromise) {
        return stopPromise;
      }

      stopPromise = (async () => {
        if (startPromise) {
          try {
            await startPromise;
          } catch {
            // start() error already handled cleanup
          }
        }

        const releaseLock = ownedSocket ? await acquireSocketLock() : null;
        const current = server;
        server = null;
        const closing = current ? closeServer(current) : Promise.resolve();
        try {
          await drain?.();
        } finally {
          try {
            await closeClients(sockets);
            await closing;
            await unlinkOwnedSocket();
          } finally {
            await releaseLock?.();
          }
        }
      })().finally(() => {
        stopPromise = null;
      });

      return stopPromise;
    },

    endpoint(): UdsEndpoint {
      return {
        kind: endpoint.kind,
        path: endpoint.path,
        mode: endpoint.mode,
      };
    },
  };
}

async function closeClients(sockets: Set<Socket>): Promise<void> {
  await Promise.all(
    [...sockets].map(
      (socket) =>
        new Promise<void>((resolve) => {
          if (socket.destroyed) {
            resolve();
            return;
          }
          const timer = setTimeout(() => socket.destroy(), CLIENT_CLOSE_GRACE_MS);
          socket.once("close", () => {
            clearTimeout(timer);
            resolve();
          });
          socket.end();
        }),
    ),
  );
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

type SocketProbeState = "active" | "stale";

async function probeSocket(socketPath: string): Promise<SocketProbeState> {
  return new Promise<SocketProbeState>((resolve, reject) => {
    const client = net.createConnection(socketPath);
    const timer = setTimeout(() => {
      cleanup();
      client.destroy();
      reject(new Error(`Timed out probing daemon socket; refusing to replace it: ${socketPath}`));
    }, 1_000);

    const onConnect = () => {
      cleanup();
      client.end();
      resolve("active");
    };

    const onError = (error: unknown) => {
      cleanup();
      const code = errorCode(error);

      if (code === "ECONNREFUSED") {
        resolve("stale");
        return;
      }

      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timer);
      client.off("connect", onConnect);
      client.off("error", onError);
    };

    client.once("connect", onConnect);
    client.once("error", onError);
  });
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) {
    return undefined;
  }

  if (!("code" in error)) {
    return undefined;
  }

  const code = (error as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}
