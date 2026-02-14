import type { Task } from "@todu/core/browser";
import { describe, expect, it } from "vitest";
import { defaultTaskComparator } from "./task-sort.js";

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task-1" as Task["id"],
    title: "Test task",
    status: "active",
    priority: "medium",
    projectId: "proj-1" as Task["projectId"],
    labels: [],
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
    ...overrides,
  } as Task;
}

describe("defaultTaskComparator", () => {
  describe("due date ordering", () => {
    it("sorts earlier due dates first", () => {
      const a = makeTask({ dueDate: "2025-02-10" });
      const b = makeTask({ dueDate: "2025-02-15" });
      expect(defaultTaskComparator(a, b)).toBeLessThan(0);
    });

    it("sorts tasks with due dates before tasks without", () => {
      const a = makeTask({ dueDate: "2025-02-10" });
      const b = makeTask({});
      expect(defaultTaskComparator(a, b)).toBeLessThan(0);
    });

    it("sorts tasks without due dates last", () => {
      const a = makeTask({});
      const b = makeTask({ dueDate: "2025-02-10" });
      expect(defaultTaskComparator(a, b)).toBeGreaterThan(0);
    });

    it("falls back to scheduledDate when no dueDate", () => {
      const a = makeTask({ scheduledDate: "2025-02-10" });
      const b = makeTask({ scheduledDate: "2025-02-15" });
      expect(defaultTaskComparator(a, b)).toBeLessThan(0);
    });

    it("prefers dueDate over scheduledDate", () => {
      const a = makeTask({ dueDate: "2025-02-20", scheduledDate: "2025-02-05" });
      const b = makeTask({ scheduledDate: "2025-02-10" });
      // a's effective date is 2025-02-20 (dueDate), b's is 2025-02-10
      expect(defaultTaskComparator(a, b)).toBeGreaterThan(0);
    });
  });

  describe("status ordering", () => {
    it("sorts inprogress before active when dates are equal", () => {
      const a = makeTask({ status: "inprogress", dueDate: "2025-02-10" });
      const b = makeTask({ status: "active", dueDate: "2025-02-10" });
      expect(defaultTaskComparator(a, b)).toBeLessThan(0);
    });

    it("sorts waiting before active", () => {
      const a = makeTask({ status: "waiting" });
      const b = makeTask({ status: "active" });
      expect(defaultTaskComparator(a, b)).toBeLessThan(0);
    });

    it("sorts active before done", () => {
      const a = makeTask({ status: "active" });
      const b = makeTask({ status: "done" });
      expect(defaultTaskComparator(a, b)).toBeLessThan(0);
    });

    it("sorts done before canceled", () => {
      const a = makeTask({ status: "done" });
      const b = makeTask({ status: "canceled" });
      expect(defaultTaskComparator(a, b)).toBeLessThan(0);
    });
  });

  describe("priority ordering", () => {
    it("sorts high before medium when date and status are equal", () => {
      const a = makeTask({ priority: "high" });
      const b = makeTask({ priority: "medium" });
      expect(defaultTaskComparator(a, b)).toBeLessThan(0);
    });

    it("sorts medium before low", () => {
      const a = makeTask({ priority: "medium" });
      const b = makeTask({ priority: "low" });
      expect(defaultTaskComparator(a, b)).toBeLessThan(0);
    });
  });

  describe("combined ordering", () => {
    it("date takes precedence over status", () => {
      const a = makeTask({ status: "active", dueDate: "2025-02-10" });
      const b = makeTask({ status: "inprogress", dueDate: "2025-02-15" });
      expect(defaultTaskComparator(a, b)).toBeLessThan(0);
    });

    it("status takes precedence over priority when dates are equal", () => {
      const a = makeTask({ status: "inprogress", priority: "low", dueDate: "2025-02-10" });
      const b = makeTask({ status: "active", priority: "high", dueDate: "2025-02-10" });
      expect(defaultTaskComparator(a, b)).toBeLessThan(0);
    });

    it("sorts a realistic task list correctly", () => {
      const tasks = [
        makeTask({ id: "t1" as Task["id"], status: "active", priority: "low" }),
        makeTask({
          id: "t2" as Task["id"],
          status: "inprogress",
          priority: "high",
          dueDate: "2025-02-12",
        }),
        makeTask({
          id: "t3" as Task["id"],
          status: "active",
          priority: "high",
          dueDate: "2025-02-10",
        }),
        makeTask({
          id: "t4" as Task["id"],
          status: "done",
          priority: "medium",
          dueDate: "2025-02-08",
        }),
        makeTask({ id: "t5" as Task["id"], status: "active", priority: "high" }),
      ];

      const sorted = [...tasks].sort(defaultTaskComparator);
      const ids = sorted.map((t) => t.id);

      // t4 (due 02-08, done) → t3 (due 02-10, active, high) → t2 (due 02-12, inprogress, high)
      // → t5 (no date, active, high) → t1 (no date, active, low)
      expect(ids).toEqual(["t4", "t3", "t2", "t5", "t1"]);
    });
  });

  it("returns 0 for identical tasks", () => {
    const a = makeTask();
    expect(defaultTaskComparator(a, a)).toBe(0);
  });
});
