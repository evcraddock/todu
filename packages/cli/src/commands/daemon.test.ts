import fs from "node:fs";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliDaemonInvoker } from "../daemon-command-client.js";
import { runServiceCommand, type ServiceCommandResult } from "../service-command.js";
import { registerDaemonCommands } from "./daemon.js";

vi.mock("../config.js", () => ({
  getConfigPath: () => "/test/config.yaml",
  loadConfig: () => ({}),
  resolveDataDir: () => "/test/data",
}));
vi.mock("../service-command.js", () => ({ runServiceCommand: vi.fn() }));

function command(format = "text"): Command {
  const program = new Command().option("--format <format>", "Output format", format);
  registerDaemonCommands(
    program,
    vi.fn<CliDaemonInvoker>().mockResolvedValue({
      ok: false,
      error: { code: "DAEMON_UNAVAILABLE", message: "Unavailable" },
    }),
  );
  return program;
}

function tty(enabled: boolean): void {
  Object.defineProperty(process.stdout, "isTTY", { configurable: true, value: enabled });
  Object.defineProperty(process.stderr, "isTTY", { configurable: true, value: enabled });
}

describe("daemon lifecycle activity", () => {
  const stdoutTTY = Object.getOwnPropertyDescriptor(process.stdout, "isTTY");
  const stderrTTY = Object.getOwnPropertyDescriptor(process.stderr, "isTTY");
  let originalExitCode: typeof process.exitCode;

  beforeEach(() => {
    originalExitCode = process.exitCode;
    vi.useFakeTimers();
    vi.stubEnv("TODU_DAEMON_LIFECYCLE_MODE", "systemd-user");
    vi.stubEnv("TERM", "xterm");
    vi.spyOn(fs, "existsSync").mockReturnValue(true);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process.stderr, "write").mockReturnValue(true);
    vi.mocked(runServiceCommand).mockReset().mockResolvedValue({ ok: true, message: "" });
    tty(true);
  });

  afterEach(() => {
    process.exitCode = originalExitCode;
    if (stdoutTTY) Object.defineProperty(process.stdout, "isTTY", stdoutTTY);
    else Reflect.deleteProperty(process.stdout, "isTTY");
    if (stderrTTY) Object.defineProperty(process.stderr, "isTTY", stderrTTY);
    else Reflect.deleteProperty(process.stderr, "isTTY");
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.useRealTimers();
  });

  it.each([
    "stop",
    "restart",
  ])("animates interactive %s while the service manager is pending", async (action) => {
    let finish!: (result: ServiceCommandResult) => void;
    vi.mocked(runServiceCommand).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const running = command().parseAsync(["daemon", action], { from: "user" });
    await vi.advanceTimersByTimeAsync(500);
    const label = action === "stop" ? "Stopping daemon" : "Restarting daemon";
    expect(process.stderr.write).toHaveBeenCalledWith(`\r\u001b[2K${label}...`);
    expect(runServiceCommand).toHaveBeenCalledWith({
      command: "systemctl",
      args: ["--user", action, "todu-daemon"],
    });
    finish({ ok: true, message: "" });
    await running;
    expect(process.stderr.write).toHaveBeenLastCalledWith("\r\u001b[2K");
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each(["json", "redirected", "dumb"])("keeps %s output free of animation", async (mode) => {
    if (mode === "redirected") tty(false);
    if (mode === "dumb") vi.stubEnv("TERM", "dumb");
    await command(mode === "json" ? "json" : "text").parseAsync(["daemon", "stop"], {
      from: "user",
    });
    expect(process.stderr.write).not.toHaveBeenCalled();
    if (mode === "json") expect(JSON.parse(vi.mocked(console.log).mock.calls[0][0]).ok).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("awaits launchd bootstrap and restart commands in order", async () => {
    vi.stubEnv("TODU_DAEMON_LIFECYCLE_MODE", "launchd");
    vi.spyOn(process, "getuid").mockReturnValue(1000);
    vi.mocked(runServiceCommand).mockResolvedValueOnce({ ok: false, message: "not loaded" });
    await command().parseAsync(["daemon", "restart"], { from: "user" });
    expect(vi.mocked(runServiceCommand).mock.calls.map(([options]) => options.args[0])).toEqual([
      "print",
      "bootstrap",
      "kickstart",
    ]);
    expect(runServiceCommand).toHaveBeenLastCalledWith({
      command: "launchctl",
      args: ["kickstart", "-k", "gui/1000/com.todu.daemon"],
    });
    expect(process.stderr.write).toHaveBeenLastCalledWith("\r\u001b[2K");
  });

  it.each([
    "stop",
    "restart",
  ])("reports forced direct %s as a failure rather than confirming safe persistence", async (action) => {
    vi.stubEnv("TODU_DAEMON_LIFECYCLE_MODE", "direct");
    vi.spyOn(fs, "readFileSync").mockReturnValue("4242");
    vi.spyOn(fs, "unlinkSync").mockImplementation(() => {});
    let alive = true;
    const kill = vi.spyOn(process, "kill").mockImplementation((_pid, signal) => {
      if (signal === 0 && !alive) throw new Error("Process exited");
      if (signal === "SIGKILL") alive = false;
      return true;
    });
    const running = command().parseAsync(["daemon", action], { from: "user" });
    await vi.advanceTimersByTimeAsync(11_100);
    await running;
    expect(kill).toHaveBeenCalledWith(4242, "SIGTERM");
    expect(kill).toHaveBeenCalledWith(4242, "SIGKILL");
    expect(console.error).toHaveBeenCalledWith(
      "Error: managed daemon required forced termination; local storage completion is unconfirmed",
    );
    expect(process.exitCode).toBe(1);
    expect(process.stderr.write).toHaveBeenLastCalledWith("\r\u001b[2K");
    expect(vi.getTimerCount()).toBe(0);
  });

  it("clears animation before reporting a service-manager failure", async () => {
    vi.mocked(runServiceCommand).mockResolvedValueOnce({ ok: false, message: "service failure" });
    await command().parseAsync(["daemon", "stop"], { from: "user" });
    expect(process.stderr.write).toHaveBeenLastCalledWith("\r\u001b[2K");
    expect(console.error).toHaveBeenCalledWith("Details: service failure");
    expect(process.exitCode).toBe(1);
    expect(vi.getTimerCount()).toBe(0);
  });
});
