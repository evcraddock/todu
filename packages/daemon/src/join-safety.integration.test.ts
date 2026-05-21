import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { type CatalogDocument, createEmptyCatalog } from "@todu/core";
import * as engine from "@todu/engine";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createDaemonRuntime } from "./runtime.js";

const RUN_SYNC_SERVER_TESTS = process.env.TODU_RUN_SYNC_SERVER_TESTS === "1";

describe("join safety integration", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it("covers sync.join check failure classes without switching catalog pointer", async () => {
    const storagePath = mkTmpDir(tempDirs, "todu-join-check-fail-");
    const markerPath = path.join(storagePath, "todu-catalog.id");
    const runtime = createDaemonRuntime({ storagePath });

    await runtime.start();

    const initialCatalogId = runtime.status().catalogId;
    if (!initialCatalogId) {
      throw new Error("Expected runtime catalog id");
    }

    const invalidFormatResponse = await sendRequest(runtime.config().socketPath, {
      id: "join-check-invalid-format",
      method: "sync.join",
      params: {
        catalogId: "invalid id",
        check: true,
      },
    });

    expect(invalidFormatResponse).toEqual({
      id: "join-check-invalid-format",
      error: {
        code: "JOIN_FAILED",
        message: "Join validation failed",
        details: {
          stage: "validate-format",
          reason: "invalid_catalog_id_format",
          targetCatalogId: "invalid id",
        },
      },
    });

    const unreachableCatalogId = "bbbbbbbbbb";
    const unreachableResponse = await sendRequest(runtime.config().socketPath, {
      id: "join-check-unreachable",
      method: "sync.join",
      params: {
        catalogId: unreachableCatalogId,
        check: true,
      },
    });

    expect(unreachableResponse).toMatchObject({
      id: "join-check-unreachable",
      error: {
        code: "JOIN_FAILED",
        message: "Join validation failed",
        details: {
          stage: "validate-reachability",
          targetCatalogId: unreachableCatalogId,
        },
      },
    });

    expect(runtime.status().catalogId).toBe(initialCatalogId);
    expect(fs.readFileSync(markerPath, "utf-8").trim()).toBe(initialCatalogId);

    await runtime.stop();
  });

  it("switches to target catalog and converges runtime data to target dataset", async () => {
    const storagePath = mkTmpDir(tempDirs, "todu-join-success-");
    const targetCatalogId = await createAlternateCatalogDocument(storagePath);
    const runtime = createDaemonRuntime({ storagePath });

    await runtime.start();

    const previousCatalogId = runtime.status().catalogId;
    if (!previousCatalogId) {
      throw new Error("Expected runtime catalog id");
    }

    const seedCreateResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-create-before-join",
      method: "project.create",
      params: {
        input: {
          name: "source-only-project",
        },
      },
    });

    expect(seedCreateResponse).toMatchObject({
      id: "project-create-before-join",
      result: {
        name: "source-only-project",
      },
    });

    const joinResponse = await sendRequest(runtime.config().socketPath, {
      id: "join-success-converges",
      method: "sync.join",
      params: {
        catalogId: targetCatalogId,
      },
    });

    expect(joinResponse).toEqual({
      id: "join-success-converges",
      result: {
        mode: "join",
        previousCatalogId,
        targetCatalogId,
        switched: true,
        rolledBack: false,
      },
    });

    const projectListResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-list-after-join",
      method: "project.list",
      params: {},
    });

    const projects = parseProjectList(projectListResponse, "project-list-after-join");
    const names = projects.map((project) => project.name);

    expect(names).not.toContain("source-only-project");
    expect(runtime.status().catalogId).toBe(targetCatalogId);

    await runtime.stop();
  });

  it("preserves existing dataset when join switch fails after snapshot", async () => {
    const storagePath = mkTmpDir(tempDirs, "todu-join-rollback-");
    const targetCatalogId = await createAlternateCatalogDocument(storagePath);
    const markerPath = path.join(storagePath, "todu-catalog.id");
    const runtime = createDaemonRuntime({ storagePath });
    const originalCreateTodu = engine.createTodu;
    const createToduSpy = vi.spyOn(engine, "createTodu");

    let createInvocation = 0;
    createToduSpy.mockImplementation(async (config) => {
      createInvocation += 1;
      if (createInvocation === 2) {
        throw new Error("simulated join switch failure");
      }
      return originalCreateTodu(config);
    });

    try {
      await runtime.start();

      const previousCatalogId = runtime.status().catalogId;
      if (!previousCatalogId) {
        throw new Error("Expected runtime catalog id");
      }

      await sendRequest(runtime.config().socketPath, {
        id: "project-create-before-failed-join",
        method: "project.create",
        params: {
          input: {
            name: "rollback-preserved-project",
          },
        },
      });

      const joinResponse = await sendRequest(runtime.config().socketPath, {
        id: "join-fails-after-snapshot",
        method: "sync.join",
        params: {
          catalogId: targetCatalogId,
        },
      });

      expect(joinResponse).toMatchObject({
        id: "join-fails-after-snapshot",
        error: {
          code: "JOIN_FAILED",
          details: {
            stage: "switch",
            previousCatalogId,
            targetCatalogId,
            restoredCatalogId: previousCatalogId,
          },
        },
      });

      const projectListResponse = await sendRequest(runtime.config().socketPath, {
        id: "project-list-after-failed-join",
        method: "project.list",
        params: {},
      });

      const projects = parseProjectList(projectListResponse, "project-list-after-failed-join");
      expect(projects.map((project) => project.name)).toContain("rollback-preserved-project");
      expect(runtime.status().catalogId).toBe(previousCatalogId);
      expect(fs.readFileSync(markerPath, "utf-8").trim()).toBe(previousCatalogId);
    } finally {
      await runtime.stop();
      createToduSpy.mockRestore();
    }
  });

  (RUN_SYNC_SERVER_TESTS ? it : it.skip)(
    "supports authority migration from source daemon to destination daemon",
    async () => {
      const relayDir = mkTmpDir(tempDirs, "todu-join-relay-");
      const sourceDir = mkTmpDir(tempDirs, "todu-join-source-");
      const destinationDir = mkTmpDir(tempDirs, "todu-join-destination-");
      const relayPort = await reserveTcpPort();

      const relay = await engine.createTodu({
        storagePath: relayDir,
        syncServer: true,
        syncPort: relayPort,
      });

      const sourceRuntime = createDaemonRuntime({
        storagePath: sourceDir,
        role: "authority",
        remoteSync: { server: `ws://localhost:${relayPort}` },
      });

      const destinationRuntime = createDaemonRuntime({
        storagePath: destinationDir,
        role: "node",
        remoteSync: { server: `ws://localhost:${relayPort}` },
      });

      try {
        await sourceRuntime.start();
        await waitForRemoteState(sourceRuntime.config().socketPath, "connected");

        const sourceCatalogId = await readCatalogId(sourceRuntime.config().socketPath);

        await sendRequest(sourceRuntime.config().socketPath, {
          id: "source-project-create",
          method: "project.create",
          params: {
            input: {
              name: "migration-seed-project",
            },
          },
        });

        await destinationRuntime.start();
        await waitForRemoteState(destinationRuntime.config().socketPath, "connected");
        await waitForJoinCheckReady(destinationRuntime.config().socketPath, sourceCatalogId);

        const joinResponse = await sendRequest(destinationRuntime.config().socketPath, {
          id: "destination-join-source",
          method: "sync.join",
          params: {
            catalogId: sourceCatalogId,
          },
        });

        expect(joinResponse).toMatchObject({
          id: "destination-join-source",
          result: {
            mode: "join",
            targetCatalogId: sourceCatalogId,
            switched: true,
            rolledBack: false,
          },
        });

        await waitForProjectByName(
          destinationRuntime.config().socketPath,
          "migration-seed-project",
        );

        await sourceRuntime.stop();

        await sendRequest(destinationRuntime.config().socketPath, {
          id: "destination-project-create-after-cutover",
          method: "project.create",
          params: {
            input: {
              name: "post-migration-project",
            },
          },
        });

        await sourceRuntime.start();
        await waitForRemoteState(sourceRuntime.config().socketPath, "connected");
        await waitForProjectByName(sourceRuntime.config().socketPath, "post-migration-project");
      } finally {
        await sourceRuntime.stop();
        await destinationRuntime.stop();
        await relay.close();
        await sleep(150);
      }
    },
    30000,
  );
});

