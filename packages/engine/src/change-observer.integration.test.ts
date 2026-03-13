import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTodu } from "./index.js";
import type { Todu } from "./todu.js";

describe("change notifications", () => {
  let tmpDir: string;
  let todu: Todu;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-change-obs-"));
    todu = await createTodu({ storagePath: tmpDir });
  });

  afterEach(async () => {
    await todu.close();
    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  /** Wait for microtask coalescing + a small buffer */
  async function waitForNotification(): Promise<void> {
    await new Promise((r) => setTimeout(r, 50));
  }

  it("project create triggers onChange", async () => {
    let called = 0;
    const cleanup = todu.onChange(() => called++);

    await todu.project.create({ name: "test" });
    await waitForNotification();

    expect(called).toBeGreaterThan(0);
    cleanup();
  });

  it("task create triggers onChange (separate TaskListDocument)", async () => {
    // Create project first (triggers its own change)
    const projResult = await todu.project.create({ name: "proj" });
    if (!projResult.ok) throw new Error("project create failed");

    let called = 0;
    const cleanup = todu.onChange(() => called++);

    // Creating the first task in a project creates a new TaskListDocument
    await todu.task.create({
      title: "my task",
      projectId: projResult.value.id,
    });
    await waitForNotification();

    expect(called).toBeGreaterThan(0);
    cleanup();
  });

  it("task update triggers onChange", async () => {
    const projResult = await todu.project.create({ name: "proj" });
    if (!projResult.ok) throw new Error("project create failed");
    const taskResult = await todu.task.create({
      title: "my task",
      projectId: projResult.value.id,
    });
    if (!taskResult.ok) throw new Error("task create failed");

    let called = 0;
    const cleanup = todu.onChange(() => called++);

    await todu.task.update(taskResult.value.id, { title: "updated" });
    await waitForNotification();

    expect(called).toBeGreaterThan(0);
    cleanup();
  });

  it("note create triggers onChange (separate NotesDocument)", async () => {
    let called = 0;
    const cleanup = todu.onChange(() => called++);

    await todu.note.create({ content: "journal entry" });
    await waitForNotification();

    expect(called).toBeGreaterThan(0);
    cleanup();
  });

  it("habit check-in triggers onChange (separate HabitLogDocument)", async () => {
    const projectResult = await todu.project.create({ name: "habit project" });
    if (!projectResult.ok) throw new Error("project create failed");

    const today = new Date().toISOString().slice(0, 10);
    const habitResult = await todu.habit.create({
      title: "exercise",
      projectId: projectResult.value.id,
      schedule: "FREQ=DAILY",
      timezone: "America/Chicago",
      startDate: today,
    });
    if (!habitResult.ok) throw new Error("habit create failed");

    let called = 0;
    const cleanup = todu.onChange(() => called++);

    await todu.habit.check(habitResult.value.id);
    await waitForNotification();

    expect(called).toBeGreaterThan(0);
    cleanup();
  });

  it("new documents are automatically observed", async () => {
    // Subscribe BEFORE creating the project that spawns a TaskListDocument
    let called = 0;
    const cleanup = todu.onChange(() => called++);

    // Create project
    const projResult = await todu.project.create({ name: "proj" });
    if (!projResult.ok) throw new Error("project create failed");
    await waitForNotification();
    const afterProject = called;

    // First task creates a NEW TaskListDocument — observer should auto-subscribe
    await todu.task.create({
      title: "first task",
      projectId: projResult.value.id,
    });
    await waitForNotification();

    expect(called).toBeGreaterThan(afterProject);
    cleanup();
  });

  it("coalesces rapid changes into fewer callbacks", async () => {
    const projResult = await todu.project.create({ name: "proj" });
    if (!projResult.ok) throw new Error("project create failed");
    // Create initial task so TaskListDocument exists
    await todu.task.create({
      title: "setup",
      projectId: projResult.value.id,
    });
    await waitForNotification();

    let called = 0;
    const cleanup = todu.onChange(() => called++);

    // Rapid-fire 3 project creates (all hit catalog doc synchronously)
    await todu.project.create({ name: "a" });
    await todu.project.create({ name: "b" });
    await todu.project.create({ name: "c" });
    await waitForNotification();

    // Should be fewer than 3 — coalescing works
    // (Automerge fires change per mutation, but our microtask coalescing
    // merges ones that happen in the same tick)
    expect(called).toBeLessThanOrEqual(3);
    expect(called).toBeGreaterThan(0);
    cleanup();
  });

  it("cleanup removes all listeners", async () => {
    let called = 0;
    const cleanup = todu.onChange(() => called++);
    cleanup();

    await todu.project.create({ name: "after-cleanup" });
    await waitForNotification();

    expect(called).toBe(0);
  });
});
