import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CatalogDocument, Device, DeviceId, Project, Task, TaskWithDetail } from "@todu/core";
import { initBootstrapStorage, type SyncStatus, type Todu } from "@todu/engine";
import { Command } from "commander";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reserveTcpPort, startTestSyncServer } from "../../../scripts/test-helpers/sync-server.js";
import { registerSyncCommands } from "../../cli/src/commands/sync.js";
import { loadConfig } from "../../cli/src/config.js";
import { invokeDaemonMethod } from "../../cli/src/daemon-transport.js";
import * as engineStorage from "../../engine/src/storage.js";
import { createPersistentRepo } from "../../engine/src/storage.js";
import { createDaemonRuntime, type DaemonRuntime } from "./runtime.js";

/** Two established replicas, real loopback transports, and the existing temporary relay helper. */
describe("complete established-replica LAN setup", () => {
  let directory: string;
  let relay: Todu | undefined;
  const runtimes: DaemonRuntime[] = [];
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-lan-setup-"));
  });
  afterEach(async () => {
    await Promise.all(runtimes.splice(0).map((runtime) => runtime.stop()));
    await relay?.close();
    relay = undefined;
    vi.restoreAllMocks();
    process.exitCode = undefined;
    fs.rmSync(directory, { recursive: true });
  });

  async function rpc<T>(
    runtime: DaemonRuntime,
    method: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const result = await invokeDaemonMethod<T>({
      socketPath: runtime.config().socketPath,
      method,
      params,
    });
    if (!result.ok) throw new Error(JSON.stringify(result.error));
    return result.value;
  }
  function configPath(name: string): string {
    return path.join(directory, `${name}.yaml`);
  }
  async function start(name: string): Promise<DaemonRuntime> {
    const file = loadConfig(configPath(name));
    const runtime = createDaemonRuntime({
      storagePath: path.join(directory, name),
      configPath: configPath(name),
      syncListener: file.sync?.listener,
      remoteSyncSettings: {
        server: file.sync?.remote?.server,
        enabled: file.sync?.remote?.enabled ?? false,
      },
      assignedWorkerTypes: [],
      logLevel: "error",
    });
    runtimes.push(runtime);
    await runtime.start();
    return runtime;
  }
  async function configureListener(
    name: string,
    action: "enable" | "disable" = "enable",
  ): Promise<void> {
    const program = new Command().option("--config <path>");
    const invoke = vi.fn();
    registerSyncCommands(program, invoke);
    await program.parseAsync(["--config", configPath(name), "sync", "listener", action], {
      from: "user",
    });
    expect(invoke).not.toHaveBeenCalled();
    expect(process.exitCode).toBeUndefined();
  }

  it("publishes after explicit restart, updates already-running peers, and exchanges new task documents with the relay closed", async () => {
    const firstPath = path.join(directory, "first");
    const secondPath = path.join(directory, "second");
    const initial = await initBootstrapStorage(firstPath);
    const catalogId = initial.catalog.documentId;
    const firstId = await initial.repo.storageId();
    const binary = await initial.repo.export(catalogId);
    if (!binary) throw new Error("Missing native catalog export");
    const secondRepo = createPersistentRepo(secondPath);
    secondRepo.import<CatalogDocument>(binary, { docId: catalogId });
    await secondRepo.flush();
    fs.writeFileSync(path.join(secondPath, "todu-catalog.id"), catalogId);
    const secondStorage = await initBootstrapStorage(secondPath, secondRepo);
    const secondId = await secondRepo.storageId();
    const registered = await secondRepo.export(catalogId);
    if (!registered) throw new Error("Missing established membership export");
    initial.repo.import<CatalogDocument>(registered, { docId: catalogId });
    await Promise.all([initial.close(), secondStorage.close()]);

    const testRelay = await startTestSyncServer(path.join(directory, "relay"));
    relay = testRelay.server;
    const firstPort = await reserveTcpPort();
    let secondPort = await reserveTcpPort();
    if (secondPort === firstPort) secondPort = await reserveTcpPort();
    for (const [name, port] of [
      ["first", firstPort],
      ["second", secondPort],
    ] as const) {
      // Saved loopback overrides keep the real end-to-end fixture off the operator's LAN.
      // Actual automatic interface selection is covered separately through CLI/config regressions.
      fs.writeFileSync(
        configPath(name),
        `# Preserve operator settings\ndata_dir: ./${name}\nsync:\n  listener:\n    enabled: false\n    bind: 127.0.0.1\n    port: ${port}\n  remote:\n    server: ${testRelay.url}\n    enabled: true\ndaemon:\n  workers:\n    assigned: []\n  plugins:\n    config:\n      provider:\n        local_state: keep\n`,
      );
    }
    let first = await start("first");
    let second = await start("second");
    const originalSecond = second;
    const members = await rpc<Device[]>(second, "device.list");
    expect(members).toHaveLength(2);
    expect(members.every((device) => device.endpoint === undefined)).toBe(true);
    vi.spyOn(console, "log").mockImplementation(() => {});
    await configureListener("first");
    expect((await rpc<SyncStatus>(first, "sync.status")).listener.state).toBe("disabled");
    expect(
      (await rpc<Device[]>(first, "device.list")).every((device) => device.endpoint === undefined),
    ).toBe(true);
    await first.stop();
    first = await start("first");
    const firstEndpoint = `http://127.0.0.1:${firstPort}`;
    expect((await rpc<SyncStatus>(first, "sync.status")).listener).toMatchObject({
      state: "listening",
      publication: { state: "published", endpoint: firstEndpoint },
    });
    await expect
      .poll(
        async () =>
          (await rpc<Device[]>(originalSecond, "device.list")).find(
            (device) => device.id === firstId,
          )?.endpoint,
        { timeout: 8000 },
      )
      .toBe(firstEndpoint);

    // The second daemon has not restarted or manually refreshed its empty startup snapshot.
    // Closing the distinct relay now makes actual exchange depend on automatic peer uptake.
    expect(second).toBe(originalSecond);
    for (const [name, runtime] of [
      ["first", first],
      ["second", second],
    ] as const) {
      expect(
        await rpc(runtime, "sync.serverConfigure", {
          settings: { enabled: false },
          configPath: configPath(name),
        }),
      ).toMatchObject({ enabled: false, running: false, server: testRelay.url });
    }
    await relay.close();
    relay = undefined;

    const fromFirst = await rpc<Project>(first, "project.create", {
      input: { name: "Direct from first, relay closed" },
    });
    const fromSecond = await rpc<Project>(second, "project.create", {
      input: { name: "Direct from second, relay closed" },
    });
    await expect
      .poll(
        async () =>
          (await rpc<Project[]>(second, "project.list")).some(
            (project) => project.id === fromFirst.id,
          ),
        { timeout: 8000 },
      )
      .toBe(true);
    await expect
      .poll(
        async () =>
          (await rpc<Project[]>(first, "project.list")).some(
            (project) => project.id === fromSecond.id,
          ),
        { timeout: 8000 },
      )
      .toBe(true);
    const task = await rpc<Task>(first, "task.create", {
      input: { title: "New native task after relay shutdown", projectId: fromFirst.id },
    });
    await expect
      .poll(
        async () =>
          (await rpc<Task[]>(second, "task.list")).some((candidate) => candidate.id === task.id),
        { timeout: 8000 },
      )
      .toBe(true);
    await rpc(second, "task.update", {
      id: task.id,
      input: { title: "Edited directly by second" },
    });
    await expect
      .poll(async () => (await rpc<TaskWithDetail>(first, "task.get", { id: task.id })).title, {
        timeout: 8000,
      })
      .toBe("Edited directly by second");

    await configureListener("second");
    await second.stop();
    second = await start("second");
    const secondEndpoint = `http://127.0.0.1:${secondPort}`;
    await expect
      .poll(
        async () =>
          (await rpc<Device[]>(first, "device.list")).find((device) => device.id === secondId)
            ?.endpoint,
        { timeout: 8000 },
      )
      .toBe(secondEndpoint);

    await first.stop();
    first = await start("first");
    expect(await rpc<DeviceId>(first, "device.localId")).toBe(firstId);
    expect(await rpc<DeviceId>(second, "device.localId")).toBe(secondId);
    expect(first.status().catalogId).toBe(catalogId);
    expect(second.status().catalogId).toBe(catalogId);
    expect((await rpc<SyncStatus>(first, "sync.status")).listener.publication).toEqual({
      state: "published",
      endpoint: firstEndpoint,
    });
    const afterRestart = await rpc<Project>(first, "project.create", {
      input: { name: "Direct after listener restart" },
    });
    await expect
      .poll(
        async () =>
          (await rpc<Project[]>(second, "project.list")).some(
            (project) => project.id === afterRestart.id,
          ),
        { timeout: 8000 },
      )
      .toBe(true);
    await configureListener("first", "disable");
    expect(
      (await rpc<Device[]>(first, "device.list")).find((device) => device.id === firstId)?.endpoint,
    ).toBe(firstEndpoint);
    await first.stop();
    first = await start("first");
    expect((await rpc<SyncStatus>(first, "sync.status")).listener).toMatchObject({
      state: "disabled",
      publication: { state: "unavailable" },
    });
    expect(
      (await rpc<Device[]>(first, "device.list")).find((device) => device.id === firstId)?.endpoint,
    ).toBeUndefined();
    await expect
      .poll(
        async () =>
          (await rpc<Device[]>(second, "device.list")).find((device) => device.id === firstId)
            ?.endpoint,
        { timeout: 8000 },
      )
      .toBeUndefined();
    expect(await rpc<DeviceId>(first, "device.localId")).toBe(firstId);
    for (const name of ["first", "second"]) {
      const file = loadConfig(configPath(name));
      expect(file.sync?.remote).toEqual({ server: testRelay.url, enabled: false });
      expect(file.daemon?.workers?.assigned).toEqual([]);
      expect(file.daemon?.plugins?.config).toEqual({ provider: { local_state: "keep" } });
      expect(fs.readFileSync(configPath(name), "utf8")).toContain("# Preserve operator settings");
    }
  }, 30000);

  it("reports a real ownership-write failure separately from binding while private local work remains usable", async () => {
    const makeRepo = engineStorage.createPersistentRepo;
    vi.spyOn(engineStorage, "createPersistentRepo").mockImplementation((storagePath) => {
      const repo = makeRepo(storagePath);
      const save = repo.storageSubsystem!.save.bind(repo.storageSubsystem!);
      vi.spyOn(repo.storageSubsystem!, "save").mockImplementation((namespace, key, bytes) =>
        namespace === "todu-listener-endpoint"
          ? Promise.reject(new Error("Injected publication receipt failure"))
          : save(namespace, key, bytes),
      );
      return repo;
    });
    const port = await reserveTcpPort();
    fs.writeFileSync(
      configPath("first"),
      `sync:\n  listener:\n    enabled: true\n    bind: 127.0.0.1\n    port: ${port}\n`,
    );
    const first = await start("first");
    expect((await rpc<SyncStatus>(first, "sync.status")).listener).toMatchObject({
      state: "listening",
      publication: {
        state: "error",
        error: expect.stringContaining("Injected publication receipt failure"),
      },
    });
    const id = await rpc<DeviceId>(first, "device.localId");
    expect(
      (await rpc<Device[]>(first, "device.list")).find((device) => device.id === id)?.endpoint,
    ).toBeUndefined();
    const project = await rpc<Project>(first, "project.create", {
      input: { name: "Local work survives failed advertisement" },
    });
    expect(
      (await rpc<Project[]>(first, "project.list")).some(
        (candidate) => candidate.id === project.id,
      ),
    ).toBe(true);
    expect(first.status().state).toBe("running");
  });
});
