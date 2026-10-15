import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { type DocHandle, Repo } from "@automerge/automerge-repo";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import {
  type CatalogDocument,
  createActorId,
  createEmptyCatalog,
  createIntegrationBindingId,
  createNoteId,
  createProjectId,
  createTaskDetailDocument,
  createTaskId,
  createTaskListDocument,
  type IntegrationBinding,
  type IntegrationRegistryDocument,
  type NotesDocument,
  type Result,
  type Task,
  type TaskDetailDocument,
  type TaskListDocument,
} from "@todu/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  ConfirmSyncWorkflowIntentInput,
  PrepareSyncWorkflowIntentInput,
  SyncWorkflowIntentPreview,
} from "../../core/src/sync-workflow-intent.js";
import { ensureAutomergeWasmInitialized } from "./automerge-init.js";
import {
  createSyncWorkflowIntentTools,
  type SyncWorkflowIntentTools,
} from "./sync-workflow-intent.js";

const bindingId = createIntegrationBindingId("binding-operator");
const projectId = createProjectId("project-operator");
const taskId = createTaskId("task-operator");
const originalClock = "2026-04-01T00:00:00.000Z";
const sourceUrl = "https://example.invalid/issues/42";
const actorId = createActorId("actor-operator");

function value<T>(result: Result<T>): T {
  if (!result.ok) throw new Error(JSON.stringify(result.error));
  return result.value;
}

function input(
  overrides: Partial<PrepareSyncWorkflowIntentInput> = {},
): PrepareSyncWorkflowIntentInput {
  return {
    bindingId,
    localTaskId: taskId,
    externalId: "42",
    sourceUrl,
    intent: "cancel",
    reason: "confirmed-remote-deletion",
    ...overrides,
  };
}

function copy<T>(document: T): T {
  return JSON.parse(JSON.stringify(document)) as T;
}

