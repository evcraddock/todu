import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createUdsTransport,
  DEFAULT_DAEMON_SOCKET_FILENAME,
  DEFAULT_DAEMON_SOCKET_MODE,
  resolveUdsSocketPath,
} from "./transport.js";

const describeOnUnix = process.platform === "win32" ? describe.skip : describe;

describeOnUnix("createUdsTransport", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-uds-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("binds to a UDS endpoint and accepts local connections", async () => {
    const socketPath = path.join(tmpDir, "daemon.sock");
    const transport = createUdsTransport({ storagePath: tmpDir, socketPath });

    const endpoint = await transport.start();

    expect(endpoint.kind).toBe("uds");
    expect(endpoint.path).toBe(socketPath);
    expect(fs.existsSync(socketPath)).toBe(true);

    await new Promise<void>((resolve, reject) => {
      const client = net.createConnection(socketPath, () => {
        client.end();
        resolve();
      });
      client.once("error", reject);
    });

    await transport.stop();
  });

  it("sets strict socket file permissions", async () => {
    const socketPath = path.join(tmpDir, "daemon.sock");
    const transport = createUdsTransport({ storagePath: tmpDir, socketPath });

    await transport.start();

    const stats = fs.statSync(socketPath);
    expect(stats.mode & 0o777).toBe(DEFAULT_DAEMON_SOCKET_MODE);

    await transport.stop();
  });

  it("cleans up stale socket files on startup", async () => {
    const socketPath = path.join(tmpDir, "daemon.sock");

    const staleSocketResult = spawnSync(
      "python3",
      [
        "-c",
        [
          "import socket, sys",
          "sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)",
          "sock.bind(sys.argv[1])",
          "sock.listen(1)",
          "sock.close()",
        ].join("; "),
        socketPath,
      ],
      { encoding: "utf-8" },
    );

    if (staleSocketResult.status !== 0) {
      throw new Error(`Failed to create stale UDS socket in test: ${staleSocketResult.stderr}`);
    }

    expect(fs.existsSync(socketPath)).toBe(true);

    const transport = createUdsTransport({ storagePath: tmpDir, socketPath });
    await transport.start();

    await new Promise<void>((resolve, reject) => {
      const client = net.createConnection(socketPath, () => {
        client.end();
        resolve();
      });
      client.once("error", reject);
    });

    await transport.stop();
  });

  it("refuses to replace non-socket files at socket path", async () => {
    const socketPath = path.join(tmpDir, "daemon.sock");
    fs.writeFileSync(socketPath, "not-a-socket", "utf-8");

    const transport = createUdsTransport({ storagePath: tmpDir, socketPath });
    await expect(transport.start()).rejects.toThrow("Refusing to replace non-socket path");
  });

  it("fails startup when socket path is already in use", async () => {
    const socketPath = path.join(tmpDir, "daemon.sock");
    const first = createUdsTransport({ storagePath: tmpDir, socketPath });
    await first.start();

    const second = createUdsTransport({ storagePath: tmpDir, socketPath });
    await expect(second.start()).rejects.toThrow("Daemon socket already in use");

    await first.stop();
  });

  it("removes the socket file during shutdown", async () => {
    const socketPath = path.join(tmpDir, "daemon.sock");
    const transport = createUdsTransport({ storagePath: tmpDir, socketPath });

    await transport.start();
    expect(fs.existsSync(socketPath)).toBe(true);

    await transport.stop();
    expect(fs.existsSync(socketPath)).toBe(false);
  });
});

describe("resolveUdsSocketPath", () => {
  it("uses daemon.sock inside storage path by default", () => {
    const storagePath = "/tmp/todu-daemon";
    const resolved = resolveUdsSocketPath(storagePath);

    expect(resolved).toBe(path.join(storagePath, DEFAULT_DAEMON_SOCKET_FILENAME));
  });

  it("resolves relative socket paths to absolute paths", () => {
    const resolved = resolveUdsSocketPath("/tmp/todu-daemon", "./custom.sock");
    expect(path.isAbsolute(resolved)).toBe(true);
  });
});