function mkTmpDir(bucket: string[], prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  bucket.push(dir);
  return dir;
}

function parseProjectList(
  response: Record<string, unknown>,
  expectedId: string,
): Array<{ id: string; name: string }> {
  expect(response.id).toBe(expectedId);

  const result = response.result;
  if (!Array.isArray(result)) {
    throw new Error(`Expected project list array for ${expectedId}`);
  }

  return result.map((entry) => {
    const project = entry as { id?: unknown; name?: unknown };
    if (typeof project.id !== "string" || typeof project.name !== "string") {
      throw new Error(`Malformed project list entry for ${expectedId}`);
    }
    return {
      id: project.id,
      name: project.name,
    };
  });
}

async function readCatalogId(socketPath: string): Promise<string> {
  const response = await sendRequest(socketPath, {
    id: "sync-catalog-id",
    method: "sync.catalogId",
    params: {},
  });

  expect(response.id).toBe("sync-catalog-id");
  if (typeof response.result !== "string") {
    throw new Error("Expected sync.catalogId string result");
  }

  return response.result;
}

async function waitForRemoteState(
  socketPath: string,
  expectedState: "connected" | "disconnected",
  timeoutMs = 10000,
): Promise<void> {
  await waitForCondition(
    async () => {
      const response = await sendRequest(socketPath, {
        id: "sync-status",
        method: "sync.status",
        params: {},
      });

      const result = response.result as
        | {
            remote?: {
              state?: string;
            };
          }
        | undefined;

      return result?.remote?.state === expectedState;
    },
    timeoutMs,
    `Timed out waiting for remote state ${expectedState}`,
  );
}

