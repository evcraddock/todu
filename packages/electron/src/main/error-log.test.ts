import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDesktopErrorLog, formatDesktopStartupError } from "./error-log.js";

describe("desktop error log", () => {
  let directory: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-error-log-"));
  });
  afterEach(() => {
    fs.rmSync(directory, { recursive: true });
  });

  it("persists startup failure before window creation and immediate process exit", () => {
    const source = fileURLToPath(new URL("./error-log.ts", import.meta.url));
    const child = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "--input-type=module",
        "-e",
        `
      import { createDesktopErrorLog } from ${JSON.stringify(source)};
      const log = createDesktopErrorLog({ directory: ${JSON.stringify(directory)} });
      log.write("startup", Object.assign(new Error("connect failed"), {code:"DAEMON_UNAVAILABLE"}), {socketPath:"/tmp/test.sock", desktopVersion:"0.23.3"});
      process.exit(0);
    `,
      ],
      { encoding: "utf8", timeout: 10000 },
    );
    expect(child.status, child.stderr).toBe(0);
    const entry = JSON.parse(fs.readFileSync(path.join(directory, "desktop-error.log"), "utf8"));
    expect(entry).toMatchObject({
      level: "error",
      component: "desktop",
      phase: "startup",
      error: { code: "DAEMON_UNAVAILABLE", message: "connect failed" },
      context: { socketPath: "/tmp/test.sock", desktopVersion: "0.23.3" },
    });
    expect(Number.isNaN(Date.parse(entry.ts))).toBe(false);
  });

  it("records underlying causes and reconnect context without serializing arbitrary payloads", () => {
    const log = createDesktopErrorLog({ directory });
    const error = new Error("connection lifecycle failed", {
      cause: {
        code: "PROTOCOL_MISMATCH",
        message: "unsupported protocol",
        details: { reason: "protocol 2", task: "private task title" },
      },
    });
    log.write("reconnect", error, {
      socketPath: "/tmp/todu.sock",
      desktopVersion: "0.23.3",
      daemonVersion: "0.23.4",
      clientProtocol: "1",
      attempt: 2,
      delayMs: 500,
    });
    const entry = JSON.parse(fs.readFileSync(log.path, "utf8"));
    expect(entry.error.cause).toEqual({
      code: "PROTOCOL_MISMATCH",
      message: "unsupported protocol",
      reason: "protocol 2",
    });
    expect(entry.context).toMatchObject({ daemonVersion: "0.23.4", attempt: 2, delayMs: 500 });
    expect(fs.readFileSync(log.path, "utf8")).not.toContain("private task title");
  });

  it("redacts credentials in error messages and ignores secret/config/task context", () => {
    const log = createDesktopErrorLog({ directory });
    const context = {
      socketPath: "/tmp/todu.sock",
      token: "hidden-token",
      task: "private task content",
      config: { password: "hidden-password" },
    };
    log.write(
      "startup",
      new Error(
        'token=abc123 password:topsecret api_key="key123" Authorization: Bearer secretbearer https://user:pass@example.com/?token=querysecret {"password":"jsonsecret","token":"jsontoken"} Basic basiccredential',
      ),
      context,
    );
    const content = fs.readFileSync(log.path, "utf8");
    for (const secret of [
      "abc123",
      "topsecret",
      "key123",
      "secretbearer",
      "user:pass",
      "querysecret",
      "jsonsecret",
      "jsontoken",
      "basiccredential",
      "hidden-token",
      "hidden-password",
      "private task content",
    ])
      expect(content).not.toContain(secret);
    expect(content).toContain("[REDACTED]");
  });

  it("does not throw when error details cannot be read", () => {
    const log = createDesktopErrorLog({ directory });
    const error = {
      get message(): string {
        throw new Error("unreadable error");
      },
    };
    expect(() => log.write("startup", error)).not.toThrow();
    expect(fs.readFileSync(log.path, "utf8")).toContain("Error details could not be read");
    expect(() => formatDesktopStartupError(error, log)).not.toThrow();
  });

  it("uses user-only file permissions", () => {
    const log = createDesktopErrorLog({ directory });
    log.write("startup", new Error("failed"));
    if (process.platform !== "win32") expect(fs.statSync(log.path).mode & 0o777).toBe(0o600);
  });

  it("bounds current file and two archives, including oversized individual records", () => {
    const log = createDesktopErrorLog({ directory, maxBytes: 1024 });
    for (let i = 0; i < 20; i += 1)
      log.write("reconnect", new Error(`failure ${i} ${"x".repeat(200)}`));
    log.write("startup", new Error("x".repeat(10000)), { socketPath: "x".repeat(10000) });
    const files = fs.readdirSync(directory);
    expect(files.sort()).toEqual([
      "desktop-error.log",
      "desktop-error.log.1",
      "desktop-error.log.2",
    ]);
    for (const file of files) {
      expect(fs.statSync(path.join(directory, file)).size).toBeLessThanOrEqual(1024);
      for (const line of fs.readFileSync(path.join(directory, file), "utf8").trim().split("\n"))
        expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it("does not overwrite the original failure when the log directory cannot be written", () => {
    const blocked = path.join(directory, "blocked");
    fs.writeFileSync(blocked, "not a directory");
    const fallback = vi.fn();
    const log = createDesktopErrorLog({ directory: blocked, fallback });
    const original = new Error("original startup failure");
    expect(() => log.write("startup", original)).not.toThrow();
    expect(log.available).toBe(false);
    expect(formatDesktopStartupError(original, log)).toContain("original startup failure");
    expect(formatDesktopStartupError(original, log)).toContain("could not be written");
    expect(fallback).toHaveBeenCalled();
  });

  it("preserves the original error if both file logging and stderr fail", () => {
    const blocked = path.join(directory, "blocked");
    fs.writeFileSync(blocked, "not a directory");
    const log = createDesktopErrorLog({
      directory: blocked,
      fallback: () => {
        throw new Error("stderr unavailable");
      },
    });
    expect(() => log.write("startup", new Error("original error"))).not.toThrow();
  });

  it("includes the log location in startup guidance", () => {
    const log = createDesktopErrorLog({ directory });
    log.write("startup", new Error("failed"));
    expect(formatDesktopStartupError(new Error("failed"), log)).toBe(
      `failed\n\nError log: ${log.path}`,
    );
  });
});
