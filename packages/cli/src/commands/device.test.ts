import { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CliDaemonInvoker } from "../daemon-command-client.js";
import { registerDeviceCommands } from "./device.js";

function setup() {
  const invoke = vi.fn(async (method: string) => {
    if (method === "device.localId") return { ok: true, value: "native-local-id" };
    if (method === "device.list")
      return { ok: true, value: [{ id: "native-local-id", name: "Laptop" }] };
    return {
      ok: true,
      value: { id: "native-local-id", name: "Laptop", endpoint: "http://laptop.lan:24377" },
    };
  });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const program = new Command().option("--format <type>", "output format", "text");
  registerDeviceCommands(program, invoke as unknown as CliDaemonInvoker);
  return {
    invoke,
    log,
    error,
    run: (args: string[]) => program.parseAsync(args, { from: "user" }),
  };
}

describe("device CLI commands", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    process.exitCode = undefined;
  });

  it("lists the registry through daemon RPC with JSON output", async () => {
    const { run, invoke, log } = setup();
    await run(["--format", "json", "device", "list"]);
    expect(invoke).toHaveBeenCalledWith("device.list", {});
    expect(JSON.parse(log.mock.calls[0][0] as string)).toEqual([
      { id: "native-local-id", name: "Laptop" },
    ]);
  });

  it("automatically supplies this daemon's native ID when naming", async () => {
    const { run, invoke } = setup();
    await run(["device", "rename", "--name", "Laptop"]);
    expect(invoke).toHaveBeenCalledWith("device.localId", {});
    expect(invoke).toHaveBeenCalledWith("device.rename", { id: "native-local-id", name: "Laptop" });
  });

  it("passes an explicit enrolled ID without trying to add membership", async () => {
    const { run, invoke } = setup();
    await run(["device", "rename", "existing-id", "--name", "Desktop"]);
    expect(invoke).toHaveBeenCalledExactlyOnceWith("device.rename", {
      id: "existing-id",
      name: "Desktop",
    });
  });

  it.each([
    [["--url", "http://laptop.lan:24377"], "http://laptop.lan:24377"],
    [["--clear"], null],
  ] as const)("updates/clears endpoint metadata with an automatically supplied ID: %s", async (args, endpoint) => {
    const { run, invoke } = setup();
    await run(["device", "endpoint", ...args]);
    expect(invoke).toHaveBeenCalledWith("device.setEndpoint", { id: "native-local-id", endpoint });
    expect(invoke.mock.calls.map(([method]) => method)).toEqual([
      "device.localId",
      "device.setEndpoint",
    ]);
  });

  it.each([
    [],
    ["--clear", "--url", "http://host"],
  ])("rejects missing or conflicting endpoint options: %s", async (...args) => {
    const { run, invoke, error } = setup();
    await run(["device", "endpoint", ...args]);
    expect(invoke).not.toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
    expect(process.exitCode).toBe(1);
  });

  it("removes an explicit device without promising remote deletion", async () => {
    const { run, invoke, log } = setup();
    await run(["device", "remove", "existing-id"]);
    expect(invoke).toHaveBeenCalledExactlyOnceWith("device.remove", { id: "existing-id" });
    expect(log.mock.calls[0][0]).toContain("remote copies are not deleted");
  });

  it("fails clearly when the daemon is unavailable", async () => {
    const { run, invoke, error } = setup();
    invoke.mockImplementation(
      async () =>
        ({
          ok: false,
          error: { code: "DAEMON_UNAVAILABLE", message: "Daemon unavailable" },
        }) as never,
    );
    await run(["device", "list"]);
    expect(process.exitCode).toBe(1);
    expect(error).toHaveBeenCalled();
  });
});
