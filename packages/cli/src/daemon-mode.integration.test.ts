import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";

const ROOT_DIR = path.resolve(import.meta.dirname, "../../..");
const CLI_PATH = path.resolve(ROOT_DIR, "packages/cli/dist/index.js");

interface MockDaemonHandle {
  close: () => Promise<void>;
}

type MockDaemonRequest = {
  method?: string;
  id?: string;
  sendResult: (result: unknown) => void;
  sendError: (code: string, message: string, details?: Record<string, unknown>) => void;
};

describe("daemon-mode CLI integration error behavior", { timeout: 45000 }, () => {
  const tmpDirs: string[] = [];

  beforeAll(() => {
    execSync("npm run build", { cwd: ROOT_DIR, stdio: "pipe", timeout: 30000 });
  });

  afterEach(() => {
    while (tmpDirs.length > 0) {
      const dir = tmpDirs.pop();
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("fails fast with clear daemon-unavailable error and nonzero exit", async () => {
    const tmpDir = mkTmpDir(tmpDirs);

    const result = await runCli(["sync", "status"], {
      TODU_DATA_DIR: tmpDir,
      TODUAI_NO_SYNC: "1",
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("local daemon is required but unavailable");
  });

  it("reports timeout errors with nonzero exit", async () => {
    const tmpDir = mkTmpDir(tmpDirs);
    const socketPath = path.join(tmpDir, "mock-timeout.sock");

    const daemon = await startMockDaemon(socketPath, (req) => {
      if (req.method === "daemon.hello") {
        req.sendResult({
          protocolVersion: "1",
          daemonVersion: "test",
          role: "node",
          capabilities: {},
        });
      }
      // Intentionally do not reply to sync.status to force client request timeout.
    });

    try {
      const result = await runCli(["sync", "status"], {
        TODU_DATA_DIR: tmpDir,
        TODU_DAEMON_SOCKET: socketPath,
        TODUAI_NO_SYNC: "1",
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Daemon request timed out after 10000ms");
    } finally {
      await daemon.close();
    }
  });

  it("reports protocol mismatch errors with nonzero exit", async () => {
    const tmpDir = mkTmpDir(tmpDirs);
    const socketPath = path.join(tmpDir, "mock-protocol.sock");

    const daemon = await startMockDaemon(socketPath, (req) => {
      if (req.method === "daemon.hello") {
        req.sendResult({
          protocolVersion: "1",
          daemonVersion: "test",
          role: "node",
          capabilities: {},
        });
        return;
      }

      if (req.method === "sync.status") {
        req.sendError("PROTOCOL_MISMATCH", "Unsupported protocol version: 1");
      }
    });

    try {
      const result = await runCli(["sync", "status"], {
        TODU_DATA_DIR: tmpDir,
        TODU_DAEMON_SOCKET: socketPath,
        TODUAI_NO_SYNC: "1",
      });

      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Unsupported protocol version: 1");
    } finally {
      await daemon.close();
    }
  });
});

function mkTmpDir(bucket: string[]): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-integration-"));
  bucket.push(dir);
  return dir;
}

async function runCli(
  args: string[],
  env: Record<string, string>,
): Promise<{ status: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [CLI_PATH, ...args], {
      cwd: ROOT_DIR,
      env: { ...process.env, ...env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });

    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`CLI command timed out after 25000ms: ${args.join(" ")}`));
    }, 25000);

    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.once("close", (code) => {
      clearTimeout(timeout);
      resolve({
        status: code ?? -1,
        stdout,
        stderr,
      });
    });
  });
}

async function startMockDaemon(
  socketPath: string,
  onRequest: (request: MockDaemonRequest) => void,
): Promise<MockDaemonHandle> {
  try {
    fs.unlinkSync(socketPath);
  } catch {
    // No existing socket file.
  }

  const server = net.createServer((socket) => {
    socket.setEncoding("utf8");
    let buffer = "";

    socket.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        let frame: { id?: string; method?: string };
        try {
          frame = JSON.parse(trimmed) as { id?: string; method?: string };
        } catch {
          continue;
        }

        const req: MockDaemonRequest = {
          method: frame.method,
          id: frame.id,
          sendResult: (result) => {
            if (!frame.id) {
              return;
            }
            socket.write(`${JSON.stringify({ id: frame.id, result })}\n`);
          },
          sendError: (code, message, details) => {
            socket.write(
              `${JSON.stringify({
                id: frame.id ?? null,
                error: {
                  code,
                  message,
                  details,
                },
              })}\n`,
            );
          },
        };

        onRequest(req);
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => {
      server.off("listening", onListening);
      reject(error);
    };

    const onListening = () => {
      server.off("error", onError);
      resolve();
    };

    server.once("error", onError);
    server.once("listening", onListening);
    server.listen(socketPath);
  });

  return {
    close: async () => {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      try {
        fs.unlinkSync(socketPath);
      } catch {
        // Socket file may already be removed.
      }
    },
  };
}
