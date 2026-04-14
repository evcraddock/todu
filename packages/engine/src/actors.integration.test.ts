import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createActorId } from "@todu/core";
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
