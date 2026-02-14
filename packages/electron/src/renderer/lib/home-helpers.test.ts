import type { Task } from "@todu/core/browser";
import { describe, expect, it } from "vitest";
import {
  addDays,
  buildDashboardSections,
  formatDueLabel,
  isDueToday,
  isOverdue,
} from "./home-helpers.js";

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

describe("addDays", () => {
  it("adds days to a date string", () => {
    expect(addDays("2025-02-10", 3)).toBe("2025-02-13");
  });

  it("handles month boundary", () => {
    expect(addDays("2025-01-30", 3)).toBe("2025-02-02");
  });
});

describe("isOverdue", () => {
  const today = "2025-02-13";

  it("returns false when no dueDate", () => {
    expect(isOverdue(makeTask(), today)).toBe(false);
  });

  it("returns true when dueDate is before today", () => {
    expect(isOverdue(makeTask({ dueDate: "2025-02-12" }), today)).toBe(true);
  });

  it("returns false when dueDate is today", () => {
    expect(isOverdue(makeTask({ dueDate: "2025-02-13" }), today)).toBe(false);
  });

  it("returns false when dueDate is in the future", () => {
    expect(isOverdue(makeTask({ dueDate: "2025-02-15" }), today)).toBe(false);
  });
});

describe("isDueToday", () => {
  const today = "2025-02-13";

  it("returns false when no dueDate", () => {
    expect(isDueToday(makeTask(), today)).toBe(false);
  });

  it("returns true when dueDate is today", () => {
    expect(isDueToday(makeTask({ dueDate: "2025-02-13" }), today)).toBe(true);
  });

  it("returns false when dueDate is not today", () => {
    expect(isDueToday(makeTask({ dueDate: "2025-02-14" }), today)).toBe(false);
  });
});

describe("formatDueLabel", () => {
  const today = "2025-02-13";

  it("returns null when no dueDate", () => {
    expect(formatDueLabel(makeTask(), today)).toBeNull();
  });

  it('returns "overdue" for past dates', () => {
    expect(formatDueLabel(makeTask({ dueDate: "2025-02-10" }), today)).toBe("overdue");
  });

  it('returns "today" for today', () => {
    expect(formatDueLabel(makeTask({ dueDate: "2025-02-13" }), today)).toBe("today");
  });

  it('returns "tomorrow" for tomorrow', () => {
    expect(formatDueLabel(makeTask({ dueDate: "2025-02-14" }), today)).toBe("tomorrow");
  });

  it("returns date string for future dates", () => {
    expect(formatDueLabel(makeTask({ dueDate: "2025-02-20" }), today)).toBe("2025-02-20");
  });
});

describe("buildDashboardSections", () => {
  const today = "2025-02-13";
  const threeDaysOut = "2025-02-16";

  it("puts inprogress tasks in the inProgress section", () => {
    const ip = [makeTask({ id: "t1" as Task["id"], status: "inprogress" })];
    const result = buildDashboardSections(ip, [], [], today, threeDaysOut);
    expect(result.inProgress).toHaveLength(1);
    expect(result.inProgress[0].id).toBe("t1");
  });

  it("puts active overdue tasks in inProgress", () => {
    const active = [makeTask({ id: "t2" as Task["id"], status: "active", dueDate: "2025-02-10" })];
    const result = buildDashboardSections([], active, [], today, threeDaysOut);
    expect(result.inProgress).toHaveLength(1);
    expect(result.inProgress[0].id).toBe("t2");
  });

  it("puts active due-today tasks in inProgress", () => {
    const active = [makeTask({ id: "t3" as Task["id"], status: "active", dueDate: "2025-02-13" })];
    const result = buildDashboardSections([], active, [], today, threeDaysOut);
    expect(result.inProgress).toHaveLength(1);
    expect(result.inProgress[0].id).toBe("t3");
  });

  it("puts tasks due within 3 days in comingSoon", () => {
    const active = [makeTask({ id: "t4" as Task["id"], status: "active", dueDate: "2025-02-15" })];
    const result = buildDashboardSections([], active, [], today, threeDaysOut);
    expect(result.comingSoon).toHaveLength(1);
    expect(result.comingSoon[0].id).toBe("t4");
  });

  it("puts high priority active tasks with no near due date in next", () => {
    const active = [makeTask({ id: "t5" as Task["id"], status: "active", priority: "high" })];
    const result = buildDashboardSections([], active, [], today, threeDaysOut);
    expect(result.next).toHaveLength(1);
    expect(result.next[0].id).toBe("t5");
  });

  it("does not put medium priority tasks in next", () => {
    const active = [makeTask({ id: "t6" as Task["id"], status: "active", priority: "medium" })];
    const result = buildDashboardSections([], active, [], today, threeDaysOut);
    expect(result.next).toHaveLength(0);
  });

  it("passes through waiting tasks", () => {
    const waiting = [makeTask({ id: "t7" as Task["id"], status: "waiting" })];
    const result = buildDashboardSections([], [], waiting, today, threeDaysOut);
    expect(result.waiting).toHaveLength(1);
  });

  it("deduplicates across sections", () => {
    const ip = [makeTask({ id: "t8" as Task["id"], status: "inprogress" })];
    // Same task appears in active list too (shouldn't happen but test dedup)
    const active = [
      makeTask({
        id: "t8" as Task["id"],
        status: "active",
        dueDate: "2025-02-15",
        priority: "high",
      }),
    ];
    const result = buildDashboardSections(ip, active, [], today, threeDaysOut);
    expect(result.inProgress).toHaveLength(1);
    expect(result.comingSoon).toHaveLength(0);
    expect(result.next).toHaveLength(0);
  });

  it("deduplicates comingSoon tasks from next", () => {
    const active = [
      makeTask({
        id: "t9" as Task["id"],
        status: "active",
        priority: "high",
        dueDate: "2025-02-15",
      }),
    ];
    const result = buildDashboardSections([], active, [], today, threeDaysOut);
    // Should be in comingSoon, NOT in next
    expect(result.comingSoon).toHaveLength(1);
    expect(result.next).toHaveLength(0);
  });
});
