import os from "node:os";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig, saveSyncListenerConfig } from "../config.js";
import type { CliDaemonInvoker } from "../daemon-command-client.js";
import { registerSyncCommands } from "./sync.js";

vi.mock("../config.js", () => ({
  getConfigPath: (override?: string) => override ?? "/test/config.yaml",
  loadConfig: vi.fn(),
  saveSyncListenerConfig: vi.fn(),
}));

function setup() {
  const invoke = vi.fn(async () => ({
    ok: true,
    value: {
      listener: { state: "listening", bind: "127.0.0.1", port: 24400, syncPath: "/sync/current" },
      local: { mode: "standalone" },
      remote: { state: "disconnected" },
    },
  }));
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const program = new Command()
    .option("--format <type>", "output format", "text")
    .option("--config <path>");
  registerSyncCommands(program, invoke as unknown as CliDaemonInvoker);
  return {
    program,
    invoke,
    log,
    error,
    run: (args: string[]) => program.parseAsync(args, { from: "user" }),
  };
}

describe("LAN listener CLI", () => {
  beforeEach(() => {
    vi.mocked(loadConfig).mockReturnValue({});
    vi.spyOn(os, "networkInterfaces").mockReturnValue({
      ethernet: [
        {
          address: "192.168.4.12",
          family: "IPv4",
          internal: false,
          netmask: "255.255.255.0",
          mac: "00:00:00:00:00:00",
          cidr: "192.168.4.12/24",
        },
      ],
    });
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(loadConfig).mockReset();
    vi.mocked(saveSyncListenerConfig).mockReset();
    process.exitCode = undefined;
  });

  it("enables without --bind, reports its selected address and port, and never changes the running daemon", async () => {
    const { run, invoke, log } = setup();
    await run(["sync", "listener", "enable"]);
    expect(saveSyncListenerConfig).toHaveBeenCalledExactlyOnceWith(
      { enabled: true, bind: "192.168.4.12", port: 24377 },
      "/test/config.yaml",
    );
    expect(invoke).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join(" ")).toContain("192.168.4.12:24377");
    expect(log.mock.calls.flat().join(" ")).toContain("unencrypted and unauthenticated");
    expect(log.mock.calls.flat().join(" ")).toContain(
      "A private IP does not establish network trust",
    );
  });

  it("reuses disabled saved settings and lets explicit options override them", async () => {
    vi.mocked(loadConfig).mockReturnValue({
      sync: { listener: { enabled: false, bind: "10.1.0.5", port: 24400 } },
    });
    const { run, invoke } = setup();
    await run(["--config", "/saved/config.yaml", "sync", "listener", "enable"]);
    expect(loadConfig).toHaveBeenCalledWith("/saved/config.yaml");
    expect(saveSyncListenerConfig).toHaveBeenLastCalledWith(
      { enabled: true, bind: "10.1.0.5", port: 24400 },
      "/saved/config.yaml",
    );
    await run([
      "--config",
      "/saved/config.yaml",
      "sync",
      "listener",
      "enable",
      "--bind",
      "192.168.1.10",
      "--port",
      "24500",
    ]);
    expect(saveSyncListenerConfig).toHaveBeenLastCalledWith(
      { enabled: true, bind: "192.168.1.10", port: 24500 },
      "/saved/config.yaml",
    );
    expect(os.networkInterfaces).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("detects a missing address while preserving the saved port", async () => {
    vi.mocked(loadConfig).mockReturnValue({ sync: { listener: { port: 24400 } } });
    const { run } = setup();
    await run(["sync", "listener", "enable"]);
    expect(saveSyncListenerConfig).toHaveBeenCalledWith(
      { enabled: true, bind: "192.168.4.12", port: 24400 },
      "/test/config.yaml",
    );
  });

  it("reports unavailable networking without saving and accepts an explicit override", async () => {
    vi.mocked(os.networkInterfaces).mockReturnValue({});
    const { run, invoke, error } = setup();
    await run(["sync", "listener", "enable"]);
    expect(saveSyncListenerConfig).not.toHaveBeenCalled();
    expect(error.mock.calls[0][0]).toContain("--bind");
    expect(process.exitCode).toBe(1);
    await run(["sync", "listener", "enable", "--bind", "192.168.4.12"]);
    expect(saveSyncListenerConfig).toHaveBeenCalledOnce();
    expect(invoke).not.toHaveBeenCalled();
  });

  it("refuses invalid saved settings rather than redetecting", async () => {
    vi.mocked(loadConfig).mockReturnValue({ sync: { listener: { bind: "localhost" } } });
    const { run } = setup();
    await run(["sync", "listener", "enable"]);
    expect(saveSyncListenerConfig).not.toHaveBeenCalled();
    expect(os.networkInterfaces).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("reports config read errors without saving or probing interfaces", async () => {
    vi.mocked(loadConfig).mockImplementation(() => {
      throw new Error("Malformed YAML");
    });
    const { run, error } = setup();
    await run(["sync", "listener", "enable"]);
    expect(error.mock.calls[0][0]).toContain("cannot read listener settings");
    expect(saveSyncListenerConfig).not.toHaveBeenCalled();
    expect(os.networkInterfaces).not.toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("describes automatic selection and optional overrides in CLI help", () => {
    const { program } = setup();
    const listener = program.commands
      .find((command) => command.name() === "sync")
      ?.commands.find((command) => command.name() === "listener");
    const help = listener?.commands
      .find((command) => command.name() === "enable")
      ?.helpInformation();
    expect(help).toContain("automatic address selection");
    expect(help).toContain("optional literal IPv4/IPv6 override");
    expect(help).toContain("saved port or default: 24377");
  });

  it("renders IPv6 bind addresses with unambiguous port formatting", async () => {
    const { run, log } = setup();
    await run(["sync", "listener", "enable", "--bind", "fd12::abcd"]);
    expect(log.mock.calls.flat().join(" ")).toContain("[fd12::abcd]:24377");
  });

  it("saves explicit opt-in and the default port without changing the running daemon", async () => {
    const { run, invoke, log } = setup();
    await run(["sync", "listener", "enable", "--bind", "192.168.1.10"]);
    expect(saveSyncListenerConfig).toHaveBeenCalledExactlyOnceWith(
      { enabled: true, bind: "192.168.1.10", port: 24377 },
      "/test/config.yaml",
    );
    expect(invoke).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join(" ")).toContain("restart the local daemon explicitly");
  });

  it("accepts an explicit port and config path and reports restart requirements as JSON", async () => {
    const { run, log } = setup();
    await run([
      "--config",
      "/other/config.yaml",
      "--format",
      "json",
      "sync",
      "listener",
      "enable",
      "--bind",
      "127.0.0.1",
      "--port",
      "24400",
    ]);
    expect(saveSyncListenerConfig).toHaveBeenCalledExactlyOnceWith(
      { enabled: true, bind: "127.0.0.1", port: 24400 },
      "/other/config.yaml",
    );
    expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({
      restartRequired: true,
      configPath: "/other/config.yaml",
      listener: { enabled: true, bind: "127.0.0.1", port: 24400 },
      warning: expect.stringContaining("unencrypted and unauthenticated"),
    });
  });

  it.each([
    ["--bind", "localhost"],
    ["--bind", "127.0.0.1", "--port", "0"],
    ["--bind", "127.0.0.1", "--port", "24377x"],
  ])("rejects invalid bindings and ports without saving or invoking the daemon: %s", async (...options) => {
    const { run, invoke, error } = setup();
    await run(["sync", "listener", "enable", ...options]);
    expect(saveSyncListenerConfig).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("disables only the saved enablement flag, retaining the previous binding", async () => {
    const { run, invoke } = setup();
    await run(["sync", "listener", "disable"]);
    expect(saveSyncListenerConfig).toHaveBeenCalledExactlyOnceWith(
      { enabled: false },
      "/test/config.yaml",
    );
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reads running listener status through private RPC", async () => {
    const { run, invoke, log } = setup();
    await run(["--format", "json", "sync", "listener", "status"]);
    expect(invoke).toHaveBeenCalledExactlyOnceWith("sync.status", {});
    expect(JSON.parse(log.mock.calls[0][0] as string)).toMatchObject({
      state: "listening",
      port: 24400,
    });
  });

  it("includes incoming listener state in normal sync status", async () => {
    const { run, log } = setup();
    await run(["sync", "status"]);
    expect(log.mock.calls.flat().join(" ")).toContain("LAN Listener: listening");
  });

  it("reports save errors without changing runtime behavior", async () => {
    const { run, invoke, error } = setup();
    vi.mocked(saveSyncListenerConfig).mockImplementation(() => {
      throw new Error("Malformed YAML");
    });
    await run(["sync", "listener", "disable"]);
    expect(error.mock.calls[0][0]).toContain("Malformed YAML");
    expect(process.exitCode).toBe(1);
    expect(invoke).not.toHaveBeenCalled();
  });
});