async function waitForProjectByName(
  socketPath: string,
  projectName: string,
  timeoutMs = 10000,
): Promise<void> {
  await waitForCondition(
    async () => {
      const response = await sendRequest(socketPath, {
        id: "project-list",
        method: "project.list",
        params: {},
      });

      const result = response.result;
      if (!Array.isArray(result)) {
        return false;
      }

      return result.some((entry) => {
        const project = entry as { name?: unknown };
        return project.name === projectName;
      });
    },
    timeoutMs,
    `Timed out waiting for project ${projectName}`,
  );
}

async function waitForJoinCheckReady(
  socketPath: string,
  targetCatalogId: string,
  timeoutMs = 10000,
): Promise<void> {
  await waitForCondition(
    async () => {
      const response = await sendRequest(socketPath, {
        id: "join-check-ready",
        method: "sync.join",
        params: {
          catalogId: targetCatalogId,
          check: true,
        },
      });

      const result = response.result as
        | {
            mode?: string;
            targetCatalogId?: string;
          }
        | undefined;

      return result?.mode === "check" && result.targetCatalogId === targetCatalogId;
    },
    timeoutMs,
    `Timed out waiting for join check readiness for ${targetCatalogId}`,
  );
}

async function waitForCondition(
  predicate: () => Promise<boolean>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      if (await predicate()) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(100);
  }

  if (lastError) {
    throw new Error(`${timeoutMessage}: ${String(lastError)}`);
  }

  throw new Error(timeoutMessage);
}

async function reserveTcpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();

    server.once("error", (error) => {
      reject(error);
    });

    server.listen(0, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => {
          reject(new Error("Failed to reserve TCP port"));
        });
        return;
      }

      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function createAlternateCatalogDocument(storagePath: string): Promise<string> {
  const storage = await engine.initBootstrapStorage(storagePath);

  try {
    const alternateCatalog = storage.repo.create<CatalogDocument>();
    alternateCatalog.change((doc: CatalogDocument) => {
      const empty = createEmptyCatalog();
      doc.version = empty.version;
      doc.projects = empty.projects;
      doc.labels = empty.labels;
      doc.recurringTemplates = empty.recurringTemplates;
      doc.habits = empty.habits;
      doc.habitLogDocIds = empty.habitLogDocIds;
      doc.taskListDocIds = empty.taskListDocIds;
      doc.settings = empty.settings;
    });

    await storage.repo.flush();

    return alternateCatalog.documentId;
  } finally {
    await storage.close();
  }
}

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

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
