import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createProtocolSuccessFrame } from "./protocol.js";
import {
  DAEMON_CAPABILITY_EVENTS,
  DAEMON_CAPABILITY_METHODS,
  DAEMON_PROTOCOL_VERSION,
} from "./rpc.js";
import { createDaemonRuntime } from "./runtime.js";

describe("createDaemonRuntime", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-runtime-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("defaults daemon role to node in runtime config", () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    expect(runtime.config().role).toBe("node");
    expect(runtime.config().daemonVersion.length).toBeGreaterThan(0);
    expect(runtime.config().requestTimeoutMs).toBeGreaterThan(0);
    expect(runtime.status().role).toBe("node");
    expect(runtime.status().state).toBe("stopped");
  });

  it("starts and reports running status with catalog id and UDS endpoint", async () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir, role: "authority" });

    const status = await runtime.start();

    expect(status.state).toBe("running");
    expect(status.role).toBe("authority");
    expect(status.startedAt).toBeDefined();
    expect(status.catalogId).toBeTruthy();
    expect(status.transport?.kind).toBe("uds");
    expect(status.transport?.path).toBe(runtime.config().socketPath);
    expect(fs.existsSync(runtime.config().socketPath)).toBe(true);

    await runtime.stop();
  });

  it("routes daemon.hello over UDS with handshake response", async () => {
    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      role: "authority",
      daemonVersion: "1.2.3",
    });

    await runtime.start();

    const response = await sendRequest(runtime.config().socketPath, {
      id: "req-1",
      method: "daemon.hello",
      params: {
        protocolVersion: DAEMON_PROTOCOL_VERSION,
      },
    });

    expect(response.id).toBe("req-1");
    expect(response.result).toEqual({
      protocolVersion: DAEMON_PROTOCOL_VERSION,
      daemonVersion: "1.2.3",
      role: "authority",
      capabilities: {
        methods: DAEMON_CAPABILITY_METHODS,
        events: [...DAEMON_CAPABILITY_EVENTS],
      },
      catalog: {
        id: runtime.status().catalogId,
      },
    });

    await runtime.stop();
  });

  it("routes daemon.ping and daemon.status over UDS", async () => {
    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      role: "authority",
      daemonVersion: "2.0.0",
    });

    await runtime.start();

    const pingResponse = await sendRequest(runtime.config().socketPath, {
      id: "ping-1",
      method: "daemon.ping",
      params: {},
    });

    expect(pingResponse.id).toBe("ping-1");
    expect(pingResponse.result).toMatchObject({
      ok: true,
    });

    if (!pingResponse.result || typeof pingResponse.result !== "object") {
      throw new Error("Expected ping result object");
    }

    const pingResult = pingResponse.result as { ts?: unknown };
    expect(typeof pingResult.ts).toBe("string");
    expect(Number.isNaN(Date.parse(pingResult.ts as string))).toBe(false);

    const statusResponse = await sendRequest(runtime.config().socketPath, {
      id: "status-1",
      method: "daemon.status",
      params: {},
    });

    const runtimeStatus = runtime.status();

    expect(statusResponse.id).toBe("status-1");
    expect(statusResponse.result).toEqual({
      protocolVersion: DAEMON_PROTOCOL_VERSION,
      daemonVersion: "2.0.0",
      role: "authority",
      state: "running",
      healthy: true,
      startedAt: runtimeStatus.startedAt,
      transport: {
        kind: "uds",
        path: runtime.config().socketPath,
        mode: runtime.config().socketMode,
      },
      catalog: {
        id: runtimeStatus.catalogId,
      },
    });

    await runtime.stop();
  });

  it("routes known core namespace methods through runtime namespace handlers", async () => {
    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      rpcNamespaceHandlers: {
        project: {
          list: (request) =>
            createProtocolSuccessFrame(request.id, {
              source: "runtime-project-list",
            }),
        },
      },
    });

    await runtime.start();

    const response = await sendRequest(runtime.config().socketPath, {
      id: "project-list-1",
      method: "project.list",
      params: {},
    });

    expect(response).toEqual({
      id: "project-list-1",
      result: {
        source: "runtime-project-list",
      },
    });

    await runtime.stop();
  });

  it("routes project namespace CRUD methods through runtime adapters", async () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    await runtime.start();

    const createResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-create-1",
      method: "project.create",
      params: {
        input: {
          name: "Work",
          description: "Initial",
        },
      },
    });

    const createdProject = createResponse.result as { id?: string; name?: string };
    expect(createResponse.id).toBe("project-create-1");
    expect(typeof createdProject.id).toBe("string");
    expect(createdProject.name).toBe("Work");

    const projectId = createdProject.id as string;

    const listResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-list-1",
      method: "project.list",
      params: {},
    });

    expect(listResponse.id).toBe("project-list-1");
    expect(listResponse.result).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: projectId, name: "Work" })]),
    );

    const getResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-get-1",
      method: "project.get",
      params: {
        id: projectId,
      },
    });

    expect(getResponse.id).toBe("project-get-1");
    expect(getResponse.result).toEqual(expect.objectContaining({ id: projectId, name: "Work" }));

    const updateResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-update-1",
      method: "project.update",
      params: {
        id: projectId,
        input: {
          name: "Work Updated",
          priority: "high",
        },
      },
    });

    expect(updateResponse.id).toBe("project-update-1");
    expect(updateResponse.result).toEqual(
      expect.objectContaining({ id: projectId, name: "Work Updated", priority: "high" }),
    );

    const deleteResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-delete-1",
      method: "project.delete",
      params: {
        id: projectId,
      },
    });

    expect(deleteResponse).toEqual({
      id: "project-delete-1",
      result: null,
    });

    await runtime.stop();
  });

  it("routes task namespace methods through runtime adapters", async () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    await runtime.start();

    const sourceProjectResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-source-create",
      method: "project.create",
      params: {
        input: {
          name: "Source Project",
        },
      },
    });

    const targetProjectResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-target-create",
      method: "project.create",
      params: {
        input: {
          name: "Target Project",
        },
      },
    });

    const sourceProjectId = (sourceProjectResponse.result as { id: string }).id;
    const targetProjectId = (targetProjectResponse.result as { id: string }).id;

    const createTaskResponse = await sendRequest(runtime.config().socketPath, {
      id: "task-create-1",
      method: "task.create",
      params: {
        input: {
          title: "Ship feature",
          projectId: sourceProjectId,
          description: "Route through daemon",
          labels: ["phase2"],
        },
      },
    });

    const createdTask = createTaskResponse.result as { id: string };
    const taskId = createdTask.id;

    const listTaskResponse = await sendRequest(runtime.config().socketPath, {
      id: "task-list-1",
      method: "task.list",
      params: {
        filter: {
          projectId: sourceProjectId,
        },
      },
    });

    expect(listTaskResponse.result).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: taskId, title: "Ship feature" })]),
    );

    const getTaskResponse = await sendRequest(runtime.config().socketPath, {
      id: "task-get-1",
      method: "task.get",
      params: {
        id: taskId,
      },
    });

    expect(getTaskResponse.result).toEqual(
      expect.objectContaining({ id: taskId, description: "Route through daemon" }),
    );

    const updateTaskResponse = await sendRequest(runtime.config().socketPath, {
      id: "task-update-1",
      method: "task.update",
      params: {
        id: taskId,
        input: {
          status: "inprogress",
          priority: "high",
        },
      },
    });

    expect(updateTaskResponse.result).toEqual(
      expect.objectContaining({ id: taskId, status: "inprogress", priority: "high" }),
    );

    const moveTaskResponse = await sendRequest(runtime.config().socketPath, {
      id: "task-move-1",
      method: "task.move",
      params: {
        id: taskId,
        projectId: targetProjectId,
      },
    });

    expect(moveTaskResponse.result).toEqual(
      expect.objectContaining({ id: taskId, projectId: targetProjectId }),
    );

    const searchTaskResponse = await sendRequest(runtime.config().socketPath, {
      id: "task-search-1",
      method: "task.search",
      params: {
        query: "ship",
      },
    });

    expect(searchTaskResponse.result).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: taskId })]),
    );

    const deleteTaskResponse = await sendRequest(runtime.config().socketPath, {
      id: "task-delete-1",
      method: "task.delete",
      params: {
        id: taskId,
      },
    });

    expect(deleteTaskResponse).toEqual({
      id: "task-delete-1",
      result: null,
    });

    await runtime.stop();
  });

  it("routes label and note namespace methods through runtime adapters", async () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    await runtime.start();

    const createLabelResponse = await sendRequest(runtime.config().socketPath, {
      id: "label-create-1",
      method: "label.create",
      params: {
        input: {
          name: "blocked",
          color: "#ff0000",
        },
      },
    });

    const labelId = (createLabelResponse.result as { id: string }).id;

    const listLabelResponse = await sendRequest(runtime.config().socketPath, {
      id: "label-list-1",
      method: "label.list",
      params: {},
    });

    expect(listLabelResponse.result).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: labelId, name: "blocked" })]),
    );

    const updateLabelResponse = await sendRequest(runtime.config().socketPath, {
      id: "label-update-1",
      method: "label.update",
      params: {
        id: labelId,
        input: {
          name: "blocked-now",
        },
      },
    });

    expect(updateLabelResponse.result).toEqual(
      expect.objectContaining({ id: labelId, name: "blocked-now" }),
    );

    const createProjectResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-note-create",
      method: "project.create",
      params: {
        input: {
          name: "Note Project",
        },
      },
    });

    const projectId = (createProjectResponse.result as { id: string }).id;

    const createNoteResponse = await sendRequest(runtime.config().socketPath, {
      id: "note-create-1",
      method: "note.create",
      params: {
        input: {
          content: "Capture context",
          author: "agent",
          entityType: "project",
          entityId: projectId,
          tags: ["phase-2"],
        },
      },
    });

    const noteId = (createNoteResponse.result as { id: string }).id;

    const listNoteResponse = await sendRequest(runtime.config().socketPath, {
      id: "note-list-1",
      method: "note.list",
      params: {
        filter: {
          entityType: "project",
          entityId: projectId,
        },
      },
    });

    expect(listNoteResponse.result).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: noteId, content: "Capture context" })]),
    );

    const updateNoteResponse = await sendRequest(runtime.config().socketPath, {
      id: "note-update-1",
      method: "note.update",
      params: {
        id: noteId,
        input: {
          content: "Capture updated context",
        },
      },
    });

    expect(updateNoteResponse.result).toEqual(
      expect.objectContaining({ id: noteId, content: "Capture updated context" }),
    );

    const deleteNoteResponse = await sendRequest(runtime.config().socketPath, {
      id: "note-delete-1",
      method: "note.delete",
      params: {
        id: noteId,
      },
    });

    expect(deleteNoteResponse).toEqual({
      id: "note-delete-1",
      result: null,
    });

    const deleteLabelResponse = await sendRequest(runtime.config().socketPath, {
      id: "label-delete-1",
      method: "label.delete",
      params: {
        id: labelId,
      },
    });

    expect(deleteLabelResponse).toEqual({
      id: "label-delete-1",
      result: null,
    });

    await runtime.stop();
  });

  it("maps domain and request validation errors for project/task/label/note methods", async () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    await runtime.start();

    const badRequestResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-get-bad-request",
      method: "project.get",
      params: {
        id: 42,
      },
    });

    expect(badRequestResponse.error).toEqual({
      code: "BAD_REQUEST",
      message: "project.get requires params.id as a non-empty string",
      details: {
        field: "id",
      },
    });

    const notFoundResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-get-not-found",
      method: "project.get",
      params: {
        id: "proj-missing",
      },
    });

    expect(notFoundResponse.error).toEqual({
      code: "NOT_FOUND",
      message: "project not found: proj-missing",
      details: {
        entity: "project",
        id: "proj-missing",
      },
    });

    const validationResponse = await sendRequest(runtime.config().socketPath, {
      id: "label-create-validation",
      method: "label.create",
      params: {
        input: {
          name: "",
        },
      },
    });

    expect(validationResponse.error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: {
        field: "name",
      },
    });

    const noteNotFoundResponse = await sendRequest(runtime.config().socketPath, {
      id: "note-create-not-found",
      method: "note.create",
      params: {
        input: {
          content: "Attached note",
          entityType: "project",
          entityId: "proj-missing",
        },
      },
    });

    expect(noteNotFoundResponse.error).toEqual({
      code: "NOT_FOUND",
      message: "project not found: proj-missing",
      details: {
        entity: "project",
        id: "proj-missing",
      },
    });

    await runtime.stop();
  });

  it("routes events.subscribe and events.unsubscribe over UDS", async () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    await runtime.start();

    const subscribeResponse = await sendRequest(runtime.config().socketPath, {
      id: "sub-1",
      method: "events.subscribe",
      params: {
        events: ["data.changed", "sync.statusChanged"],
      },
    });

    expect(subscribeResponse).toEqual({
      id: "sub-1",
      result: {
        subscribed: ["data.changed", "sync.statusChanged"],
      },
    });

    const unsupportedSubscribeResponse = await sendRequest(runtime.config().socketPath, {
      id: "sub-2",
      method: "events.subscribe",
      params: {
        events: ["unsupported.event"],
      },
    });

    expect(unsupportedSubscribeResponse.id).toBe("sub-2");
    expect(unsupportedSubscribeResponse.error).toMatchObject({
      code: "UNSUPPORTED_CAPABILITY",
    });

    // sendRequest opens a new connection per call, so this unsubscribe call
    // intentionally validates routing/shape only (not same-connection state).
    const unsubscribeResponse = await sendRequest(runtime.config().socketPath, {
      id: "unsub-1",
      method: "events.unsubscribe",
      params: {
        events: ["data.changed"],
      },
    });

    expect(unsubscribeResponse).toEqual({
      id: "unsub-1",
      result: {
        unsubscribed: [],
      },
    });

    await runtime.stop();
  });

  it("returns TIMEOUT on request overrun and remains healthy", async () => {
    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      requestTimeoutMs: 10,
      rpcMethodHandlers: {
        "daemon.ping": async (request) => {
          await new Promise((resolve) => setTimeout(resolve, 60));
          return {
            id: request.id,
            result: {
              ok: true,
              ts: "late",
            },
          };
        },
      },
    });

    await runtime.start();

    const timeoutResponse = await sendRequest(runtime.config().socketPath, {
      id: "ping-timeout",
      method: "daemon.ping",
      params: {},
    });

    expect(timeoutResponse.id).toBe("ping-timeout");
    expect(timeoutResponse.error).toEqual({
      code: "TIMEOUT",
      message: "Request execution timed out",
      details: {
        method: "daemon.ping",
        timeoutMs: 10,
      },
    });

    const statusResponse = await sendRequest(runtime.config().socketPath, {
      id: "status-after-timeout",
      method: "daemon.status",
      params: {},
    });

    expect(statusResponse.id).toBe("status-after-timeout");
    expect(statusResponse.result).toMatchObject({
      state: "running",
      healthy: true,
    });

    await runtime.stop();
  });

  it("stops cleanly and clears runtime status", async () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    await runtime.start();
    const socketPath = runtime.config().socketPath;
    await runtime.stop();

    const status = runtime.status();
    expect(status.state).toBe("stopped");
    expect(status.startedAt).toBeUndefined();
    expect(status.catalogId).toBeUndefined();
    expect(status.transport).toBeUndefined();
    expect(fs.existsSync(socketPath)).toBe(false);
  });

  it("treats repeated start and stop calls as safe no-ops", async () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    const firstStart = await runtime.start();
    const secondStart = await runtime.start();

    expect(secondStart.state).toBe("running");
    expect(secondStart.catalogId).toBe(firstStart.catalogId);

    await runtime.stop();
    await expect(runtime.stop()).resolves.toBeUndefined();
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
