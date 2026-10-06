import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveSyncListenerConfig } from "../config.js";
import type { CliDaemonInvoker } from "../daemon-command-client.js";
import { registerSyncCommands } from "./sync.js";

vi.mock("../config.js", () => ({
  getConfigPath: (override?: string) => override ?? "/test/config.yaml",
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
    invoke,
    log,
    error,
    run: (args: string[]) => program.parseAsync(args, { from: "user" }),
  };
}

describe("LAN listener CLI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.mocked(saveSyncListenerConfig).mockReset();
    process.exitCode = undefined;
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
    });
  });

  it.each([
    [],
    ["--bind", "localhost"],
    ["--bind", "127.0.0.1", "--port", "0"],
    ["--bind", "127.0.0.1", "--port", "24377x"],
  ])("rejects missing bindings and invalid ports without saving or invoking the daemon: %s", async (...options) => {
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
