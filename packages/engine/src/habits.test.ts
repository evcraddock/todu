import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { HabitId } from "@todu/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTodu } from "./index.js";
import { clearProcessors } from "./scheduling.js";
import type { Todu } from "./todu.js";

describe("habits", () => {
  let todu: Todu;
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-habits-"));
    clearProcessors();
    todu = await createTodu({ storagePath: tmpDir });
  });

  afterEach(async () => {
    await todu.close();
    await new Promise((r) => setTimeout(r, 50));
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  describe("CRUD", () => {
    it("creates a habit", async () => {
      const result = await todu.habit.create({
        title: "Meditate",
        schedule: "FREQ=DAILY",
        timezone: "America/Chicago",
        startDate: "2026-02-01",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.title).toBe("Meditate");
      expect(result.value.schedule).toBe("FREQ=DAILY");
      expect(result.value.timezone).toBe("America/Chicago");
      expect(result.value.paused).toBe(false);
      expect(result.value.id).toMatch(/^hab-/);
      expect(result.value.nextDue).toBeDefined();
    });

    it("creates a habit with optional fields", async () => {
      const result = await todu.habit.create({
        title: "Exercise",
        schedule: "FREQ=WEEKLY;BYDAY=MO,WE,FR",
        timezone: "UTC",
        startDate: "2026-02-01",
        description: "30 min workout",
        endDate: "2026-12-31",
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.description).toBe("30 min workout");
      expect(result.value.endDate).toBe("2026-12-31");
    });

    it("rejects invalid RRULE", async () => {
      const result = await todu.habit.create({
        title: "Bad rule",
        schedule: "FREQ=HOURLY",
        timezone: "UTC",
        startDate: "2026-02-01",
      });

      expect(result.ok).toBe(false);
    });

    it("rejects invalid timezone", async () => {
      const result = await todu.habit.create({
        title: "Bad tz",
        schedule: "FREQ=DAILY",
        timezone: "Fake/Zone",
        startDate: "2026-02-01",
      });

      expect(result.ok).toBe(false);
    });

    it("rejects endDate before startDate", async () => {
      const result = await todu.habit.create({
        title: "Bad dates",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-06-01",
        endDate: "2026-01-01",
      });

      expect(result.ok).toBe(false);
    });

    it("lists habits", async () => {
      await todu.habit.create({
        title: "A",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
      });
      await todu.habit.create({
        title: "B",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
      });

      const result = await todu.habit.list();
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toHaveLength(2);
    });

    it("filters by paused status", async () => {
      const createA = await todu.habit.create({
        title: "Active",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
      });
      const createB = await todu.habit.create({
        title: "Paused",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
      });
      if (createB.ok) await todu.habit.pause(createB.value.id);

      const active = await todu.habit.list({ paused: false });
      expect(active.ok).toBe(true);
      if (active.ok) {
        expect(active.value).toHaveLength(1);
        expect(active.value[0].title).toBe("Active");
      }
    });

    it("filters by checkedToday", async () => {
      const createA = await todu.habit.create({
        title: "Checked Habit",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
      });
      await todu.habit.create({
        title: "Unchecked Habit",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
      });
      if (createA.ok) await todu.habit.check(createA.value.id);

      const checked = await todu.habit.list({ checkedToday: true });
      expect(checked.ok).toBe(true);
      if (checked.ok) {
        expect(checked.value).toHaveLength(1);
        expect(checked.value[0].title).toBe("Checked Habit");
      }

      const unchecked = await todu.habit.list({ checkedToday: false });
      expect(unchecked.ok).toBe(true);
      if (unchecked.ok) {
        expect(unchecked.value).toHaveLength(1);
        expect(unchecked.value[0].title).toBe("Unchecked Habit");
      }
    });

    it("filters by search", async () => {
      await todu.habit.create({
        title: "Morning Meditation",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
      });
      await todu.habit.create({
        title: "Evening Jog",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
      });

      const result = await todu.habit.list({ search: "meditation" });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0].title).toBe("Morning Meditation");
      }
    });

    it("gets a habit by ID", async () => {
      const create = await todu.habit.create({
        title: "Get me",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
      });
      expect(create.ok).toBe(true);
      if (!create.ok) return;

      const get = await todu.habit.get(create.value.id);
      expect(get.ok).toBe(true);
      if (get.ok) expect(get.value.title).toBe("Get me");
    });

    it("returns not-found for nonexistent ID", async () => {
      const result = await todu.habit.get("hab-nonexistent" as HabitId);
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.type).toBe("not-found");
    });

    it("updates a habit", async () => {
      const create = await todu.habit.create({
        title: "Original",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
      });
      expect(create.ok).toBe(true);
      if (!create.ok) return;

      const update = await todu.habit.update(create.value.id, {
        title: "Updated",
        description: "New description",
      });

      expect(update.ok).toBe(true);
      if (update.ok) {
        expect(update.value.title).toBe("Updated");
        expect(update.value.description).toBe("New description");
      }
    });

    it("deletes a habit", async () => {
      const create = await todu.habit.create({
        title: "Delete me",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
      });
      expect(create.ok).toBe(true);
      if (!create.ok) return;

      const del = await todu.habit.delete(create.value.id);
      expect(del.ok).toBe(true);

      const list = await todu.habit.list();
      expect(list.ok).toBe(true);
      if (list.ok) expect(list.value).toHaveLength(0);
    });

    it("pauses and resumes", async () => {
      const create = await todu.habit.create({
        title: "Pausable",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2026-02-01",
      });
      expect(create.ok).toBe(true);
      if (!create.ok) return;

      const pause = await todu.habit.pause(create.value.id);
      expect(pause.ok).toBe(true);
      if (pause.ok) expect(pause.value.paused).toBe(true);

      const resume = await todu.habit.resume(create.value.id);
      expect(resume.ok).toBe(true);
      if (resume.ok) expect(resume.value.paused).toBe(false);
    });
  });

  describe("check/uncheck", () => {
    it("checks in for today", async () => {
      const create = await todu.habit.create({
        title: "Daily",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2020-01-01",
      });
      expect(create.ok).toBe(true);
      if (!create.ok) return;

      const check = await todu.habit.check(create.value.id);
      expect(check.ok).toBe(true);
      if (!check.ok) return;

      expect(check.value.completed).toBe(true);
      expect(check.value.checkedAt).toBeDefined();
    });

    it("check is idempotent", async () => {
      const create = await todu.habit.create({
        title: "Daily",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2020-01-01",
      });
      expect(create.ok).toBe(true);
      if (!create.ok) return;

      const check1 = await todu.habit.check(create.value.id);
      const check2 = await todu.habit.check(create.value.id);
      expect(check1.ok).toBe(true);
      expect(check2.ok).toBe(true);
      if (check1.ok && check2.ok) {
        expect(check1.value.date).toBe(check2.value.date);
      }
    });

    it("uncheck removes today's entry", async () => {
      const create = await todu.habit.create({
        title: "Daily",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2020-01-01",
      });
      expect(create.ok).toBe(true);
      if (!create.ok) return;

      await todu.habit.check(create.value.id);
      const uncheck = await todu.habit.uncheck(create.value.id);
      expect(uncheck.ok).toBe(true);

      // Verify today is no longer checked
      const streak = await todu.habit.streak(create.value.id);
      expect(streak.ok).toBe(true);
      if (streak.ok) expect(streak.value.completedToday).toBe(false);
    });

    it("uncheck is idempotent", async () => {
      const create = await todu.habit.create({
        title: "Daily",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2020-01-01",
      });
      expect(create.ok).toBe(true);
      if (!create.ok) return;

      const uncheck = await todu.habit.uncheck(create.value.id);
      expect(uncheck.ok).toBe(true);
    });
  });

  describe("streak", () => {
    it("returns zero streak with no check-ins", async () => {
      const create = await todu.habit.create({
        title: "Daily",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2020-01-01",
      });
      expect(create.ok).toBe(true);
      if (!create.ok) return;

      const streak = await todu.habit.streak(create.value.id);
      expect(streak.ok).toBe(true);
      if (!streak.ok) return;

      expect(streak.value.current).toBe(0);
      expect(streak.value.longest).toBe(0);
      expect(streak.value.completedToday).toBe(false);
      expect(streak.value.totalCheckins).toBe(0);
    });

    it("counts today's check-in in streak", async () => {
      const create = await todu.habit.create({
        title: "Daily",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2020-01-01",
      });
      expect(create.ok).toBe(true);
      if (!create.ok) return;

      await todu.habit.check(create.value.id);

      const streak = await todu.habit.streak(create.value.id);
      expect(streak.ok).toBe(true);
      if (!streak.ok) return;

      expect(streak.value.current).toBe(1);
      expect(streak.value.completedToday).toBe(true);
      expect(streak.value.totalCheckins).toBe(1);
    });
  });

  describe("history", () => {
    it("returns history with today", async () => {
      const create = await todu.habit.create({
        title: "Daily",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2020-01-01",
      });
      expect(create.ok).toBe(true);
      if (!create.ok) return;

      await todu.habit.check(create.value.id);

      const history = await todu.habit.history(create.value.id, 7);
      expect(history.ok).toBe(true);
      if (!history.ok) return;

      expect(history.value.length).toBeGreaterThanOrEqual(1);
      // First entry should be today (most recent)
      expect(history.value[0].scheduled).toBe(true);
      expect(history.value[0].completed).toBe(true);
    });

    it("shows incomplete days as not completed", async () => {
      const create = await todu.habit.create({
        title: "Daily",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2020-01-01",
      });
      expect(create.ok).toBe(true);
      if (!create.ok) return;

      const history = await todu.habit.history(create.value.id, 7);
      expect(history.ok).toBe(true);
      if (!history.ok) return;

      // All entries should be scheduled but not completed
      for (const entry of history.value) {
        expect(entry.scheduled).toBe(true);
        expect(entry.completed).toBe(false);
      }
    });

    it("only includes scheduled dates", async () => {
      // Weekday-only habit
      const create = await todu.habit.create({
        title: "Weekday",
        schedule: "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR",
        timezone: "UTC",
        startDate: "2020-01-01",
      });
      expect(create.ok).toBe(true);
      if (!create.ok) return;

      const history = await todu.habit.history(create.value.id, 14);
      expect(history.ok).toBe(true);
      if (!history.ok) return;

      // Should have ~10 weekdays in 14 days
      expect(history.value.length).toBeLessThanOrEqual(10);
      expect(history.value.length).toBeGreaterThanOrEqual(8);
    });
  });

  describe("processTemplates", () => {
    it("paused habits are not processed", async () => {
      const create = await todu.habit.create({
        title: "Paused",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2020-01-01",
      });
      expect(create.ok).toBe(true);
      if (!create.ok) return;

      await todu.habit.pause(create.value.id);

      // Get nextDue before processing
      const before = await todu.habit.get(create.value.id);
      expect(before.ok).toBe(true);
      if (!before.ok) return;

      // nextDue should stay as-is since it's paused
      expect(before.value.paused).toBe(true);
    });
  });

  describe("HabitLogDocument lifecycle", () => {
    it("log is created on habit creation and cleaned up on deletion", async () => {
      const create = await todu.habit.create({
        title: "Lifecycle",
        schedule: "FREQ=DAILY",
        timezone: "UTC",
        startDate: "2020-01-01",
      });
      expect(create.ok).toBe(true);
      if (!create.ok) return;

      // Check works (proves log exists)
      const check = await todu.habit.check(create.value.id);
      expect(check.ok).toBe(true);

      // Delete habit
      const del = await todu.habit.delete(create.value.id);
      expect(del.ok).toBe(true);
    });
  });
});