describe("local operator sync workflow intent with isolated native storage", () => {
  let directory: string;
  let repo: Repo;
  let catalog: DocHandle<CatalogDocument>;
  let registry: DocHandle<IntegrationRegistryDocument>;
  let list: DocHandle<TaskListDocument>;
  let detail: DocHandle<TaskDetailDocument>;
  let comments: DocHandle<NotesDocument>;
  let tools: SyncWorkflowIntentTools;
  let clock: number;
  let closed: boolean;
  let flush: () => Promise<void>;

  function factory(): SyncWorkflowIntentTools {
    return createSyncWorkflowIntentTools({
      catalog,
      repo,
      isClosed: () => closed,
      now: () => clock,
      flush: () => flush(),
    });
  }

  async function preview(): Promise<SyncWorkflowIntentPreview> {
    return value(await tools.prepare(input()));
  }

  async function confirm(token: string) {
    return tools.confirm({ token, confirmed: true });
  }

  function task(): Task {
    return list.doc().tasks[0];
  }

  beforeEach(async () => {
    await ensureAutomergeWasmInitialized();
    directory = await fs.mkdtemp(path.join(os.tmpdir(), "todu-workflow-intent-"));
    repo = new Repo({ storage: new NodeFSStorageAdapter(directory), network: [] });
    clock = Date.parse("2026-04-02T12:00:00.123Z");
    closed = false;
    const binding: IntegrationBinding = {
      id: bindingId,
      provider: "fixture",
      projectId,
      targetKind: "repository",
      targetRef: "owner/repository",
      strategy: "bidirectional",
      enabled: true,
      options: { actorMappings: [{ actorId, externalAccountId: "100", trusted: false }] },
      createdAt: originalClock,
      updatedAt: originalClock,
    };
    registry = repo.create<IntegrationRegistryDocument>({ bindings: [binding] });
    detail = repo.create<TaskDetailDocument>(
      createTaskDetailDocument(taskId, "# Original body", {
        state: "pendingApproval",
        sourceBindingId: bindingId,
        sourceActorId: actorId,
        sourceFingerprint: "fixture-fingerprint",
      }),
    );
    list = repo.create<TaskListDocument>({
      ...createTaskListDocument(projectId),
      tasks: [
        {
          id: taskId,
          projectId,
          title: "Original title",
          status: "active",
          priority: "high",
          labels: ["operator", "preserve"],
          assigneeActorIds: [actorId],
          assignees: ["legacy"],
          externalId: "42",
          sourceUrl,
          dueDate: "2026-04-09",
          scheduledDate: "2026-04-08",
          templateId: "template-fixture",
          createdAt: originalClock,
          updatedAt: originalClock,
        },
      ],
      detailDocIds: { [taskId]: detail.documentId },
      descriptionSearchTextByTaskId: { [taskId]: "# original body" },
    });
    comments = repo.create<NotesDocument>({
      notes: [
        {
          id: createNoteId("note-comment"),
          content: "# Preserve comment",
          author: "operator",
          authorActorId: actorId,
          contentApproval: { state: "approved", reviewedAt: originalClock },
          entityType: "task",
          entityId: taskId,
          tags: ["comment"],
          createdAt: originalClock,
          updatedAt: originalClock,
        },
      ],
    });
    catalog = repo.create<CatalogDocument>({
      ...createEmptyCatalog(),
      projects: [
        {
          id: projectId,
          name: "Operator fixture",
          status: "active",
          priority: "high",
          authorizedAssigneeActorIds: [actorId],
          createdAt: originalClock,
          updatedAt: originalClock,
        },
      ],
      integrationRegistryDocId: registry.documentId,
      taskListDocIds: { [projectId]: list.documentId },
      notesBucketDocIds: { [`entity:task:${taskId}`]: comments.documentId },
    });
    await repo.flush();
    flush = vi.fn(() => repo.flush());
    tools = factory();
  });

  afterEach(async () => {
    await repo.shutdown();
    await fs.rm(directory, { recursive: true, force: true });
  });

  it("cancels an unknown-baseline task with only status/ordinary edit metadata changed, preserving comments and approval", async () => {
    const beforeList = copy(list.doc());
    const beforeDetail = copy(detail.doc());
    const beforeComments = copy(comments.doc());
    const beforeCatalog = copy(catalog.doc());
    const beforeRegistry = copy(registry.doc());
    const prepared = await preview();
    expect(prepared).toEqual({
      token: expect.stringMatching(/^[a-f0-9]{64}$/),
      bindingId,
      projectId,
      localTaskId: taskId,
      externalId: "42",
      sourceUrl,
      currentStatus: "active",
      targetStatus: "canceled",
      expiresAt: new Date(clock + 300_000).toISOString(),
    });
    expect(task().status).toBe("active");
    const receipt = value(await confirm(prepared.token));
    expect(receipt).toEqual({
      bindingId,
      projectId,
      localTaskId: taskId,
      externalId: "42",
      sourceUrl,
      status: "canceled",
      updatedAt: new Date(clock).toISOString(),
    });
    beforeList.tasks[0].status = "canceled";
    beforeList.tasks[0].updatedAt = new Date(clock).toISOString();
    expect(copy(list.doc())).toEqual(beforeList);
    expect(copy(detail.doc())).toEqual(beforeDetail);
    expect(copy(comments.doc())).toEqual(beforeComments);
    expect(copy(catalog.doc())).toEqual(beforeCatalog);
    expect(copy(registry.doc())).toEqual(beforeRegistry);
    expect(flush).toHaveBeenCalledOnce();

    const reader = new Repo({ storage: new NodeFSStorageAdapter(directory), network: [] });
    try {
      const persisted = await reader.find<TaskListDocument>(list.documentId);
      expect(copy(persisted.doc())).toEqual(beforeList);
    } finally {
      await reader.shutdown();
    }
  });

  it.each([
    "done",
    "inprogress",
    "waiting",
  ] as const)("explicitly cancels %s without changing ordinary transition validation", async (status) => {
    list.change((doc) => {
      doc.tasks[0].status = status;
    });
    const prepared = await preview();
    expect(prepared.currentStatus).toBe(status);
    expect(value(await confirm(prepared.token)).status).toBe("canceled");
  });

  it("permits canceled -> local reopening -> fresh operator confirmation", async () => {
    value(await confirm((await preview()).token));
    list.change((doc) => {
      doc.tasks[0].status = "active";
    });
    const prepared = await preview();
    expect(prepared.currentStatus).toBe("active");
    value(await confirm(prepared.token));
    expect(task().status).toBe("canceled");
  });

  it("rejects a stale preview after reopening even at the same edit clock", async () => {
    value(await confirm((await preview()).token));
    const stale = await preview();
    const previousClock = task().updatedAt;
    list.change((doc) => {
      doc.tasks[0].status = "active";
    });
    expect(task().updatedAt).toBe(previousClock);
    expect((await confirm(stale.token)).ok).toBe(false);
    expect(task().status).toBe("active");
  });

  it.each([
    "title",
    "body",
    "approval",
    "mapping",
    "project",
    "binding",
    "clock",
    "reverted-title",
    "unrelated-task",
  ])("rejects same-clock or reverted %s edits with native-head freshness", async (edit) => {
    const prepared = await preview();
    if (edit === "title" || edit === "reverted-title") {
      list.change((doc) => {
        doc.tasks[0].title = "Changed";
      });
      if (edit === "reverted-title")
        list.change((doc) => {
          doc.tasks[0].title = "Original title";
        });
    } else if (edit === "body") {
      detail.change((doc) => {
        doc.description = "Changed body";
      });
    } else if (edit === "approval") {
      detail.change((doc) => {
        if (doc.descriptionApproval) doc.descriptionApproval.state = "approved";
      });
    } else if (edit === "mapping") {
      registry.change((doc) => {
        doc.bindings[0].options = { actorMappings: [] };
      });
    } else if (edit === "project") {
      catalog.change((doc) => {
        doc.projects[0].name = "Changed project";
      });
    } else if (edit === "binding") {
      registry.change((doc) => {
        doc.bindings[0].targetRef = "other/repository";
      });
    } else if (edit === "clock") {
      list.change((doc) => {
        doc.tasks[0].updatedAt = new Date(clock).toISOString();
      });
    } else {
      list.change((doc) => {
        doc.tasks.push({
          ...copy(task()),
          id: createTaskId("other"),
          externalId: "43",
          sourceUrl: "other",
        });
      });
    }
    const before = copy(list.doc());
    expect((await confirm(prepared.token)).ok).toBe(false);
    expect(copy(list.doc())).toEqual(before);
    expect(flush).not.toHaveBeenCalled();
    expect((await confirm(prepared.token)).ok).toBe(false);
  });

  it.each([
    "registry-pointer",
    "list-pointer",
    "detail-pointer",
    "missing-project",
    "duplicate-project",
    "duplicate-binding",
    "scope",
    "list-scope",
    "task-scope",
    "task-id",
    "external-id",
    "source-url",
    "detail-identity",
  ])("rejects stale %s state before writing", async (edit) => {
    const prepared = await preview();
    if (edit === "registry-pointer")
      catalog.change((doc) => {
        delete doc.integrationRegistryDocId;
      });
    else if (edit === "list-pointer")
      catalog.change((doc) => {
        delete doc.taskListDocIds[projectId];
      });
    else if (edit === "detail-pointer")
      list.change((doc) => {
        delete doc.detailDocIds[taskId];
      });
    else if (edit === "missing-project")
      catalog.change((doc) => {
        doc.projects.splice(0, 1);
      });
    else if (edit === "duplicate-project")
      catalog.change((doc) => {
        doc.projects.push(copy(doc.projects[0]));
      });
    else if (edit === "duplicate-binding")
      registry.change((doc) => {
        doc.bindings.push(copy(doc.bindings[0]));
      });
    else if (edit === "scope")
      registry.change((doc) => {
        doc.bindings[0].projectId = createProjectId("other");
      });
    else if (edit === "list-scope")
      list.change((doc) => {
        doc.projectId = createProjectId("other");
      });
    else if (edit === "task-scope")
      list.change((doc) => {
        doc.tasks[0].projectId = createProjectId("other");
      });
    else if (edit === "task-id")
      list.change((doc) => {
        doc.tasks[0].id = createTaskId("other");
      });
    else if (edit === "external-id")
      list.change((doc) => {
        doc.tasks[0].externalId = "43";
      });
    else if (edit === "source-url")
      list.change((doc) => {
        doc.tasks[0].sourceUrl = "other";
      });
    else
      detail.change((doc) => {
        doc.taskId = "other";
      });
    expect((await confirm(prepared.token)).ok).toBe(false);
    expect(task().status).toBe("active");
    expect(flush).not.toHaveBeenCalled();
  });

  it.each([
    "local",
    "external",
    "source",
  ])("rejects ambiguous %s identity in the scoped project", async (field) => {
    list.change((doc) => {
      const duplicate = copy(doc.tasks[0]);
      if (field !== "local") duplicate.id = createTaskId("other");
      if (field !== "external") duplicate.externalId = "43";
      if (field !== "source") duplicate.sourceUrl = "other";
      doc.tasks.push(duplicate);
    });
    expect((await tools.prepare(input())).ok).toBe(false);
    expect(task().status).toBe("active");
  });

  it("does not search or cancel a task in another binding's project", async () => {
    const otherProject = createProjectId("other-project");
    const otherList = repo.create<TaskListDocument>(createTaskListDocument(otherProject));
    catalog.change((doc) => {
      doc.projects.push({ ...copy(doc.projects[0]), id: otherProject });
      doc.taskListDocIds[otherProject] = otherList.documentId;
    });
    registry.change((doc) => {
      doc.bindings[0].projectId = otherProject;
    });
    expect((await tools.prepare(input())).ok).toBe(false);
    expect(task().status).toBe("active");
  });

  it("allows matching external identities in a different project without touching them", async () => {
    const otherProject = createProjectId("other-project");
    const otherList = repo.create<TaskListDocument>({
      ...createTaskListDocument(otherProject),
      tasks: [{ ...copy(task()), projectId: otherProject }],
    });
    catalog.change((doc) => {
      doc.projects.push({ ...copy(doc.projects[0]), id: otherProject });
      doc.taskListDocIds[otherProject] = otherList.documentId;
    });
    value(await confirm((await preview()).token));
    expect(otherList.doc().tasks[0].status).toBe("active");
  });

  it("requires exact source identity, including source absence", async () => {
    expect((await tools.prepare(input({ sourceUrl: "other" }))).ok).toBe(false);
    expect((await tools.prepare(input({ sourceUrl: undefined }))).ok).toBe(false);
    list.change((doc) => {
      delete doc.tasks[0].sourceUrl;
    });
    const prepared = value(await tools.prepare(input({ sourceUrl: undefined })));
    expect(prepared).not.toHaveProperty("sourceUrl");
    expect(value(await confirm(prepared.token))).not.toHaveProperty("sourceUrl");
  });

  it.each([
    "missing-registry",
    "missing-list",
    "missing-binding",
    "duplicate-binding",
    "duplicate-project",
    "wrong-detail",
  ])("rejects %s during preparation without mutation", async (state) => {
    if (state === "missing-registry")
      catalog.change((doc) => {
        delete doc.integrationRegistryDocId;
      });
    else if (state === "missing-list")
      catalog.change((doc) => {
        delete doc.taskListDocIds[projectId];
      });
    else if (state === "missing-binding")
      registry.change((doc) => {
        doc.bindings.splice(0, 1);
      });
    else if (state === "duplicate-binding")
      registry.change((doc) => {
        doc.bindings.push(copy(doc.bindings[0]));
      });
    else if (state === "duplicate-project")
      catalog.change((doc) => {
        doc.projects.push(copy(doc.projects[0]));
      });
    else
      detail.change((doc) => {
        doc.taskId = "other";
      });
    expect((await tools.prepare(input())).ok).toBe(false);
    expect(task().status).toBe("active");
  });

  it("supports tasks without a detail document and does not invent one", async () => {
    list.change((doc) => {
      delete doc.detailDocIds[taskId];
    });
    value(await confirm((await preview()).token));
    expect(list.doc().detailDocIds[taskId]).toBeUndefined();
  });

  it("rejects expiration at the five-minute boundary and consumes the token", async () => {
    const prepared = await preview();
    clock += 300_000;
    expect((await confirm(prepared.token)).ok).toBe(false);
    clock -= 300_000;
    expect((await confirm(prepared.token)).ok).toBe(false);
    expect(task().status).toBe("active");
  });

  it("rejects reused, unknown, foreign-factory and restart tokens", async () => {
    const prepared = await preview();
    expect((await factory().confirm({ token: prepared.token, confirmed: true })).ok).toBe(false);
    expect((await confirm("made-up-token")).ok).toBe(false);
    value(await confirm(prepared.token));
    expect((await confirm(prepared.token)).ok).toBe(false);
    const beforeRestart = await preview();
    tools = factory();
    expect((await confirm(beforeRestart.token)).ok).toBe(false);
  });

  it.each([
    undefined,
    false,
    "true",
    1,
    null,
  ])("requires literal confirmed:true, not %s", async (confirmed) => {
    const prepared = await preview();
    expect(
      (await tools.confirm({ token: prepared.token, confirmed } as ConfirmSyncWorkflowIntentInput))
        .ok,
    ).toBe(false);
    expect((await confirm(prepared.token)).ok).toBe(false);
    expect(task().status).toBe("active");
  });

  it.each([
    null,
    [],
    "cancel",
    {},
    { intent: "done" },
    { intent: "canceled" },
    { reason: "remote-deletion" },
    { bindingId: "" },
    { localTaskId: 3 },
    { externalId: " " },
    { sourceUrl: null },
    { status: "done" },
    { targetStatus: "canceled" },
    { updatedAt: originalClock },
    { description: "replace body" },
    { projectId },
    { confirmed: true },
  ])("rejects malformed or extra prepare fields: %j", async (override) => {
    const raw =
      override &&
      typeof override === "object" &&
      !Array.isArray(override) &&
      Object.keys(override).length > 0
        ? { ...input(), ...override }
        : override;
    expect((await tools.prepare(raw as PrepareSyncWorkflowIntentInput)).ok).toBe(false);
    expect(task().status).toBe("active");
  });

  it("rejects inherited fields, accessors, and symbol/hidden extras without invoking getters", async () => {
    const getter = vi.fn(() => "cancel");
    const accessor = Object.defineProperty(input(), "intent", { get: getter });
    const symbol = { ...input(), [Symbol("extra")]: "value" };
    const hidden = Object.defineProperty(input(), "extra", { value: true });
    for (const raw of [Object.create(input()), accessor, symbol, hidden]) {
      expect((await tools.prepare(raw as PrepareSyncWorkflowIntentInput)).ok).toBe(false);
    }
    expect(getter).not.toHaveBeenCalled();
  });

  it("captures edits made during asynchronous loads only after the final native checks", async () => {
    const preparing = tools.prepare(input());
    list.change((doc) => {
      doc.tasks[0].status = "done";
    });
    detail.change((doc) => {
      doc.description = "Fresh body while loading";
    });
    registry.change((doc) => {
      doc.bindings[0].options = { actorMappings: [] };
    });
    const prepared = value(await preparing);
    expect(prepared.currentStatus).toBe("done");
    value(await confirm(prepared.token));
    expect(detail.doc().description).toBe("Fresh body while loading");
  });

  it("rejects a catalog pointer swapped while native documents are loading", async () => {
    const preparing = tools.prepare(input());
    const replacement = repo.create<IntegrationRegistryDocument>({
      bindings: copy(registry.doc().bindings),
    });
    catalog.change((doc) => {
      doc.integrationRegistryDocId = replacement.documentId;
    });
    expect((await preparing).ok).toBe(false);
    expect(task().status).toBe("active");
    expect(flush).not.toHaveBeenCalled();
  });

  it.each([
    "accessor",
    "symbol",
    "hidden",
    "inherited",
  ])("rejects %s confirmation extras without leaving a reusable token", async (shape) => {
    const prepared = await preview();
    const raw = { token: prepared.token, confirmed: true };
    const getter = vi.fn(() => true);
    if (shape === "accessor") Object.defineProperty(raw, "extra", { get: getter });
    else if (shape === "symbol") Object.assign(raw, { [Symbol("extra")]: true });
    else if (shape === "hidden") Object.defineProperty(raw, "extra", { value: true });
    else Object.setPrototypeOf(raw, { extra: true });
    expect((await tools.confirm(raw as ConfirmSyncWorkflowIntentInput)).ok).toBe(false);
    expect(getter).not.toHaveBeenCalled();
    expect((await confirm(prepared.token)).ok).toBe(false);
    expect(task().status).toBe("active");
  });

  it("rejects arbitrary confirmation fields and consumes that token", async () => {
    const prepared = await preview();
    const raw = { token: prepared.token, confirmed: true, status: "done" };
    expect((await tools.confirm(raw as ConfirmSyncWorkflowIntentInput)).ok).toBe(false);
    expect((await confirm(prepared.token)).ok).toBe(false);
    expect(task().status).toBe("active");
  });

  it("does not retain caller-mutable input or preview objects as authorization", async () => {
    const raw = input();
    const prepared = value(await tools.prepare(raw));
    Object.assign(raw, { externalId: "other", intent: "done" });
    Object.assign(prepared, { externalId: "other", projectId: "other" });
    expect(value(await confirm(prepared.token)).externalId).toBe("42");
  });

  it("waits for actual flush before returning a receipt", async () => {
    const prepared = await preview();
    let release: () => void = () => {
      throw new Error("flush not started");
    };
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    flush = vi.fn(async () => {
      await gate;
      await repo.flush();
    });
    let settled = false;
    const result = confirm(prepared.token).then((receipt) => {
      settled = true;
      return receipt;
    });
    await Promise.resolve();
    expect(task().status).toBe("canceled");
    expect(settled).toBe(false);
    release();
    expect(value(await result).status).toBe("canceled");
  });

  it("reports failed flush as an error and never permits replay; fresh no-op preview may recover", async () => {
    const prepared = await preview();
    flush = vi.fn(async () => {
      throw new Error("fixture disk failure");
    });
    expect(await confirm(prepared.token)).toMatchObject({
      ok: false,
      error: { type: "storage", message: expect.stringContaining("fixture disk failure") },
    });
    expect(task().status).toBe("canceled");
    expect((await confirm(prepared.token)).ok).toBe(false);
    flush = vi.fn(() => repo.flush());
    expect(value(await confirm((await preview()).token)).status).toBe("canceled");
  });

  it("already-canceled confirmation still flushes without inventing an edit clock", async () => {
    list.change((doc) => {
      doc.tasks[0].status = "canceled";
    });
    const beforeHeads = list.heads();
    const receipt = value(await confirm((await preview()).token));
    expect(receipt.updatedAt).toBe(originalClock);
    expect(list.heads()).toEqual(beforeHeads);
    expect(flush).toHaveBeenCalledOnce();
  });

  it.each([
    "reopen",
    "body",
    "identity",
    "clock",
    "mapping",
    "project",
    "reverted-reopen",
  ])("never certifies a cancellation superseded by a concurrent post-flush %s edit", async (edit) => {
    const prepared = await preview();
    flush = vi.fn(async () => {
      await repo.flush();
      if (edit === "body")
        detail.change((doc) => {
          doc.description = "Concurrent body";
        });
      else if (edit === "identity")
        list.change((doc) => {
          doc.tasks[0].externalId = "other";
        });
      else if (edit === "clock")
        list.change((doc) => {
          doc.tasks[0].updatedAt = originalClock;
        });
      else if (edit === "mapping")
        registry.change((doc) => {
          doc.bindings[0].options = {};
        });
      else if (edit === "project")
        catalog.change((doc) => {
          doc.projects[0].name = "Concurrent name";
        });
      else {
        list.change((doc) => {
          doc.tasks[0].status = "active";
        });
        if (edit === "reverted-reopen")
          list.change((doc) => {
            doc.tasks[0].status = "canceled";
          });
      }
    });
    expect((await confirm(prepared.token)).ok).toBe(false);
    expect((await confirm(prepared.token)).ok).toBe(false);
    expect(flush).toHaveBeenCalledOnce();
  });

  it("does not allow a second preview to overwrite a cancellation while its flush is pending", async () => {
    const first = await preview();
    const second = await preview();
    let release: () => void = () => {
      throw new Error("flush not started");
    };
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    flush = vi.fn(async () => {
      await gate;
      await repo.flush();
    });
    const firstResult = confirm(first.token);
    expect((await confirm(second.token)).ok).toBe(false);
    release();
    expect(value(await firstResult).status).toBe("canceled");
    expect(flush).toHaveBeenCalledOnce();
  });

  it("revalidates identity after a no-op cancellation's flush", async () => {
    list.change((doc) => {
      doc.tasks[0].status = "canceled";
    });
    const prepared = await preview();
    flush = async () => {
      await repo.flush();
      list.change((doc) => {
        doc.tasks[0].sourceUrl = "different-source";
      });
    };
    expect((await confirm(prepared.token)).ok).toBe(false);
  });

  it("fails closed when the host closes before confirmation or during flush", async () => {
    const prepared = await preview();
    closed = true;
    expect((await confirm(prepared.token)).ok).toBe(false);
    expect((await tools.prepare(input())).ok).toBe(false);
    closed = false;
    const fresh = await preview();
    flush = async () => {
      await repo.flush();
      closed = true;
    };
    expect((await confirm(fresh.token)).ok).toBe(false);
  });
});
