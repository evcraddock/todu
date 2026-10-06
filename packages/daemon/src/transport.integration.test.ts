import { spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  it.each([
    "daemon.sock",
    "s",
    "é",
  ])("supports a near-limit public socket path with basename %s", async (basename) => {
    const maxBytes = process.platform === "linux" ? 107 : 103;
    const padding = maxBytes - Buffer.byteLength(tmpDir) - Buffer.byteLength(basename) - 2;
    expect(padding).toBeGreaterThan(0);
    const directory = path.join(tmpDir, "x".repeat(padding));
    fs.mkdirSync(directory);
    const socketPath = path.join(directory, basename);
    expect(Buffer.byteLength(socketPath)).toBe(maxBytes);

    // Establish that the configured public path works on the current platform.
    const control = net.createServer((socket) => socket.end());
    await new Promise<void>((resolve, reject) => {
      control.once("error", reject);
      control.listen(socketPath, resolve);
    });
    await connectAndClose(socketPath);
    await new Promise<void>((resolve) => control.close(() => resolve()));

    const transport = createUdsTransport({ storagePath: directory, socketPath });
    try {
      await transport.start();
      await connectAndClose(socketPath);
    } finally {
      await transport.stop();
    }
    expect(fs.readdirSync(directory)).toEqual([]);
  });

  it("retries short private names without replacing neighboring files or public case aliases", async () => {
    const socketPath = path.join(tmpDir, "s");
    for (const name of "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_") {
      if (name.toLowerCase() !== "s") fs.writeFileSync(path.join(tmpDir, name), "preserve me");
    }
    const existing = fs.readdirSync(tmpDir).sort();
    const transport = createUdsTransport({ storagePath: tmpDir, socketPath });
    try {
      await transport.start();
      await connectAndClose(socketPath);
    } finally {
      await transport.stop();
    }
    expect(fs.readdirSync(tmpDir).sort()).toEqual(existing);
    for (const name of existing)
      expect(fs.readFileSync(path.join(tmpDir, name), "utf8")).toBe("preserve me");
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
    try {
      await expect(second.start()).rejects.toThrow("Daemon socket already in use");
      await second.stop();
      expect(fs.existsSync(socketPath)).toBe(true);
      await connectAndClose(socketPath);
    } finally {
      await first.stop();
    }
  });

  it("refuses to reclaim a socket when its liveness probe times out", async () => {
    const socketPath = path.join(tmpDir, "daemon.sock");
    const first = createUdsTransport({ storagePath: tmpDir, socketPath });
    const second = createUdsTransport({ storagePath: tmpDir, socketPath });
    await first.start();
    const probe = vi.spyOn(net, "createConnection").mockImplementation(() => new net.Socket());
    try {
      await expect(second.start()).rejects.toThrow("Timed out probing daemon socket");
      await second.stop();
      expect(fs.existsSync(socketPath)).toBe(true);
    } finally {
      probe.mockRestore();
      await first.stop();
    }
  });

  it("does not remove an existing startup lock or socket on lock timeout", async () => {
    const socketPath = path.join(tmpDir, "daemon.sock");
    const first = createUdsTransport({ storagePath: tmpDir, socketPath });
    const second = createUdsTransport({ storagePath: tmpDir, socketPath });
    await first.start();
    fs.mkdirSync(`${socketPath}.lock`);
    try {
      await expect(second.start()).rejects.toThrow("startup/cleanup already in progress");
      await second.stop();
      expect(fs.existsSync(`${socketPath}.lock`)).toBe(true);
      await connectAndClose(socketPath);
    } finally {
      fs.rmdirSync(`${socketPath}.lock`);
      await first.stop();
    }
  });

  it("preserves a replacement socket when the original owner shuts down", async () => {
    const socketPath = path.join(tmpDir, "daemon.sock");
    const first = createUdsTransport({ storagePath: tmpDir, socketPath });
    const replacement = createUdsTransport({ storagePath: tmpDir, socketPath });
    await first.start();
    fs.renameSync(socketPath, path.join(tmpDir, "original.sock"));
    await replacement.start();
    try {
      await first.stop();
      expect(fs.existsSync(socketPath)).toBe(true);
      await connectAndClose(socketPath);
    } finally {
      await first.stop();
      await replacement.stop();
    }
  });

  it("keeps the winning socket usable after concurrent startup and loser cleanup", async () => {
    const socketPath = path.join(tmpDir, "daemon.sock");
    const transports = Array.from({ length: 4 }, () =>
      createUdsTransport({ storagePath: tmpDir, socketPath }),
    );
    const results = await Promise.allSettled(transports.map((transport) => transport.start()));
    try {
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      await Promise.all(
        transports
          .filter((_, i) => results[i].status === "rejected")
          .map((transport) => transport.stop()),
      );
      expect(fs.existsSync(socketPath)).toBe(true);
      await connectAndClose(socketPath);
    } finally {
      await Promise.all(transports.map((transport) => transport.stop()));
    }
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

async function connectAndClose(socketPath: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const client = net.createConnection(socketPath, () => {
      client.end();
      resolve();
    });
    client.once("error", reject);
  });
}

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
