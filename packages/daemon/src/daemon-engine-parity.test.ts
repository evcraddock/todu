import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createTodu, type Todu } from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createDaemonRuntime, type DaemonRuntime } from "./runtime.js";

describe("daemon vs engine parity", () => {
  let engineDir: string;
  let daemonDir: string;
  let engine: Todu | null = null;
  let runtime: DaemonRuntime | null = null;

  beforeEach(async () => {
    engineDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-engine-parity-"));
    daemonDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-parity-"));

    engine = await createTodu({ storagePath: engineDir });
    runtime = createDaemonRuntime({ storagePath: daemonDir });
    await runtime.start();
  });

  afterEach(async () => {
    if (runtime) {
      await runtime.stop();
      runtime = null;
    }

    if (engine) {
      await engine.close();
      engine = null;
    }

    fs.rmSync(engineDir, { recursive: true, force: true });
    fs.rmSync(daemonDir, { recursive: true, force: true });
  });

  it("matches project CRUD semantics for representative flow", async () => {
    if (!engine || !runtime) {
      throw new Error("Expected test harness to initialize engine and daemon runtime");
    }

    const engineCreate = await engine.project.create({
      name: "Parity Project",
      description: "parity-desc",
      priority: "high",
    });
    expect(engineCreate.ok).toBe(true);
    if (!engineCreate.ok) {
      throw new Error("Expected engine project.create to succeed");
    }

    const rpcCreate = await sendRequest(runtime.config().socketPath, {
      id: "project-create-parity",
      method: "project.create",
      params: {
        input: {
          name: "Parity Project",
          description: "parity-desc",
          priority: "high",
        },
      },
    });

    expect(rpcCreate.result).toEqual(
      expect.objectContaining({
        name: engineCreate.value.name,
        description: engineCreate.value.description,
        priority: engineCreate.value.priority,
        status: engineCreate.value.status,
        syncStrategy: engineCreate.value.syncStrategy,
      }),
    );

    const engineList = await engine.project.list();
    expect(engineList.ok).toBe(true);
    if (!engineList.ok) {
      throw new Error("Expected engine project.list to succeed");
    }

    const rpcList = await sendRequest(runtime.config().socketPath, {
      id: "project-list-parity",
      method: "project.list",
      params: {},
    });

    expect(Array.isArray(rpcList.result)).toBe(true);
    expect((rpcList.result as unknown[]).length).toBe(engineList.value.length);
    expect(rpcList.result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: engineCreate.value.name,
          priority: engineCreate.value.priority,
        }),
      ]),
    );
  });

  it("matches task CRUD/query semantics for representative flow", async () => {
    if (!engine || !runtime) {
      throw new Error("Expected test harness to initialize engine and daemon runtime");
    }

    const engineProject = await engine.project.create({ name: "Engine Tasks" });
    expect(engineProject.ok).toBe(true);
    if (!engineProject.ok) {
      throw new Error("Expected engine project create to succeed");
    }

    const rpcProject = await sendRequest(runtime.config().socketPath, {
      id: "rpc-project-for-task",
      method: "project.create",
      params: {
        input: {
          name: "Daemon Tasks",
        },
      },
    });

    const rpcProjectId = (rpcProject.result as { id: string }).id;

    const engineTaskCreate = await engine.task.create({
      title: "Parity task",
      projectId: engineProject.value.id,
      labels: ["parity"],
      priority: "high",
    });
    expect(engineTaskCreate.ok).toBe(true);
    if (!engineTaskCreate.ok) {
      throw new Error("Expected engine task create to succeed");
    }

    const rpcTaskCreate = await sendRequest(runtime.config().socketPath, {
      id: "task-create-parity",
      method: "task.create",
      params: {
        input: {
          title: "Parity task",
          projectId: rpcProjectId,
          labels: ["parity"],
          priority: "high",
        },
      },
    });

    const rpcTask = rpcTaskCreate.result as { id: string; title: string; status: string };

    expect(rpcTask).toEqual(
      expect.objectContaining({
        title: engineTaskCreate.value.title,
        status: engineTaskCreate.value.status,
        priority: engineTaskCreate.value.priority,
      }),
    );

    const engineUpdate = await engine.task.update(engineTaskCreate.value.id, {
      status: "inprogress",
    });
    expect(engineUpdate.ok).toBe(true);
    if (!engineUpdate.ok) {
      throw new Error("Expected engine task update to succeed");
    }

    const rpcUpdate = await sendRequest(runtime.config().socketPath, {
      id: "task-update-parity",
      method: "task.update",
      params: {
        id: rpcTask.id,
        input: {
          status: "inprogress",
        },
      },
    });

    expect(rpcUpdate.result).toEqual(
      expect.objectContaining({
        status: engineUpdate.value.status,
      }),
    );

    const engineSearch = await engine.task.search("parity");
    expect(engineSearch.ok).toBe(true);
    if (!engineSearch.ok) {
      throw new Error("Expected engine task.search to succeed");
    }

    const rpcSearch = await sendRequest(runtime.config().socketPath, {
      id: "task-search-parity",
      method: "task.search",
      params: {
        query: "parity",
      },
    });

    expect(Array.isArray(rpcSearch.result)).toBe(true);
    expect((rpcSearch.result as unknown[]).length).toBe(engineSearch.value.length);
  });

  it("matches integration CRUD and status semantics for representative flow", async () => {
    if (!engine || !runtime) {
      throw new Error("Expected test harness to initialize engine and daemon runtime");
    }

    const engineProject = await engine.project.create({ name: "Engine Integration Project" });
    expect(engineProject.ok).toBe(true);
    if (!engineProject.ok) {
      throw new Error("Expected engine integration project create to succeed");
    }

    const rpcProject = await sendRequest(runtime.config().socketPath, {
      id: "rpc-project-for-integration",
      method: "project.create",
      params: {
        input: {
          name: "Daemon Integration Project",
        },
      },
    });

    const rpcProjectId = (rpcProject.result as { id: string }).id;

    const engineCreate = await engine.integration.create({
      provider: "github",
      projectId: engineProject.value.id,
      targetKind: "repository",
      targetRef: "owner/repo",
    });
    expect(engineCreate.ok).toBe(true);
    if (!engineCreate.ok) {
      throw new Error("Expected engine integration create to succeed");
    }

    const rpcCreate = await sendRequest(runtime.config().socketPath, {
      id: "integration-create-parity",
      method: "integration.create",
      params: {
        input: {
          provider: "github",
          projectId: rpcProjectId,
          targetKind: "repository",
          targetRef: "owner/repo",
        },
      },
    });

    const rpcBinding = rpcCreate.result as {
      id: string;
      provider: string;
      targetKind: string;
      targetRef: string;
      strategy: string;
      enabled: boolean;
    };

    expect(rpcBinding).toEqual(
      expect.objectContaining({
        provider: engineCreate.value.provider,
        targetKind: engineCreate.value.targetKind,
        targetRef: engineCreate.value.targetRef,
        strategy: engineCreate.value.strategy,
        enabled: engineCreate.value.enabled,
      }),
    );

    const engineList = await engine.integration.list({ provider: "github" });
    expect(engineList.ok).toBe(true);
    if (!engineList.ok) {
      throw new Error("Expected engine integration list to succeed");
    }

    const rpcList = await sendRequest(runtime.config().socketPath, {
      id: "integration-list-parity",
      method: "integration.list",
      params: {
        filter: {
          provider: "github",
        },
      },
    });

    expect(Array.isArray(rpcList.result)).toBe(true);
    expect((rpcList.result as unknown[]).length).toBe(engineList.value.length);

    const engineStatus = await engine.integration.getStatus(engineCreate.value.id);
    expect(engineStatus.ok).toBe(true);
    if (!engineStatus.ok) {
      throw new Error("Expected engine integration status to succeed");
    }

    const rpcStatus = await sendRequest(runtime.config().socketPath, {
      id: "integration-status-parity",
      method: "integration.status",
      params: {
        id: rpcBinding.id,
      },
    });

    expect(rpcStatus.result).toEqual(
      expect.objectContaining({
        state: engineStatus.value.state,
        authorityId: engineStatus.value.authorityId,
        lastAttemptedSyncAt: engineStatus.value.lastAttemptedSyncAt,
        lastSuccessfulSyncAt: engineStatus.value.lastSuccessfulSyncAt,
        lastErrorSummary: engineStatus.value.lastErrorSummary,
      }),
    );

    const engineUpdate = await engine.integration.update(engineCreate.value.id, {
      targetRef: "owner/updated-repo",
      strategy: "pull",
      enabled: false,
    });
    expect(engineUpdate.ok).toBe(true);
    if (!engineUpdate.ok) {
      throw new Error("Expected engine integration update to succeed");
    }

    const rpcUpdate = await sendRequest(runtime.config().socketPath, {
      id: "integration-update-parity",
      method: "integration.update",
      params: {
        id: rpcBinding.id,
        input: {
          targetRef: "owner/updated-repo",
          strategy: "pull",
          enabled: false,
        },
      },
    });

    expect(rpcUpdate.result).toEqual(
      expect.objectContaining({
        targetRef: engineUpdate.value.targetRef,
        strategy: engineUpdate.value.strategy,
        enabled: engineUpdate.value.enabled,
      }),
    );

    const engineDelete = await engine.integration.delete(engineCreate.value.id);
    expect(engineDelete.ok).toBe(true);
    if (!engineDelete.ok) {
      throw new Error("Expected engine integration delete to succeed");
    }

    const rpcDelete = await sendRequest(runtime.config().socketPath, {
      id: "integration-delete-parity",
      method: "integration.delete",
      params: {
        id: rpcBinding.id,
      },
    });

    expect(rpcDelete).toEqual({
      id: "integration-delete-parity",
      result: null,
    });
  });

  it("matches sync status semantics for representative flow", async () => {
    if (!engine || !runtime) {
      throw new Error("Expected test harness to initialize engine and daemon runtime");
    }

    const engineStatus = engine.sync.status();
    const rpcStatus = await sendRequest(runtime.config().socketPath, {
      id: "sync-status-parity",
      method: "sync.status",
      params: {},
    });

    expect(rpcStatus.result).toEqual(engineStatus);

    await engine.sync.start();
    await engine.sync.stop();

    const rpcStart = await sendRequest(runtime.config().socketPath, {
      id: "sync-start-parity",
      method: "sync.start",
      params: {},
    });
    expect(rpcStart).toEqual({
      id: "sync-start-parity",
      result: null,
    });

    const rpcStop = await sendRequest(runtime.config().socketPath, {
      id: "sync-stop-parity",
      method: "sync.stop",
      params: {},
    });
    expect(rpcStop).toEqual({
      id: "sync-stop-parity",
      result: null,
    });
  });
});

function sendRequest(
  socketPath: string,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath);

    let buffer = "";

    client.setEncoding("utf8");

    client.once("error", reject);

    client.once("connect", () => {
      client.write(`${JSON.stringify(request)}\n`);
    });

    client.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      if (lines.length === 0) {
        return;
      }

      const first = lines[0];
      if (!first) {
        return;
      }

      try {
        resolve(JSON.parse(first) as Record<string, unknown>);
        client.end();
      } catch (error) {
        reject(error);
      }
    });
  });
}
