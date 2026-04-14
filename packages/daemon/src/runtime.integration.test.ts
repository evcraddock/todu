import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { type CatalogDocument, createEmptyCatalog, generateScheduledTaskId } from "@todu/core";
import * as engine from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProtocolSuccessFrame } from "./protocol.js";
import {
  DAEMON_CAPABILITY_EVENTS,
  DAEMON_CAPABILITY_METHODS,
  DAEMON_PROTOCOL_VERSION,
} from "./rpc.js";
import { createDaemonRuntime } from "./runtime.js";
import { createNoopWorkerRuntime } from "./workers.js";

const noopWorkerRuntime = createNoopWorkerRuntime();

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

    expect(DAEMON_CAPABILITY_METHODS).toEqual(
      expect.arrayContaining([
        "actor.create",
        "actor.rename",
        "actor.archive",
        "actor.unarchive",
        "project.addAuthorizedActors",
        "project.removeAuthorizedActors",
        "project.setAuthorizedActors",
        "integration.create",
        "integration.status",
        "recurring.process",
        "habit.history",
        "sync.catalogId",
        "sync.join",
      ]),
    );

    await runtime.stop();
  });

  it("routes actor list/create/rename/archive/unarchive over UDS", async () => {
    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      role: "authority",
    });

    await runtime.start();

    const createResponse = await sendRequest(runtime.config().socketPath, {
      id: "actor-create-1",
      method: "actor.create",
      params: {
        input: {
          id: "actor-reviewer",
          displayName: "Reviewer",
        },
      },
    });

    expect(createResponse.result).toEqual({
      id: "actor-reviewer",
      displayName: "Reviewer",
    });

    const renameResponse = await sendRequest(runtime.config().socketPath, {
      id: "actor-rename-1",
      method: "actor.rename",
      params: {
        id: "actor-reviewer",
        displayName: "Lead Reviewer",
      },
    });

    expect(renameResponse.result).toEqual({
      id: "actor-reviewer",
      displayName: "Lead Reviewer",
    });

    const archiveResponse = await sendRequest(runtime.config().socketPath, {
      id: "actor-archive-1",
      method: "actor.archive",
      params: {
        id: "actor-reviewer",
      },
    });

    expect(archiveResponse.result).toEqual({
      id: "actor-reviewer",
      displayName: "Lead Reviewer",
      archived: true,
    });

    const listResponse = await sendRequest(runtime.config().socketPath, {
      id: "actor-list-1",
      method: "actor.list",
      params: {},
    });

    expect(listResponse.result).toEqual(
      expect.arrayContaining([
        { id: "actor-user", displayName: "user" },
        { id: "actor-reviewer", displayName: "Lead Reviewer", archived: true },
      ]),
    );

    const unarchiveResponse = await sendRequest(runtime.config().socketPath, {
      id: "actor-unarchive-1",
      method: "actor.unarchive",
      params: {
        id: "actor-reviewer",
      },
    });

    expect(unarchiveResponse.result).toEqual({
      id: "actor-reviewer",
      displayName: "Lead Reviewer",
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

    const addAuthorizedActorsResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-add-authorized-1",
      method: "project.addAuthorizedActors",
      params: {
        id: projectId,
        actorIds: ["actor-user"],
      },
    });

    expect(addAuthorizedActorsResponse.id).toBe("project-add-authorized-1");
    expect(addAuthorizedActorsResponse.result).toEqual(
      expect.objectContaining({
        id: projectId,
        authorizedAssigneeActorIds: ["actor-user"],
      }),
    );

    const removeAuthorizedActorsResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-remove-authorized-1",
      method: "project.removeAuthorizedActors",
      params: {
        id: projectId,
        actorIds: ["actor-user"],
      },
    });

    expect(removeAuthorizedActorsResponse.id).toBe("project-remove-authorized-1");
    expect(removeAuthorizedActorsResponse.result).toEqual(
      expect.objectContaining({
        id: projectId,
        authorizedAssigneeActorIds: [],
      }),
    );

    const setAuthorizedActorsResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-set-authorized-1",
      method: "project.setAuthorizedActors",
      params: {
        id: projectId,
        actorIds: ["actor-user"],
      },
    });

    expect(setAuthorizedActorsResponse.id).toBe("project-set-authorized-1");
    expect(setAuthorizedActorsResponse.result).toEqual(
      expect.objectContaining({
        id: projectId,
        authorizedAssigneeActorIds: ["actor-user"],
      }),
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

  it("routes integration namespace methods through runtime adapters", async () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    await runtime.start();

    const primaryProjectResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-integration-primary-create",
      method: "project.create",
      params: {
        input: {
          name: "Integration Project",
        },
      },
    });

    const secondaryProjectResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-integration-secondary-create",
      method: "project.create",
      params: {
        input: {
          name: "Integration Project 2",
        },
      },
    });

    const primaryProjectId = (primaryProjectResponse.result as { id: string }).id;
    const secondaryProjectId = (secondaryProjectResponse.result as { id: string }).id;

    const createIntegrationResponse = await sendRequest(runtime.config().socketPath, {
      id: "integration-create-1",
      method: "integration.create",
      params: {
        input: {
          provider: "github",
          projectId: primaryProjectId,
          targetKind: "repository",
          targetRef: "owner/repo",
        },
      },
    });

    const integrationId = (createIntegrationResponse.result as { id: string }).id;

    const listIntegrationResponse = await sendRequest(runtime.config().socketPath, {
      id: "integration-list-1",
      method: "integration.list",
      params: {
        filter: {
          provider: "github",
        },
      },
    });

    expect(listIntegrationResponse.result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: integrationId, projectId: primaryProjectId }),
      ]),
    );

    const getIntegrationResponse = await sendRequest(runtime.config().socketPath, {
      id: "integration-get-1",
      method: "integration.get",
      params: {
        id: integrationId,
      },
    });

    expect(getIntegrationResponse.result).toEqual(
      expect.objectContaining({
        id: integrationId,
        provider: "github",
        projectId: primaryProjectId,
        targetRef: "owner/repo",
      }),
    );

    const updateIntegrationResponse = await sendRequest(runtime.config().socketPath, {
      id: "integration-update-1",
      method: "integration.update",
      params: {
        id: integrationId,
        input: {
          projectId: secondaryProjectId,
          provider: "forgejo",
          targetKind: "project",
          targetRef: "team/repo",
          strategy: "pull",
          enabled: false,
        },
      },
    });

    expect(updateIntegrationResponse.result).toEqual(
      expect.objectContaining({
        id: integrationId,
        projectId: secondaryProjectId,
        provider: "forgejo",
        targetKind: "project",
        targetRef: "team/repo",
        strategy: "pull",
        enabled: false,
      }),
    );

    const integrationStatusResponse = await sendRequest(runtime.config().socketPath, {
      id: "integration-status-1",
      method: "integration.status",
      params: {
        id: integrationId,
      },
    });

    expect(integrationStatusResponse.result).toEqual(
      expect.objectContaining({
        bindingId: integrationId,
        state: "idle",
      }),
    );

    const deleteIntegrationResponse = await sendRequest(runtime.config().socketPath, {
      id: "integration-delete-1",
      method: "integration.delete",
      params: {
        id: integrationId,
      },
    });

    expect(deleteIntegrationResponse).toEqual({
      id: "integration-delete-1",
      result: null,
    });

    await runtime.stop();
  });

  it("routes recurring namespace methods through runtime adapters", async () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    await runtime.start();

    const createProjectResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-recurring-create",
      method: "project.create",
      params: {
        input: {
          name: "Recurring Project",
        },
      },
    });

    const projectId = (createProjectResponse.result as { id: string }).id;

    const createRecurringResponse = await sendRequest(runtime.config().socketPath, {
      id: "recurring-create-1",
      method: "recurring.create",
      params: {
        input: {
          title: "Daily standup",
          schedule: "FREQ=DAILY",
          timezone: "America/Chicago",
          startDate: "2026-02-01",
          projectId,
        },
      },
    });

    const recurringId = (createRecurringResponse.result as { id: string }).id;

    const listRecurringResponse = await sendRequest(runtime.config().socketPath, {
      id: "recurring-list-1",
      method: "recurring.list",
      params: {
        filter: {
          projectId,
        },
      },
    });

    expect(listRecurringResponse.result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: recurringId, title: "Daily standup" }),
      ]),
    );

    const getRecurringResponse = await sendRequest(runtime.config().socketPath, {
      id: "recurring-get-1",
      method: "recurring.get",
      params: {
        id: recurringId,
      },
    });

    expect(getRecurringResponse.result).toEqual(
      expect.objectContaining({ id: recurringId, projectId }),
    );

    const updateRecurringResponse = await sendRequest(runtime.config().socketPath, {
      id: "recurring-update-1",
      method: "recurring.update",
      params: {
        id: recurringId,
        input: {
          title: "Daily standup updated",
          priority: "high",
        },
      },
    });

    expect(updateRecurringResponse.result).toEqual(
      expect.objectContaining({
        id: recurringId,
        title: "Daily standup updated",
        priority: "high",
      }),
    );

    const pauseRecurringResponse = await sendRequest(runtime.config().socketPath, {
      id: "recurring-pause-1",
      method: "recurring.pause",
      params: {
        id: recurringId,
      },
    });

    expect(pauseRecurringResponse.result).toEqual(
      expect.objectContaining({ id: recurringId, paused: true }),
    );

    const resumeRecurringResponse = await sendRequest(runtime.config().socketPath, {
      id: "recurring-resume-1",
      method: "recurring.resume",
      params: {
        id: recurringId,
      },
    });

    expect(resumeRecurringResponse.result).toEqual(
      expect.objectContaining({ id: recurringId, paused: false }),
    );

    const upcomingRecurringResponse = await sendRequest(runtime.config().socketPath, {
      id: "recurring-upcoming-1",
      method: "recurring.upcoming",
      params: {
        options: {
          templateId: recurringId,
          days: 14,
        },
      },
    });

    expect(Array.isArray(upcomingRecurringResponse.result)).toBe(true);

    const generateRecurringResponse = await sendRequest(runtime.config().socketPath, {
      id: "recurring-generate-1",
      method: "recurring.generate",
      params: {
        templateId: recurringId,
        date: "2026-02-15",
      },
    });

    expect(generateRecurringResponse.result).toEqual(
      expect.objectContaining({ projectId, templateId: recurringId }),
    );

    const processRecurringResponse = await sendRequest(runtime.config().socketPath, {
      id: "recurring-process-1",
      method: "recurring.process",
      params: {},
    });

    expect(Array.isArray(processRecurringResponse.result)).toBe(true);

    const deleteRecurringResponse = await sendRequest(runtime.config().socketPath, {
      id: "recurring-delete-1",
      method: "recurring.delete",
      params: {
        id: recurringId,
      },
    });

    expect(deleteRecurringResponse).toEqual({
      id: "recurring-delete-1",
      result: null,
    });

    await runtime.stop();
  });

  it("routes habit and sync namespace methods through runtime adapters", async () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    await runtime.start();

    const createProjectResponse = await sendRequest(runtime.config().socketPath, {
      id: "habit-project-create-1",
      method: "project.create",
      params: {
        input: {
          name: "Habits",
        },
      },
    });
    const projectId = (createProjectResponse.result as { id: string }).id;

    const createHabitResponse = await sendRequest(runtime.config().socketPath, {
      id: "habit-create-1",
      method: "habit.create",
      params: {
        input: {
          title: "Meditate",
          projectId,
          schedule: "FREQ=DAILY",
          timezone: "America/Chicago",
          startDate: "2026-02-01",
        },
      },
    });

    const habitId = (createHabitResponse.result as { id: string }).id;

    const listHabitResponse = await sendRequest(runtime.config().socketPath, {
      id: "habit-list-1",
      method: "habit.list",
      params: {},
    });

    expect(listHabitResponse.result).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: habitId, title: "Meditate" })]),
    );

    const getHabitResponse = await sendRequest(runtime.config().socketPath, {
      id: "habit-get-1",
      method: "habit.get",
      params: {
        id: habitId,
      },
    });

    expect(getHabitResponse.result).toEqual(expect.objectContaining({ id: habitId }));

    const updateHabitResponse = await sendRequest(runtime.config().socketPath, {
      id: "habit-update-1",
      method: "habit.update",
      params: {
        id: habitId,
        input: {
          title: "Meditate daily",
        },
      },
    });

    expect(updateHabitResponse.result).toEqual(
      expect.objectContaining({ id: habitId, title: "Meditate daily" }),
    );

    const checkHabitResponse = await sendRequest(runtime.config().socketPath, {
      id: "habit-check-1",
      method: "habit.check",
      params: {
        id: habitId,
      },
    });

    expect(checkHabitResponse.result).toEqual(expect.objectContaining({ completed: true }));

    const streakHabitResponse = await sendRequest(runtime.config().socketPath, {
      id: "habit-streak-1",
      method: "habit.streak",
      params: {
        id: habitId,
      },
    });

    expect(streakHabitResponse.result).toEqual(expect.objectContaining({ totalCheckins: 1 }));

    const historyHabitResponse = await sendRequest(runtime.config().socketPath, {
      id: "habit-history-1",
      method: "habit.history",
      params: {
        id: habitId,
        days: 7,
      },
    });

    expect(Array.isArray(historyHabitResponse.result)).toBe(true);

    const uncheckHabitResponse = await sendRequest(runtime.config().socketPath, {
      id: "habit-uncheck-1",
      method: "habit.uncheck",
      params: {
        id: habitId,
      },
    });

    expect(uncheckHabitResponse).toEqual({
      id: "habit-uncheck-1",
      result: null,
    });

    const pauseHabitResponse = await sendRequest(runtime.config().socketPath, {
      id: "habit-pause-1",
      method: "habit.pause",
      params: {
        id: habitId,
      },
    });

    expect(pauseHabitResponse.result).toEqual(
      expect.objectContaining({ id: habitId, paused: true }),
    );

    const resumeHabitResponse = await sendRequest(runtime.config().socketPath, {
      id: "habit-resume-1",
      method: "habit.resume",
      params: {
        id: habitId,
      },
    });

    expect(resumeHabitResponse.result).toEqual(
      expect.objectContaining({ id: habitId, paused: false }),
    );

    const syncStatusResponse = await sendRequest(runtime.config().socketPath, {
      id: "sync-status-1",
      method: "sync.status",
      params: {},
    });

    expect(syncStatusResponse.result).toEqual(
      expect.objectContaining({
        local: expect.objectContaining({ mode: "standalone" }),
      }),
    );

    const syncCatalogIdResponse = await sendRequest(runtime.config().socketPath, {
      id: "sync-catalog-id-1",
      method: "sync.catalogId",
      params: {},
    });

    expect(syncCatalogIdResponse.result).toBe(runtime.status().catalogId);

    const syncStartResponse = await sendRequest(runtime.config().socketPath, {
      id: "sync-start-1",
      method: "sync.start",
      params: {},
    });

    expect(syncStartResponse).toEqual({
      id: "sync-start-1",
      result: null,
    });

    const syncStopResponse = await sendRequest(runtime.config().socketPath, {
      id: "sync-stop-1",
      method: "sync.stop",
      params: {},
    });

    expect(syncStopResponse).toEqual({
      id: "sync-stop-1",
      result: null,
    });

    const deleteHabitResponse = await sendRequest(runtime.config().socketPath, {
      id: "habit-delete-1",
      method: "habit.delete",
      params: {
        id: habitId,
      },
    });

    expect(deleteHabitResponse).toEqual({
      id: "habit-delete-1",
      result: null,
    });

    await runtime.stop();
  });

  it("supports sync.join check mode without switching catalog pointer", async () => {
    const alternateCatalogId = await createAlternateCatalogDocument(tmpDir);
    const markerPath = path.join(tmpDir, "todu-catalog.id");
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    await runtime.start();

    const previousCatalogId = runtime.status().catalogId;
    if (!previousCatalogId) {
      throw new Error("Expected runtime catalog id");
    }

    const checkResponse = await sendRequest(runtime.config().socketPath, {
      id: "sync-join-check-1",
      method: "sync.join",
      params: {
        catalogId: alternateCatalogId,
        check: true,
      },
    });

    expect(checkResponse).toEqual({
      id: "sync-join-check-1",
      result: {
        mode: "check",
        previousCatalogId,
        targetCatalogId: alternateCatalogId,
        switched: false,
        rolledBack: false,
      },
    });

    expect(runtime.status().catalogId).toBe(previousCatalogId);
    expect(fs.readFileSync(markerPath, "utf-8").trim()).toBe(previousCatalogId);

    await runtime.stop();
  });

  it("switches catalog pointer transactionally on sync.join success", async () => {
    const alternateCatalogId = await createAlternateCatalogDocument(tmpDir);
    const markerPath = path.join(tmpDir, "todu-catalog.id");
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    await runtime.start();

    const previousCatalogId = runtime.status().catalogId;
    if (!previousCatalogId) {
      throw new Error("Expected runtime catalog id");
    }

    const joinResponse = await sendRequest(runtime.config().socketPath, {
      id: "sync-join-1",
      method: "sync.join",
      params: {
        catalogId: alternateCatalogId,
      },
    });

    expect(joinResponse).toEqual({
      id: "sync-join-1",
      result: {
        mode: "join",
        previousCatalogId,
        targetCatalogId: alternateCatalogId,
        switched: true,
        rolledBack: false,
      },
    });

    expect(runtime.status().catalogId).toBe(alternateCatalogId);
    expect(fs.readFileSync(markerPath, "utf-8").trim()).toBe(alternateCatalogId);

    await runtime.stop();
  });

  it("stops and restarts active workers across sync.join transitions", async () => {
    const alternateCatalogId = await createAlternateCatalogDocument(tmpDir);

    let startCount = 0;
    let stopCount = 0;

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      enabledWorkerDomains: ["recurring", "task", "sync"],
      workerRegistrations: [
        {
          manifest: {
            type: "recurring",
            requiredDomains: ["recurring"],
          },
          runtime: {
            start() {
              startCount += 1;
              return {
                stop() {
                  stopCount += 1;
                },
              };
            },
          },
        },
      ],
    });

    await runtime.start();

    expect(startCount).toBe(1);
    expect(runtime.getWorker("recurring")?.state).toBe("running");

    const joinResponse = await sendRequest(runtime.config().socketPath, {
      id: "sync-join-worker-1",
      method: "sync.join",
      params: {
        catalogId: alternateCatalogId,
      },
    });

    expect(joinResponse).toEqual({
      id: "sync-join-worker-1",
      result: expect.objectContaining({
        mode: "join",
        targetCatalogId: alternateCatalogId,
        switched: true,
        rolledBack: false,
      }),
    });

    expect(stopCount).toBe(1);
    expect(startCount).toBe(2);
    expect(runtime.getWorker("recurring")?.state).toBe("running");

    await runtime.stop();

    expect(stopCount).toBe(2);
    expect(runtime.getWorker("recurring")?.state).toBe("stopped");
  });

  it("rolls back marker and preserves prior dataset when sync.join switch fails", async () => {
    const alternateCatalogId = await createAlternateCatalogDocument(tmpDir);
    const markerPath = path.join(tmpDir, "todu-catalog.id");
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

    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    try {
      await runtime.start();

      const previousCatalogId = runtime.status().catalogId;
      if (!previousCatalogId) {
        throw new Error("Expected runtime catalog id");
      }

      const joinResponse = await sendRequest(runtime.config().socketPath, {
        id: "sync-join-fail-1",
        method: "sync.join",
        params: {
          catalogId: alternateCatalogId,
        },
      });

      expect(joinResponse.id).toBe("sync-join-fail-1");
      expect(joinResponse.error).toMatchObject({
        code: "JOIN_FAILED",
        details: {
          stage: "switch",
          previousCatalogId,
          targetCatalogId: alternateCatalogId,
        },
      });

      expect(runtime.status().catalogId).toBe(previousCatalogId);
      expect(fs.readFileSync(markerPath, "utf-8").trim()).toBe(previousCatalogId);
    } finally {
      await runtime.stop();
      createToduSpy.mockRestore();
    }
  });

  it("returns worker status with assignment and dependency metadata", async () => {
    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      assignedWorkerTypes: ["sync"],
      enabledWorkerDomains: ["task", "sync"],
      workerRegistrations: [
        {
          manifest: {
            type: "recurring",
            requiredDomains: ["recurring"],
            optionalDomains: ["task"],
            roleHints: ["authority"],
          },
          runtime: noopWorkerRuntime,
        },
      ],
    });

    await runtime.start();

    const listResponse = await sendRequest(runtime.config().socketPath, {
      id: "worker-status-list-1",
      method: "worker.status",
      params: {},
    });

    expect(listResponse).toEqual({
      id: "worker-status-list-1",
      result: {
        workers: [
          {
            type: "recurring",
            state: "blocked",
            blockedReason: "worker is not assigned to this daemon: recurring",
            errorMessage: null,
            updatedAt: expect.any(String),
            requiredDomains: ["recurring"],
            optionalDomains: ["task"],
            roleHints: ["authority"],
            isAssigned: false,
            missingRequiredDomains: ["recurring"],
          },
        ],
        assignment: {
          assignedWorkerTypes: ["sync"],
        },
        enabledWorkerDomains: ["task", "sync"],
      },
    });

    const singleResponse = await sendRequest(runtime.config().socketPath, {
      id: "worker-status-single-1",
      method: "worker.status",
      params: {
        workerType: "recurring",
      },
    });

    expect(singleResponse.id).toBe("worker-status-single-1");
    expect((singleResponse.result as { workers: unknown[] }).workers).toHaveLength(1);

    const missingWorkerResponse = await sendRequest(runtime.config().socketPath, {
      id: "worker-status-missing-1",
      method: "worker.status",
      params: {
        workerType: "unknown-worker",
      },
    });

    expect(missingWorkerResponse.error).toEqual({
      code: "NOT_FOUND",
      message: "Worker is not registered: unknown-worker",
      details: {
        workerType: "unknown-worker",
      },
    });

    const invalidWorkerTypeResponse = await sendRequest(runtime.config().socketPath, {
      id: "worker-status-invalid-1",
      method: "worker.status",
      params: {
        workerType: "",
      },
    });

    expect(invalidWorkerTypeResponse.error).toEqual({
      code: "BAD_REQUEST",
      message: "worker.status requires optional params.workerType as a non-empty string",
      details: {
        field: "workerType",
      },
    });

    await runtime.stop();
  });

  it("loads configured sync plugins and surfaces runtime state via worker.status", async () => {
    const pluginPath = writeValidSyncPluginModule(tmpDir, "github-plugin.mjs", {
      providerName: "github",
      providerVersion: "1.0.0",
    });

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      syncPluginModulePaths: [pluginPath],
      enabledWorkerDomains: ["project", "task", "sync"],
    });

    await runtime.start();

    expect(runtime.getWorker("github-sync")).toMatchObject({
      state: "running",
      manifest: {
        type: "github-sync",
        requiredDomains: ["sync", "task"],
      },
    });

    const workerStatusResponse = await sendRequest(runtime.config().socketPath, {
      id: "worker-status-plugin-1",
      method: "worker.status",
      params: {
        workerType: "github-sync",
      },
    });

    expect(workerStatusResponse).toEqual({
      id: "worker-status-plugin-1",
      result: {
        workers: [
          {
            type: "github-sync",
            state: "running",
            blockedReason: null,
            errorMessage: null,
            updatedAt: expect.any(String),
            requiredDomains: ["sync", "task"],
            optionalDomains: [],
            roleHints: ["node"],
            isAssigned: true,
            missingRequiredDomains: [],
          },
        ],
        assignment: {
          assignedWorkerTypes: null,
        },
        enabledWorkerDomains: ["project", "task", "sync"],
      },
    });

    await runtime.stop();

    expect(runtime.getWorker("github-sync")?.state).toBe("stopped");
  });

  it("loads configured v3 sync plugins and surfaces runtime state via worker.status", async () => {
    const pluginPath = writeValidSyncPluginModule(tmpDir, "github-plugin-v3.mjs", {
      providerName: "github",
      providerVersion: "2.0.0",
      apiVersion: 3,
    });

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      syncPluginModulePaths: [pluginPath],
      enabledWorkerDomains: ["project", "task", "sync"],
    });

    await runtime.start();

    expect(runtime.getWorker("github-sync")).toMatchObject({
      state: "running",
      manifest: {
        type: "github-sync",
      },
    });

    const workerStatusResponse = await sendRequest(runtime.config().socketPath, {
      id: "worker-status-plugin-v3-1",
      method: "worker.status",
      params: {
        workerType: "github-sync",
      },
    });

    expect(workerStatusResponse).toEqual({
      id: "worker-status-plugin-v3-1",
      result: {
        workers: [
          expect.objectContaining({
            type: "github-sync",
            state: "running",
            requiredDomains: ["sync", "task"],
          }),
        ],
        assignment: {
          assignedWorkerTypes: null,
        },
        enabledWorkerDomains: ["project", "task", "sync"],
      },
    });

    await runtime.stop();
  });

  it("executes sync provider work from integration bindings and persists status for later observers", async () => {
    const outputPath = path.join(tmpDir, "github-provider-events.ndjson");
    const pluginPath = writeRecordingSyncPluginModule(tmpDir, "github-recording-plugin.mjs", {
      providerName: "github",
      providerVersion: "1.0.0",
      outputPath,
    });

    const authorityRuntime = createDaemonRuntime({
      storagePath: tmpDir,
      socketPath: path.join(tmpDir, "authority.sock"),
      syncPluginModulePaths: [pluginPath],
      syncPluginConfigs: {
        github: {
          intervalSeconds: 0.05,
          settings: {
            token: "env:GITHUB_TOKEN",
          },
        },
      },
      enabledWorkerDomains: ["project", "task", "sync"],
    });

    await authorityRuntime.start();

    const createProjectResponse = await sendRequest(authorityRuntime.config().socketPath, {
      id: "project-integration-provider-create",
      method: "project.create",
      params: {
        input: {
          name: "Provider Project",
        },
      },
    });

    const projectId = (createProjectResponse.result as { id: string }).id;

    await sendRequest(authorityRuntime.config().socketPath, {
      id: "task-integration-provider-create",
      method: "task.create",
      params: {
        input: {
          title: "Existing Task",
          projectId,
        },
      },
    });

    const createIntegrationResponse = await sendRequest(authorityRuntime.config().socketPath, {
      id: "integration-provider-create",
      method: "integration.create",
      params: {
        input: {
          provider: "github",
          projectId,
          targetKind: "repository",
          targetRef: "owner/repo",
          strategy: "bidirectional",
          enabled: true,
        },
      },
    });

    const bindingId = (createIntegrationResponse.result as { id: string }).id;

    await waitForProviderEvent(
      outputPath,
      (event) => event.type === "push" && event.bindingId === bindingId,
    );

    const providerEvents = readProviderEvents(outputPath);
    expect(providerEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "initialize",
          settings: {
            token: "env:GITHUB_TOKEN",
          },
        }),
        expect.objectContaining({
          type: "pull",
          bindingId,
          provider: "github",
          targetRef: "owner/repo",
          projectId,
          strategy: "bidirectional",
        }),
        expect.objectContaining({
          type: "push",
          bindingId,
          provider: "github",
          targetRef: "owner/repo",
          projectId,
          strategy: "bidirectional",
          taskCount: 1,
        }),
      ]),
    );

    const authorityStatusResponse = await sendRequest(authorityRuntime.config().socketPath, {
      id: "integration-provider-status-authority",
      method: "integration.status",
      params: {
        id: bindingId,
      },
    });

    expect(authorityStatusResponse.result).toEqual(
      expect.objectContaining({
        bindingId,
        state: "idle",
        authorityId: authorityRuntime.config().socketPath,
        lastAttemptedSyncAt: expect.any(String),
        lastSuccessfulSyncAt: expect.any(String),
        lastErrorSummary: null,
      }),
    );

    await authorityRuntime.stop();

    const observerRuntime = createDaemonRuntime({
      storagePath: tmpDir,
      socketPath: path.join(tmpDir, "observer.sock"),
    });

    await observerRuntime.start();

    const observerStatusResponse = await sendRequest(observerRuntime.config().socketPath, {
      id: "integration-provider-status-observer",
      method: "integration.status",
      params: {
        id: bindingId,
      },
    });

    expect(observerStatusResponse.result).toEqual(
      expect.objectContaining({
        bindingId,
        state: "idle",
        authorityId: authorityRuntime.config().socketPath,
        lastAttemptedSyncAt: expect.any(String),
        lastSuccessfulSyncAt: expect.any(String),
      }),
    );

    await observerRuntime.stop();
  });

  it("executes v3 sync provider work from integration bindings and persists status", async () => {
    const outputPath = path.join(tmpDir, "forgejo-provider-events.ndjson");
    const pluginPath = writeRecordingSyncPluginModule(tmpDir, "forgejo-recording-plugin.mjs", {
      providerName: "forgejo",
      providerVersion: "2.0.0",
      outputPath,
      apiVersion: 3,
    });

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      socketPath: path.join(tmpDir, "forgejo-authority.sock"),
      syncPluginModulePaths: [pluginPath],
      syncPluginConfigs: {
        forgejo: {
          intervalSeconds: 0.05,
          settings: {
            token: "env:FORGEJO_TOKEN",
          },
        },
      },
      enabledWorkerDomains: ["project", "task", "sync"],
    });

    await runtime.start();

    const createProjectResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-integration-provider-v3-create",
      method: "project.create",
      params: {
        input: {
          name: "Provider Project V3",
        },
      },
    });

    const projectId = (createProjectResponse.result as { id: string }).id;

    await sendRequest(runtime.config().socketPath, {
      id: "task-integration-provider-v3-create",
      method: "task.create",
      params: {
        input: {
          title: "Existing Task V3",
          projectId,
        },
      },
    });

    const createIntegrationResponse = await sendRequest(runtime.config().socketPath, {
      id: "integration-provider-v3-create",
      method: "integration.create",
      params: {
        input: {
          provider: "forgejo",
          projectId,
          targetKind: "repository",
          targetRef: "team/repo",
          strategy: "bidirectional",
          enabled: true,
        },
      },
    });

    const bindingId = (createIntegrationResponse.result as { id: string }).id;

    await waitForProviderEvent(
      outputPath,
      (event) => event.type === "push" && event.bindingId === bindingId,
    );

    expect(readProviderEvents(outputPath)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "initialize",
          settings: {
            token: "env:FORGEJO_TOKEN",
          },
        }),
        expect.objectContaining({
          type: "pull",
          bindingId,
          provider: "forgejo",
          targetRef: "team/repo",
          projectId,
          strategy: "bidirectional",
        }),
        expect.objectContaining({
          type: "push",
          bindingId,
          provider: "forgejo",
          targetRef: "team/repo",
          projectId,
          strategy: "bidirectional",
          taskCount: 1,
        }),
      ]),
    );

    const statusResponse = await sendRequest(runtime.config().socketPath, {
      id: "integration-provider-v3-status",
      method: "integration.status",
      params: {
        id: bindingId,
      },
    });

    expect(statusResponse.result).toEqual(
      expect.objectContaining({
        bindingId,
        state: "idle",
        authorityId: runtime.config().socketPath,
        lastAttemptedSyncAt: expect.any(String),
        lastSuccessfulSyncAt: expect.any(String),
        lastErrorSummary: null,
      }),
    );

    await runtime.stop();
  });

  it("executes mixed v2 and v3 sync providers in the same daemon runtime", async () => {
    const githubOutputPath = path.join(tmpDir, "github-provider-events.ndjson");
    const forgejoOutputPath = path.join(tmpDir, "forgejo-provider-events.ndjson");
    const githubPluginPath = writeRecordingSyncPluginModule(tmpDir, "github-mixed-plugin.mjs", {
      providerName: "github",
      providerVersion: "1.0.0",
      outputPath: githubOutputPath,
      apiVersion: 2,
    });
    const forgejoPluginPath = writeRecordingSyncPluginModule(tmpDir, "forgejo-mixed-plugin.mjs", {
      providerName: "forgejo",
      providerVersion: "2.0.0",
      outputPath: forgejoOutputPath,
      apiVersion: 3,
    });

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      socketPath: path.join(tmpDir, "mixed.sock"),
      syncPluginModulePaths: [githubPluginPath, forgejoPluginPath],
      syncPluginConfigs: {
        github: { intervalSeconds: 0.05 },
        forgejo: { intervalSeconds: 0.05 },
      },
      enabledWorkerDomains: ["project", "task", "sync"],
    });

    await runtime.start();

    const githubProjectResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-mixed-github-create",
      method: "project.create",
      params: { input: { name: "GitHub Mixed Project" } },
    });
    const githubProjectId = (githubProjectResponse.result as { id: string }).id;

    const forgejoProjectResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-mixed-forgejo-create",
      method: "project.create",
      params: { input: { name: "Forgejo Mixed Project" } },
    });
    const forgejoProjectId = (forgejoProjectResponse.result as { id: string }).id;

    await sendRequest(runtime.config().socketPath, {
      id: "task-mixed-github-create",
      method: "task.create",
      params: { input: { title: "GitHub Task", projectId: githubProjectId } },
    });
    await sendRequest(runtime.config().socketPath, {
      id: "task-mixed-forgejo-create",
      method: "task.create",
      params: { input: { title: "Forgejo Task", projectId: forgejoProjectId } },
    });

    const githubIntegrationResponse = await sendRequest(runtime.config().socketPath, {
      id: "integration-mixed-github-create",
      method: "integration.create",
      params: {
        input: {
          provider: "github",
          projectId: githubProjectId,
          targetKind: "repository",
          targetRef: "owner/repo",
          strategy: "bidirectional",
          enabled: true,
        },
      },
    });
    const githubBindingId = (githubIntegrationResponse.result as { id: string }).id;

    const forgejoIntegrationResponse = await sendRequest(runtime.config().socketPath, {
      id: "integration-mixed-forgejo-create",
      method: "integration.create",
      params: {
        input: {
          provider: "forgejo",
          projectId: forgejoProjectId,
          targetKind: "repository",
          targetRef: "team/repo",
          strategy: "bidirectional",
          enabled: true,
        },
      },
    });
    const forgejoBindingId = (forgejoIntegrationResponse.result as { id: string }).id;

    await waitForProviderEvent(
      githubOutputPath,
      (event) => event.type === "push" && event.bindingId === githubBindingId,
    );
    await waitForProviderEvent(
      forgejoOutputPath,
      (event) => event.type === "push" && event.bindingId === forgejoBindingId,
    );

    expect(readProviderEvents(githubOutputPath)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "pull", bindingId: githubBindingId }),
        expect.objectContaining({ type: "push", bindingId: githubBindingId, taskCount: 1 }),
      ]),
    );
    expect(readProviderEvents(forgejoOutputPath)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "pull", bindingId: forgejoBindingId }),
        expect.objectContaining({ type: "push", bindingId: forgejoBindingId, taskCount: 1 }),
      ]),
    );

    await runtime.stop();
  });

  it("loads configured worker plugins and surfaces runtime state via worker.status", async () => {
    const pluginPath = writeValidWorkerPluginModule(tmpDir, "recurring-plugin.mjs", {
      pluginName: "recurring-worker",
      pluginVersion: "1.0.0",
      workerType: "recurring",
    });

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      syncPluginModulePaths: [pluginPath],
      enabledWorkerDomains: ["project", "task", "recurring"],
    });

    await runtime.start();

    expect(runtime.getWorker("recurring")).toMatchObject({
      state: "running",
      manifest: {
        type: "recurring",
        requiredDomains: ["recurring", "task"],
      },
    });

    const workerStatusResponse = await sendRequest(runtime.config().socketPath, {
      id: "worker-status-recurring-plugin-1",
      method: "worker.status",
      params: {
        workerType: "recurring",
      },
    });

    expect(workerStatusResponse).toEqual({
      id: "worker-status-recurring-plugin-1",
      result: {
        workers: [
          {
            type: "recurring",
            state: "running",
            blockedReason: null,
            errorMessage: null,
            updatedAt: expect.any(String),
            requiredDomains: ["recurring", "task"],
            optionalDomains: [],
            roleHints: ["node"],
            isAssigned: true,
            missingRequiredDomains: [],
          },
        ],
        assignment: {
          assignedWorkerTypes: null,
        },
        enabledWorkerDomains: ["project", "task", "recurring"],
      },
    });

    await runtime.stop();

    expect(runtime.getWorker("recurring")?.state).toBe("stopped");
  });

  it("recurring worker plugin generates due tasks idempotently with deterministic IDs", async () => {
    const pluginPath = writeRecurringAutomationWorkerPluginModule(
      tmpDir,
      "recurring-automation-plugin.mjs",
      {
        pluginName: "recurring-worker",
        pluginVersion: "1.0.0",
        workerType: "recurring",
      },
    );

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      syncPluginModulePaths: [pluginPath],
      enabledWorkerDomains: ["project", "task", "recurring"],
    });

    await runtime.start();

    const createProjectResponse = await sendRequest(runtime.config().socketPath, {
      id: "project-recurring-worker-create",
      method: "project.create",
      params: {
        input: {
          name: "Recurring Worker Project",
        },
      },
    });

    const projectId = (createProjectResponse.result as { id: string }).id;
    const today = new Date().toISOString().slice(0, 10);

    const createRecurringResponse = await sendRequest(runtime.config().socketPath, {
      id: "recurring-worker-template-create",
      method: "recurring.create",
      params: {
        input: {
          title: "Worker daily",
          schedule: "FREQ=DAILY",
          timezone: "UTC",
          startDate: today,
          projectId,
        },
      },
    });

    const recurringId = (createRecurringResponse.result as { id: string }).id;

    await runtime.stop();
    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 80));

    const firstListResponse = await sendRequest(runtime.config().socketPath, {
      id: "task-list-after-worker-run-1",
      method: "task.list",
      params: {
        filter: {
          projectId,
        },
      },
    });

    const firstTasks = (
      firstListResponse.result as Array<{
        id: string;
        templateId?: string;
        scheduledDate?: string;
      }>
    ).filter((task) => task.templateId === recurringId);

    expect(firstTasks).toHaveLength(1);

    const firstTask = firstTasks[0];
    const scheduledDate = firstTask?.scheduledDate ?? today;
    expect(firstTask?.id).toBe(generateScheduledTaskId(recurringId, scheduledDate));

    await runtime.stop();
    await runtime.start();
    await new Promise((resolve) => setTimeout(resolve, 80));

    const secondListResponse = await sendRequest(runtime.config().socketPath, {
      id: "task-list-after-worker-run-2",
      method: "task.list",
      params: {
        filter: {
          projectId,
        },
      },
    });

    const secondTasks = (
      secondListResponse.result as Array<{ id: string; templateId?: string }>
    ).filter((task) => task.templateId === recurringId);

    expect(secondTasks).toHaveLength(1);
    expect(secondTasks[0]?.id).toBe(firstTask?.id);

    const generateAgainResponse = await sendRequest(runtime.config().socketPath, {
      id: "recurring-worker-generate-again",
      method: "recurring.generate",
      params: {
        templateId: recurringId,
        date: scheduledDate,
      },
    });

    expect((generateAgainResponse.result as { id: string }).id).toBe(firstTask?.id);

    await runtime.stop();
  });

  it("fails invalid or unreachable plugin modules safely with diagnostics", async () => {
    const incompatiblePluginPath = writeInvalidSyncPluginModule(tmpDir, "bad-plugin.mjs");
    const missingPluginPath = path.join(tmpDir, "missing-plugin.mjs");

    const warnings: Array<{ message: string; context?: Record<string, unknown> }> = [];
    const runtimeLogger = {
      level: "info" as const,
      debug: () => {},
      info: () => {},
      warn: (message: string, context?: Record<string, unknown>) => {
        warnings.push({ message, context });
      },
      error: () => {},
      child: () => runtimeLogger,
    };

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      syncPluginModulePaths: [incompatiblePluginPath, missingPluginPath],
      logger: runtimeLogger,
    });

    await runtime.start();

    expect(runtime.status().state).toBe("running");
    expect(runtime.listWorkers()).toEqual([]);

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "plugin load failed",
          context: expect.objectContaining({
            code: "INVALID_PROVIDER",
            modulePath: incompatiblePluginPath,
          }),
        }),
        expect.objectContaining({
          message: "plugin load failed",
          context: expect.objectContaining({
            code: "IMPORT_FAILED",
            modulePath: missingPluginPath,
          }),
        }),
      ]),
    );

    await runtime.stop();
  });

  it("loads sync plugin workers deterministically across daemon restarts", async () => {
    const pluginPath = writeValidSyncPluginModule(tmpDir, "forgejo-plugin.mjs", {
      providerName: "forgejo",
      providerVersion: "1.0.0",
    });

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      syncPluginModulePaths: [pluginPath],
      enabledWorkerDomains: ["project", "task", "sync"],
    });

    await runtime.start();

    expect(
      runtime.listWorkers().filter((worker) => worker.manifest.type === "forgejo-sync"),
    ).toHaveLength(1);
    expect(runtime.getWorker("forgejo-sync")?.state).toBe("running");

    await runtime.stop();

    expect(runtime.getWorker("forgejo-sync")?.state).toBe("stopped");

    await runtime.start();

    expect(
      runtime.listWorkers().filter((worker) => worker.manifest.type === "forgejo-sync"),
    ).toHaveLength(1);
    expect(runtime.getWorker("forgejo-sync")?.state).toBe("running");

    await runtime.stop();
  });

  it("maps domain and request validation errors for project/task/label/integration/note/recurring/habit/sync methods", async () => {
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

    const actorRenameBadRequestResponse = await sendRequest(runtime.config().socketPath, {
      id: "actor-rename-bad-request",
      method: "actor.rename",
      params: {
        id: "actor-user",
        displayName: 42,
      },
    });

    expect(actorRenameBadRequestResponse.error).toEqual({
      code: "BAD_REQUEST",
      message: "actor.rename requires params.displayName as a non-empty string",
      details: {
        field: "displayName",
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

    const actorNotFoundResponse = await sendRequest(runtime.config().socketPath, {
      id: "actor-archive-not-found",
      method: "actor.archive",
      params: {
        id: "actor-missing",
      },
    });

    expect(actorNotFoundResponse.error).toEqual({
      code: "NOT_FOUND",
      message: "actor not found: actor-missing",
      details: {
        entity: "actor",
        id: "actor-missing",
      },
    });

    const actorValidationResponse = await sendRequest(runtime.config().socketPath, {
      id: "actor-create-validation",
      method: "actor.create",
      params: {
        input: {
          id: "actor-user",
          displayName: "Duplicate",
        },
      },
    });

    expect(actorValidationResponse.error).toEqual({
      code: "VALIDATION_ERROR",
      message: "Actor ID already exists: actor-user",
      details: {
        field: "id",
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

    const recurringBadRequestResponse = await sendRequest(runtime.config().socketPath, {
      id: "recurring-get-bad-request",
      method: "recurring.get",
      params: {
        id: 99,
      },
    });

    expect(recurringBadRequestResponse.error).toEqual({
      code: "BAD_REQUEST",
      message: "recurring.get requires params.id as a non-empty string",
      details: {
        field: "id",
      },
    });

    const recurringNotFoundResponse = await sendRequest(runtime.config().socketPath, {
      id: "recurring-get-not-found",
      method: "recurring.get",
      params: {
        id: "rec-missing",
      },
    });

    expect(recurringNotFoundResponse.error).toEqual({
      code: "NOT_FOUND",
      message: "recurring template not found: rec-missing",
      details: {
        entity: "recurring template",
        id: "rec-missing",
      },
    });

    const habitProjectResponse = await sendRequest(runtime.config().socketPath, {
      id: "habit-project-validation-create",
      method: "project.create",
      params: {
        input: {
          name: "Habit Validation",
        },
      },
    });
    const habitProjectId = (habitProjectResponse.result as { id: string }).id;

    const habitValidationResponse = await sendRequest(runtime.config().socketPath, {
      id: "habit-create-validation",
      method: "habit.create",
      params: {
        input: {
          title: "Bad Habit",
          projectId: habitProjectId,
          schedule: "FREQ=HOURLY",
          timezone: "UTC",
          startDate: "2026-02-01",
        },
      },
    });

    expect(habitValidationResponse.error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: {
        field: "schedule",
      },
    });

    const habitHistoryBadRequestResponse = await sendRequest(runtime.config().socketPath, {
      id: "habit-history-bad-request",
      method: "habit.history",
      params: {
        id: "hab-missing",
        days: "7",
      },
    });

    expect(habitHistoryBadRequestResponse.error).toEqual({
      code: "BAD_REQUEST",
      message: "habit.history requires params.days as a positive number",
      details: {
        field: "days",
      },
    });

    const integrationProjectResponse = await sendRequest(runtime.config().socketPath, {
      id: "integration-project-create",
      method: "project.create",
      params: {
        input: {
          name: "Integration Protocol Project",
        },
      },
    });

    const integrationProjectId = (integrationProjectResponse.result as { id: string }).id;

    const integrationBadRequestResponse = await sendRequest(runtime.config().socketPath, {
      id: "integration-get-bad-request",
      method: "integration.get",
      params: {
        id: 99,
      },
    });

    expect(integrationBadRequestResponse.error).toEqual({
      code: "BAD_REQUEST",
      message: "integration.get requires params.id as a non-empty string",
      details: {
        field: "id",
      },
    });

    const firstIntegrationCreateResponse = await sendRequest(runtime.config().socketPath, {
      id: "integration-create-first",
      method: "integration.create",
      params: {
        input: {
          provider: "github",
          projectId: integrationProjectId,
          targetKind: "repository",
          targetRef: "owner/repo",
        },
      },
    });

    expect(firstIntegrationCreateResponse.result).toEqual(
      expect.objectContaining({
        provider: "github",
        projectId: integrationProjectId,
      }),
    );

    const integrationValidationResponse = await sendRequest(runtime.config().socketPath, {
      id: "integration-create-validation",
      method: "integration.create",
      params: {
        input: {
          provider: "forgejo",
          projectId: integrationProjectId,
          targetKind: "repository",
          targetRef: "owner/other",
        },
      },
    });

    expect(integrationValidationResponse.error).toMatchObject({
      code: "VALIDATION_ERROR",
      details: {
        field: "projectId",
      },
    });

    const integrationNotFoundResponse = await sendRequest(runtime.config().socketPath, {
      id: "integration-status-not-found",
      method: "integration.status",
      params: {
        id: "ibind-missing",
      },
    });

    expect(integrationNotFoundResponse.error).toEqual({
      code: "NOT_FOUND",
      message: "integration binding not found: ibind-missing",
      details: {
        entity: "integration binding",
        id: "ibind-missing",
      },
    });

    const unsupportedWorkerControlResponse = await sendRequest(runtime.config().socketPath, {
      id: "worker-start-unsupported",
      method: "worker.start",
      params: {},
    });

    expect(unsupportedWorkerControlResponse.error).toEqual({
      code: "UNSUPPORTED_CAPABILITY",
      message: "Method is not implemented: worker.start",
      details: {
        namespace: "worker",
        method: "worker.start",
        capability: "worker.start",
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

function writeValidSyncPluginModule(
  directory: string,
  filename: string,
  options: {
    providerName: string;
    providerVersion: string;
    apiVersion?: 2 | 3;
  },
): string {
  const modulePath = path.join(directory, filename);

  const moduleSource =
    options.apiVersion === 3
      ? `export const syncProvider = {
  manifest: {
    name: ${JSON.stringify(options.providerName)},
    version: ${JSON.stringify(options.providerVersion)},
    apiVersion: 3,
  },
  provider: {
    name: ${JSON.stringify(options.providerName)},
    version: ${JSON.stringify(options.providerVersion)},
    async initialize() {},
    async shutdown() {},
    async pull() {
      return { tasks: [], comments: [] };
    },
    async push() {
      return { commentLinks: [], taskLinks: [] };
    },
  },
};`
      : `export const syncProvider = {
  manifest: {
    name: ${JSON.stringify(options.providerName)},
    version: ${JSON.stringify(options.providerVersion)},
    apiVersion: 2,
  },
  provider: {
    name: ${JSON.stringify(options.providerName)},
    version: ${JSON.stringify(options.providerVersion)},
    async initialize() {},
    async shutdown() {},
    async pull() {
      return { tasks: [] };
    },
    async push() {
      return { commentLinks: [], taskLinks: [] };
    },
    mapToTask() {
      return {
        id: "task-1",
        title: "Example",
        status: "active",
        priority: "medium",
        projectId: "project-1",
        labels: [],
        assigneeActorIds: [],
        assignees: [],
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      };
    },
    mapFromTask() {
      return {
        externalId: "ext-1",
        title: "Example",
      };
    },
  },
};`;

  fs.writeFileSync(modulePath, moduleSource, "utf8");

  return modulePath;
}

function writeRecordingSyncPluginModule(
  directory: string,
  filename: string,
  options: {
    providerName: string;
    providerVersion: string;
    outputPath: string;
    apiVersion?: 2 | 3;
  },
): string {
  const modulePath = path.join(directory, filename);

  const moduleSource =
    options.apiVersion === 3
      ? `import fs from "node:fs";

const outputPath = ${JSON.stringify(options.outputPath)};

function record(event) {
  fs.appendFileSync(outputPath, JSON.stringify(event) + "\\n", "utf8");
}

export const syncProvider = {
  manifest: {
    name: ${JSON.stringify(options.providerName)},
    version: ${JSON.stringify(options.providerVersion)},
    apiVersion: 3,
  },
  provider: {
    name: ${JSON.stringify(options.providerName)},
    version: ${JSON.stringify(options.providerVersion)},
    async initialize(config) {
      record({ type: "initialize", settings: config.settings });
    },
    async shutdown() {
      record({ type: "shutdown" });
    },
    async pull(binding, project) {
      record({
        type: "pull",
        bindingId: binding.id,
        provider: binding.provider,
        targetRef: binding.targetRef,
        projectId: project.id,
        strategy: binding.strategy,
      });
      return { tasks: [], comments: [] };
    },
    async push(binding, tasks, project) {
      record({
        type: "push",
        bindingId: binding.id,
        provider: binding.provider,
        targetRef: binding.targetRef,
        projectId: project.id,
        strategy: binding.strategy,
        taskCount: tasks.length,
      });
      return { commentLinks: [], taskLinks: [] };
    },
  },
};`
      : `import fs from "node:fs";

const outputPath = ${JSON.stringify(options.outputPath)};

function record(event) {
  fs.appendFileSync(outputPath, JSON.stringify(event) + "\\n", "utf8");
}

export const syncProvider = {
  manifest: {
    name: ${JSON.stringify(options.providerName)},
    version: ${JSON.stringify(options.providerVersion)},
    apiVersion: 2,
  },
  provider: {
    name: ${JSON.stringify(options.providerName)},
    version: ${JSON.stringify(options.providerVersion)},
    async initialize(config) {
      record({ type: "initialize", settings: config.settings });
    },
    async shutdown() {
      record({ type: "shutdown" });
    },
    async pull(binding, project) {
      record({
        type: "pull",
        bindingId: binding.id,
        provider: binding.provider,
        targetRef: binding.targetRef,
        projectId: project.id,
        strategy: binding.strategy,
      });
      return { tasks: [] };
    },
    async push(binding, tasks, project) {
      record({
        type: "push",
        bindingId: binding.id,
        provider: binding.provider,
        targetRef: binding.targetRef,
        projectId: project.id,
        strategy: binding.strategy,
        taskCount: tasks.length,
      });
      return { commentLinks: [], taskLinks: [] };
    },
    mapToTask() {
      return {
        id: "task-1",
        title: "Example",
        status: "active",
        priority: "medium",
        projectId: "project-1",
        labels: [],
        assigneeActorIds: [],
        assignees: [],
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      };
    },
    mapFromTask() {
      return {
        externalId: "ext-1",
        title: "Example",
      };
    },
  },
};`;

  fs.writeFileSync(modulePath, moduleSource, "utf8");

  return modulePath;
}

function writeValidWorkerPluginModule(
  directory: string,
  filename: string,
  options: {
    pluginName: string;
    pluginVersion: string;
    workerType: string;
  },
): string {
  const modulePath = path.join(directory, filename);

  const moduleSource = `export const workerPlugin = {
  manifest: {
    name: ${JSON.stringify(options.pluginName)},
    version: ${JSON.stringify(options.pluginVersion)},
    worker: {
      type: ${JSON.stringify(options.workerType)},
      requiredDomains: ["recurring", "task"],
      roleHints: ["node"],
    },
  },
  createRuntime() {
    return {
      start() {
        return {
          stop() {},
        };
      },
    };
  },
};`;

  fs.writeFileSync(modulePath, moduleSource, "utf8");

  return modulePath;
}

function writeRecurringAutomationWorkerPluginModule(
  directory: string,
  filename: string,
  options: {
    pluginName: string;
    pluginVersion: string;
    workerType: string;
  },
): string {
  const modulePath = path.join(directory, filename);

  const moduleSource = `export const workerPlugin = {
  manifest: {
    name: ${JSON.stringify(options.pluginName)},
    version: ${JSON.stringify(options.pluginVersion)},
    worker: {
      type: ${JSON.stringify(options.workerType)},
      requiredDomains: ["recurring", "task"],
      roleHints: ["node"],
    },
  },
  createRuntime(context) {
    return {
      start() {
        let stopped = false;

        const runOnce = async () => {
          if (stopped) {
            return;
          }

          const activeTodu = context.getTodu();
          if (!activeTodu) {
            return;
          }

          await activeTodu.recurring.process();
        };

        void runOnce();

        return {
          stop() {
            if (stopped) {
              return;
            }

            stopped = true;
          },
        };
      },
    };
  },
};`;

  fs.writeFileSync(modulePath, moduleSource, "utf8");

  return modulePath;
}

function readProviderEvents(outputPath: string): Array<Record<string, unknown>> {
  if (!fs.existsSync(outputPath)) {
    return [];
  }

  return fs
    .readFileSync(outputPath, "utf8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

async function waitForProviderEvent(
  outputPath: string,
  predicate: (event: Record<string, unknown>) => boolean,
  timeoutMs = 2_000,
): Promise<Record<string, unknown>> {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const event = readProviderEvents(outputPath).find(predicate);
    if (event) {
      return event;
    }

    await new Promise((resolve) => setTimeout(resolve, 25));
  }

  throw new Error(`Timed out waiting for provider event in ${outputPath}`);
}

function writeInvalidSyncPluginModule(directory: string, filename: string): string {
  const modulePath = path.join(directory, filename);

  const moduleSource = `export default {
  manifest: {
    name: "github",
    version: "1.0.0",
    apiVersion: 999,
  },
  provider: {
    name: "github",
    version: "1.0.0",
    async initialize() {},
    async shutdown() {},
    async pull() {
      return { tasks: [] };
    },
    async push() {},
    mapToTask() {
      return {
        id: "task-1",
        title: "Example",
        status: "active",
        priority: "medium",
        projectId: "project-1",
        labels: [],
        assignees: [],
        createdAt: new Date(0).toISOString(),
        updatedAt: new Date(0).toISOString(),
      };
    },
    mapFromTask() {
      return {
        externalId: "ext-1",
        title: "Example",
      };
    },
  },
};`;

  fs.writeFileSync(modulePath, moduleSource, "utf8");

  return modulePath;
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
