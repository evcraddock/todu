import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CliDaemonInvoker } from "../daemon-command-client.js";
import { registerSyncCommands } from "./sync.js";

vi.mock("../config.js", () => ({
  getConfigPath: (override?: string) => override ?? "/test/config.yaml",
  saveSyncListenerConfig: vi.fn(),
}));
function setup() {
  const status = {
    enabled: false,
    running: false,
    server: "ws://localhost:3030",
    state: "disconnected",
    configPath: "/test/config.yaml",
  };
  const invoke = vi.fn(async () => ({ ok: true, value: status }));
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const program = new Command()
    .option("--format <type>", "format", "text")
    .option("--config <path>");
  registerSyncCommands(program, invoke as unknown as CliDaemonInvoker);
  return { invoke, log, run: (args: string[]) => program.parseAsync(args, { from: "user" }) };
}
describe("optional server CLI", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });
  it("reads the connected daemon's intent and state without modifying settings", async () => {
    const { run, invoke, log } = setup();
    await run(["--format", "json", "sync", "server", "status"]);
    expect(invoke).toHaveBeenCalledExactlyOnceWith("sync.serverStatus", {});
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({
      enabled: false,
      server: "ws://localhost:3030",
    });
  });
  it.each([
    ["enable", { enabled: true }],
    ["disable", { enabled: false }],
    ["set", { server: "ws://other:3030" }],
  ])("sends explicit %s settings and config context through private RPC", async (command, settings) => {
    const { run, invoke } = setup();
    await run([
      "--config",
      "/other/config.yaml",
      "sync",
      "server",
      command as string,
      ...(command === "set" ? ["--url", "ws://other:3030"] : []),
    ]);
    expect(invoke).toHaveBeenCalledExactlyOnceWith("sync.serverConfigure", {
      settings,
      configPath: "/other/config.yaml",
    });
  });
});
