import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createActorId, createIntegrationBindingId } from "@todu/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Todu } from "./index.js";
import { createTodu } from "./index.js";

describe("actor namespace", () => {
  let tmpDir: string;
  let todu: Todu;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-actor-test-"));
    todu = await createTodu({ storagePath: tmpDir });
  });

  afterEach(async () => {
    await todu.close();
    await new Promise((resolve) => setTimeout(resolve, 50));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("lists the default owner actor", async () => {
    const result = await todu.actor.list();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toEqual([{ id: "actor-user", displayName: "user" }]);
  });

  it("shows the default owner actor", async () => {
    const result = await todu.actor.getOwner();
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toEqual({ id: "actor-user", displayName: "user" });
  });

  it("creates an actor with normalized display name", async () => {
    const result = await todu.actor.create({
      id: createActorId("actor-reviewer"),
      displayName: "  Reviewer  ",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toEqual({
      id: "actor-reviewer",
      displayName: "Reviewer",
    });

    const listed = await todu.actor.list();
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    expect(listed.value).toContainEqual({
      id: "actor-reviewer",
      displayName: "Reviewer",
    });
  });

  it("rejects duplicate actor ids", async () => {
    await todu.actor.create({
      id: createActorId("actor-reviewer"),
      displayName: "Reviewer",
    });

    const result = await todu.actor.create({
      id: createActorId("actor-reviewer"),
      displayName: "Duplicate Reviewer",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.type).toBe("validation");
    expect(result.error.field).toBe("id");
    expect(result.error.message).toContain("already exists");
  });

  it("renames an existing actor without changing its id", async () => {
    await todu.actor.create({
      id: createActorId("actor-reviewer"),
      displayName: "Reviewer",
    });

    const result = await todu.actor.rename(createActorId("actor-reviewer"), "  Lead Reviewer  ");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.value).toEqual({
      id: "actor-reviewer",
      displayName: "Lead Reviewer",
    });
  });

  it("sets owner actor without rewriting existing project authorization and updates future defaults", async () => {
    await todu.actor.create({
      id: createActorId("actor-reviewer"),
      displayName: "Reviewer",
    });

    const existingProject = await todu.project.create({ name: "Existing project" });
    if (!existingProject.ok) throw new Error("existing project create failed");

    const owner = await todu.actor.setOwner(createActorId("actor-reviewer"));
    expect(owner.ok).toBe(true);
    if (!owner.ok) return;
    expect(owner.value).toEqual({
      id: "actor-reviewer",
      displayName: "Reviewer",
    });

    const ownerShow = await todu.actor.getOwner();
    expect(ownerShow.ok).toBe(true);
    if (!ownerShow.ok) return;
    expect(ownerShow.value.id).toBe("actor-reviewer");

    const existingProjectAfter = await todu.project.get(existingProject.value.id);
    expect(existingProjectAfter.ok).toBe(true);
    if (!existingProjectAfter.ok) return;
    expect(existingProjectAfter.value.authorizedAssigneeActorIds).toEqual(["actor-user"]);

    const futureProject = await todu.project.create({ name: "Future project" });
    expect(futureProject.ok).toBe(true);
    if (!futureProject.ok) return;
    expect(futureProject.value.authorizedAssigneeActorIds).toEqual(["actor-reviewer"]);
  });

  it("updates owner-based note and approval fallbacks after owner change", async () => {
    await todu.actor.create({
      id: createActorId("actor-reviewer"),
      displayName: "Reviewer",
    });

    const owner = await todu.actor.setOwner(createActorId("actor-reviewer"));
    if (!owner.ok) throw new Error("owner set failed");

    const project = await todu.project.create({
      name: "Approvals",
      authorizedAssigneeActorIds: [createActorId("actor-reviewer")],
    });
    if (!project.ok) throw new Error("project create failed");

    const note = await todu.note.create({ content: "Owner fallback note" });
    expect(note.ok).toBe(true);
    if (!note.ok) return;
    expect(note.value.authorActorId).toBe("actor-reviewer");

    const task = await todu.task.create({
      title: "Imported task",
      projectId: project.value.id,
      description: "Imported description",
      descriptionApproval: {
        state: "pendingApproval",
        sourceBindingId: createIntegrationBindingId("ibind-owner-fallback"),
        sourceActorId: createActorId("actor-reviewer"),
      },
    });
    if (!task.ok) throw new Error("task create failed");

    const approval = await todu.approval.approveTaskDescription(task.value.id);
    expect(approval.ok).toBe(true);
    if (!approval.ok) return;
    expect(approval.value.reviewedByActorId).toBe("actor-reviewer");
  });

  it("archives and unarchives actors", async () => {
    await todu.actor.create({
      id: createActorId("actor-reviewer"),
      displayName: "Reviewer",
    });

    const archived = await todu.actor.archive(createActorId("actor-reviewer"));
    expect(archived.ok).toBe(true);
    if (!archived.ok) return;
    expect(archived.value).toEqual({
      id: "actor-reviewer",
      displayName: "Reviewer",
      archived: true,
    });

    const unarchived = await todu.actor.unarchive(createActorId("actor-reviewer"));
    expect(unarchived.ok).toBe(true);
    if (!unarchived.ok) return;
    expect(unarchived.value).toEqual({
      id: "actor-reviewer",
      displayName: "Reviewer",
    });
  });

  it("rejects archived or missing owner transitions", async () => {
    await todu.actor.create({
      id: createActorId("actor-reviewer"),
      displayName: "Reviewer",
    });

    const archived = await todu.actor.archive(createActorId("actor-reviewer"));
    if (!archived.ok) throw new Error("archive failed");

    const archivedOwner = await todu.actor.setOwner(createActorId("actor-reviewer"));
    expect(archivedOwner.ok).toBe(false);
    if (archivedOwner.ok) return;
    expect(archivedOwner.error.type).toBe("validation");
    expect(archivedOwner.error.field).toBe("actorId");

    const missingOwner = await todu.actor.setOwner(createActorId("actor-missing"));
    expect(missingOwner.ok).toBe(false);
    if (missingOwner.ok) return;
    expect(missingOwner.error.type).toBe("not-found");
    expect(missingOwner.error.entity).toBe("actor");
    expect(missingOwner.error.id).toBe("actor-missing");
  });

  it("rejects archiving the current owner actor", async () => {
    const result = await todu.actor.archive(createActorId("actor-user"));
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.type).toBe("validation");
    expect(result.error.field).toBe("id");
    expect(result.error.message).toContain("Owner actor cannot be archived");
  });

  it("returns not-found for unknown actor ids on mutation", async () => {
    const result = await todu.actor.archive(createActorId("actor-missing"));
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.type).toBe("not-found");
    expect(result.error.entity).toBe("actor");
    expect(result.error.id).toBe("actor-missing");
  });

  it("rejects blank actor display names", async () => {
    const result = await todu.actor.create({
      id: createActorId("actor-reviewer"),
      displayName: "   ",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.error.type).toBe("validation");
    expect(result.error.field).toBe("displayName");
  });
});
