import fs from "node:fs";
import net, { type Server, type Socket } from "node:net";
import path from "node:path";

export const DEFAULT_DAEMON_SOCKET_FILENAME = "daemon.sock";
export const DEFAULT_DAEMON_SOCKET_MODE = 0o600;

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
  stop(): Promise<void>;
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

  let server: Server | null = null;
  let startPromise: Promise<UdsEndpoint> | null = null;
  let stopPromise: Promise<void> | null = null;

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

  async function startServer(): Promise<UdsEndpoint> {
    if (process.platform === "win32") {
      throw new Error("UDS transport is not supported on win32");
    }

    await ensureSocketDirectory();
    await ensureSocketAvailable();

    const created = net.createServer((socket) => {
      config.onConnection?.(socket);
    });

    try {
      await new Promise<void>((resolve, reject) => {
        created.once("error", reject);
        created.listen(endpoint.path, () => {
          created.off("error", reject);
          resolve();
        });
      });

      await fs.promises.chmod(endpoint.path, endpoint.mode);
      server = created;
      return endpoint;
    } catch (error) {
      await closeServer(created);
      await unlinkSocketIfExists(endpoint.path);
      throw error;
    }
  }

  return {
    async start(): Promise<UdsEndpoint> {
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

    async stop(): Promise<void> {
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

        const current = server;
        server = null;

        if (current) {
          await closeServer(current);
        }

        await unlinkSocketIfExists(endpoint.path);
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

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
}

async function unlinkSocketIfExists(socketPath: string): Promise<void> {
  try {
    const stats = await fs.promises.lstat(socketPath);
    if (!stats.isSocket()) {
      return;
    }

    await fs.promises.unlink(socketPath);
  } catch (error) {
    const code = errorCode(error);
    if (code !== "ENOENT") {
      throw error;
    }
  }
}

type SocketProbeState = "active" | "stale";

async function probeSocket(socketPath: string): Promise<SocketProbeState> {
  return new Promise<SocketProbeState>((resolve, reject) => {
    const client = net.createConnection(socketPath);

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
