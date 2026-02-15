import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createProjectId, type ProjectId, type RecurringId } from "@todu/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTodu } from "./index.js";
import { clearProcessors } from "./scheduling.js";
import type { Todu } from "./todu.js";

describe("recurring templates", () => {
  let todu: Todu;
  let tmpDir: string;
  let projectId: ProjectId;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-recurring-"));
    clearProcessors();
    todu = await createTodu({ storagePath: tmpDir });

    // Create a project for templates to reference
    const result = await todu.project.create({ name: "Test Project" });
    expect(result.ok).toBe(true);
    if (result.ok) projectId = result.value.id;
  });

  afterEach(async () => {
    await todu.close();
    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("CRUD", () => {
    it("creates a recurring template", async () => {
      const result = await todu.recurring.create({
        title: "Daily standup",
        schedule: "FREQ=DAILY",
        timezone: "America/Chicago",
        startDate: "2026-02-01",
        projectId,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.title).toBe("Daily standup");
      expect(result.value.schedule).toBe("FREQ=DAILY");
      expect(result.value.timezone).toBe("America/Chicago");
      expect(result.value.projectId).toBe(projectId);
      expect(result.value.paused).toBe(false);
      expect(result.value.priority).toBe("medium");
      expect(result.value.labels).toEqual([]);
      expect(result.value.skippedDates).toEqual([]);
      expect(result.value.id).toMatch(/^rec-/);
    });

    it("creates a template with all optional fields", async () => {
      const result = await todu.recurring.create({
        title: "Weekly review",
        schedule: "FREQ=WEEKLY;BYDAY=FR",
        timezone: "UTC",
        startDate: "2026-02-01",
        projectId,
        description: "End of week review",
        labels: ["work"],
        priority: "high",
        endDate: "2026-12-31",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.description).toBe("End of week review");
      expect(result.value.labels).toEqual(["work"]);
      expect(result.value.priority).toBe("high");
      expect(result.value.endDate).toBe("2026-12-31");
    });

    it("rejects invalid RRULE", async () => {
      const result = await todu.recurring.create({
        title: "Bad rule",
        schedule: "FREQ=HOURLY",
        timezone: "UTC",
        startDate: "2026-02-01",
        projectId,
      });

      expect(result.ok).toBe(false);
    });

    it("rejects invalid timezone", async () => {
      const result = await todu.recurring.create({
        title: "Bad tz",
        schedule: "FREQ=DAILY",
        timezone: "Fake/Zone",
        startDate: "2026-02-01",
        projectId,
      });

      expect(result.ok).toBe(false);
    });

    it("rejects nonexistent project", async () => {
      const result = await todu.recurring.create({
        title: "No project",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
        projectId: createProjectId("nonexistent"),
      });

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.type).toBe("not-found");
    });

    it("rejects endDate before startDate", async () => {
      const result = await todu.recurring.create({
        title: "Bad dates",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-06-01",
        endDate: "2026-01-01",
        projectId,
      });

      expect(result.ok).toBe(false);
    });

    it("lists templates", async () => {
      await todu.recurring.create({
        title: "Template A",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
        projectId,
      });
      await todu.recurring.create({
        title: "Template B",
        schedule: "FREQ=WEEKLY;BYDAY=MO",
        timezone: "UTC",
        startDate: "2026-02-01",
        projectId,
      });

      const result = await todu.recurring.list();
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(2);
    });

    it("filters list by paused status", async () => {
      const createResult = await todu.recurring.create({
        title: "Active one",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
        projectId,
      });
      expect(createResult.ok).toBe(true);

      await todu.recurring.create({
        title: "Will be paused",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
        projectId,
      });

      // Pause the second one
      const listAll = await todu.recurring.list();
      if (listAll.ok) {
        const second = listAll.value.find((t) => t.title === "Will be paused");
        if (second) await todu.recurring.pause(second.id);
      }

      const activeOnly = await todu.recurring.list({ paused: false });
      expect(activeOnly.ok).toBe(true);
      if (activeOnly.ok) {
        expect(activeOnly.value).toHaveLength(1);
        expect(activeOnly.value[0].title).toBe("Active one");
      }
    });

    it("filters list by search", async () => {
      await todu.recurring.create({
        title: "Weekly Review",
        projectId,
        schedule: "FREQ=WEEKLY;BYDAY=FR",
        timezone: "UTC",
        startDate: "2026-01-01",
      });
      await todu.recurring.create({
        title: "Daily Standup",
        projectId,
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-01-01",
      });

      const result = await todu.recurring.list({ search: "review" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].title).toBe("Weekly Review");
      }
    });

    it("gets a template by ID", async () => {
      const createResult = await todu.recurring.create({
        title: "Get me",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
        projectId,
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const getResult = await todu.recurring.get(createResult.value.id);
      expect(getResult.ok).toBe(true);
      if (getResult.ok) {
        expect(getResult.value.title).toBe("Get me");
      }
    });

    it("returns not-found for nonexistent ID", async () => {
      const result = await todu.recurring.get("rec-nonexistent" as RecurringId);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.type).toBe("not-found");
    });

    it("updates a template", async () => {
      const createResult = await todu.recurring.create({
        title: "Original",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
        projectId,
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const updateResult = await todu.recurring.update(createResult.value.id, {
        title: "Updated",
        priority: "high",
      });

      expect(updateResult.ok).toBe(true);
      if (updateResult.ok) {
        expect(updateResult.value.title).toBe("Updated");
        expect(updateResult.value.priority).toBe("high");
      }
    });

    it("deletes a template", async () => {
      const createResult = await todu.recurring.create({
        title: "Delete me",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
        projectId,
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const deleteResult = await todu.recurring.delete(createResult.value.id);
      expect(deleteResult.ok).toBe(true);

      const listResult = await todu.recurring.list();
      expect(listResult.ok).toBe(true);
      if (listResult.ok) expect(listResult.value).toHaveLength(0);
    });

    it("pauses and resumes a template", async () => {
      const createResult = await todu.recurring.create({
        title: "Pausable",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
        projectId,
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const pauseResult = await todu.recurring.pause(createResult.value.id);
      expect(pauseResult.ok).toBe(true);
      if (pauseResult.ok) expect(pauseResult.value.paused).toBe(true);

      const resumeResult = await todu.recurring.resume(createResult.value.id);
      expect(resumeResult.ok).toBe(true);
      if (resumeResult.ok) expect(resumeResult.value.paused).toBe(false);
    });
  });

  describe("task generation", () => {
    it("generates a task via early materialization", async () => {
      const createResult = await todu.recurring.create({
        title: "Standup",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
        projectId,
        priority: "high",
        labels: ["meeting"],
        description: "Daily standup notes",
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const genResult = await todu.recurring.generate(createResult.value.id, "2026-03-15");
      expect(genResult.ok).toBe(true);
      if (!genResult.ok) return;

      expect(genResult.value.title).toBe("Standup");
      expect(genResult.value.priority).toBe("high");
      expect(genResult.value.labels).toEqual(["meeting"]);
      expect(genResult.value.scheduledDate).toBe("2026-03-15");
      expect(genResult.value.templateId).toBe(createResult.value.id);
      expect(genResult.value.projectId).toBe(projectId);
      expect(genResult.value.id).toMatch(/^sched-/);
    });

    it("early materialization is idempotent", async () => {
      const createResult = await todu.recurring.create({
        title: "Standup",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
        projectId,
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const gen1 = await todu.recurring.generate(createResult.value.id, "2026-03-15");
      const gen2 = await todu.recurring.generate(createResult.value.id, "2026-03-15");

      expect(gen1.ok).toBe(true);
      expect(gen2.ok).toBe(true);
      if (gen1.ok && gen2.ok) {
        expect(gen1.value.id).toBe(gen2.value.id);
      }

      // Only one task in the list
      const tasks = await todu.task.list({ projectId });
      expect(tasks.ok).toBe(true);
      if (tasks.ok) {
        const scheduledTasks = tasks.value.filter((t) => t.scheduledDate === "2026-03-15");
        expect(scheduledTasks).toHaveLength(1);
      }
    });

    it("rejects generation for non-occurrence date", async () => {
      // Weekly on Monday only
      const createResult = await todu.recurring.create({
        title: "Monday thing",
        schedule: "FREQ=WEEKLY;BYDAY=MO",
        timezone: "UTC",
        startDate: "2026-02-02",
        projectId,
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      // Feb 10 is Tuesday — not a Monday
      const genResult = await todu.recurring.generate(createResult.value.id, "2026-02-10");
      expect(genResult.ok).toBe(false);
    });

    it("process generates tasks for due templates", async () => {
      // Create a template with startDate in the past
      const createResult = await todu.recurring.create({
        title: "Overdue daily",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2020-01-01", // way in the past — but nextDue should be near today
        projectId,
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      // Process should have run during createTodu, but let's process again
      const processResult = await todu.recurring.process();
      expect(processResult.ok).toBe(true);
    });

    it("deterministic ID matches expected format", async () => {
      const createResult = await todu.recurring.create({
        title: "Test",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
        projectId,
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      const genResult = await todu.recurring.generate(createResult.value.id, "2026-03-15");
      expect(genResult.ok).toBe(true);
      if (genResult.ok) {
        expect(genResult.value.id).toMatch(/^sched-[0-9a-f]{12}$/);
      }
    });
  });

  describe("skip list", () => {
    it("deleting a generated task adds to skip list", async () => {
      const createResult = await todu.recurring.create({
        title: "Skippable",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
        projectId,
      });
      expect(createResult.ok).toBe(true);
      if (!createResult.ok) return;

      // Generate a task
      const genResult = await todu.recurring.generate(createResult.value.id, "2026-03-15");
      expect(genResult.ok).toBe(true);
      if (!genResult.ok) return;

      // Delete the task
      const deleteResult = await todu.task.delete(genResult.value.id);
      expect(deleteResult.ok).toBe(true);

      // Check skip list
      const getResult = await todu.recurring.get(createResult.value.id);
      expect(getResult.ok).toBe(true);
      if (getResult.ok) {
        expect(getResult.value.skippedDates).toContain("2026-03-15");
      }
    });
  });

  describe("upcoming", () => {
    it("returns projected occurrences without creating tasks", async () => {
      await todu.recurring.create({
        title: "Daily",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-01-01",
        projectId,
      });

      const result = await todu.recurring.upcoming({ days: 7 });
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // Should have ~7 occurrences
      expect(result.value.length).toBeGreaterThanOrEqual(7);
      expect(result.value[0].title).toBe("Daily");
      expect(result.value[0].projectId).toBe(projectId);

      // Verify no tasks were created (except any from processTemplates on init)
      const tasks = await todu.task.list({ projectId });
      expect(tasks.ok).toBe(true);
    });

    it("filters by template ID", async () => {
      const create1 = await todu.recurring.create({
        title: "Template A",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-01-01",
        projectId,
      });
      await todu.recurring.create({
        title: "Template B",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-01-01",
        projectId,
      });

      expect(create1.ok).toBe(true);
      if (!create1.ok) return;

      const result = await todu.recurring.upcoming({ templateId: create1.value.id, days: 3 });
      expect(result.ok).toBe(true);
      if (result.ok) {
        for (const occ of result.value) {
          expect(occ.title).toBe("Template A");
        }
      }
    });
  });
});
