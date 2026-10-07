import { prepareEnrollmentStorage } from "@todu/engine";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CliDaemonInvoker } from "../daemon-command-client.js";
import { registerSyncCommands } from "./sync.js";

vi.mock("@todu/engine", () => ({
  prepareEnrollmentStorage: vi.fn(() => ({ ok: true, value: { stage: "prepared" } })),
}));
vi.mock("../config.js", () => ({
  getConfigPath: (override?: string) => override ?? "/test/config.yaml",
  loadConfig: () => ({ data_dir: "/test/data" }),
  saveSyncListenerConfig: vi.fn(),
}));
function setup() {
  const invoke = vi.fn(async () => ({
    ok: true,
    value: { stage: "pending", requestId: "request-id", deviceId: "native-id" },
  }));
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const error = vi.spyOn(console, "error").mockImplementation(() => {});
  const program = new Command()
    .option("--format <type>", "format", "text")
    .option("--config <path>");
  registerSyncCommands(program, invoke as unknown as CliDaemonInvoker);
  return {
    invoke,
    log,
    error,
    run: (args: string[]) => program.parseAsync(args, { from: "user" }),
  };
}

describe("device enrollment CLI", () => {
  beforeEach(() => {
    vi.stubEnv("TODU_DATA_DIR", "");
    vi.stubEnv("TODU_DAEMON_SOCKET", "");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.mocked(prepareEnrollmentStorage).mockReset();
    vi.mocked(prepareEnrollmentStorage).mockReturnValue({ ok: true, value: { stage: "prepared" } });
    process.exitCode = undefined;
  });
  it("supplies only a known base endpoint without manual catalog or storage IDs", async () => {
    const { run, invoke, log } = setup();
    await run(["sync", "enroll", "http://mac-mini.lan:24377"]);
    expect(invoke).toHaveBeenCalledExactlyOnceWith("sync.enroll", {
      endpoint: "http://mac-mini.lan:24377",
    });
    expect(log.mock.calls.flat().join(" ")).toContain("Approve this request locally");
  });
  it("prepares pristine local storage before daemon startup without invoking RPC", async () => {
    const { run, invoke, log } = setup();
    await run(["sync", "enrollment", "prepare"]);
    expect(prepareEnrollmentStorage).toHaveBeenCalledExactlyOnceWith({
      storagePath: "/test/data",
      socketPath: "/test/data/daemon.sock",
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(log.mock.calls.flat().join(" ")).toContain("Start the local daemon");
  });
  it("reports refusal to replace an initialized dataset", async () => {
    vi.mocked(prepareEnrollmentStorage).mockReturnValue({
      ok: false,
      error: {
        type: "validation",
        field: "storagePath",
        message: "Already initialized; do not replace",
      },
    });
    const { run, error } = setup();
    await run(["sync", "enrollment", "prepare"]);
    expect(error.mock.calls.flat().join(" ")).toContain("do not replace");
    expect(process.exitCode).toBe(1);
  });
  it.each([
    "approve",
    "deny",
  ] as const)("sends %s only through private local RPC", async (action) => {
    const { run, invoke } = setup();
    await run(["sync", "enrollment", action, "550e8400-e29b-41d4-a716-446655440000"]);
    expect(invoke).toHaveBeenCalledExactlyOnceWith(
      action === "approve" ? "sync.enrollmentApprove" : "sync.enrollmentDeny",
      { requestId: "550e8400-e29b-41d4-a716-446655440000" },
    );
  });
  it("renders local status as JSON and cancels without a membership removal call", async () => {
    const { run, invoke, log } = setup();
    await run(["--format", "json", "sync", "enrollment", "status"]);
    expect(JSON.parse(log.mock.calls[0][0])).toMatchObject({ stage: "pending" });
    expect(invoke).toHaveBeenLastCalledWith("sync.enrollmentStatus", {});
    await run(["sync", "enrollment", "cancel"]);
    expect(invoke).toHaveBeenLastCalledWith("sync.enrollmentCancel", {});
    expect(invoke.mock.calls.some(([method]) => method === "device.remove")).toBe(false);
  });
  it("requires the local daemon for enrollment controls", async () => {
    const { run, invoke, error } = setup();
    invoke.mockResolvedValue({
      ok: false,
      error: { code: "DAEMON_UNAVAILABLE", message: "No socket" },
    } as never);
    await run(["sync", "enroll", "http://known-peer:24377"]);
    expect(error.mock.calls.flat().join(" ")).toContain("local daemon is required");
    expect(process.exitCode).toBe(1);
  });
});
