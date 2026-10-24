import type { Task } from "@todu/core/browser";
import { describe, expect, it } from "vitest";
import {
  addDays,
  buildDashboardSections,
  endOfWeek,
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
    assigneeActorIds: [],
    assignees: [],
    createdAt: "2025-01-01",
    updatedAt: "2025-01-01",
    ...overrides,
  };
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

  it.each(["low", "medium", "high"] as const)(
    "includes %s priority tasks scheduled later this week",
    (priority) => {
      const task = makeTask({ priority, scheduledDate: "2025-02-15" });
      const result = buildDashboardSections([], [task], [], today, threeDaysOut);
      expect(result.thisWeek).toEqual([task]);
    },
  );

  it.each([undefined, "2025-02-16"])(
    "excludes high priority tasks scheduled %s",
    (scheduledDate) => {
      const task = makeTask({ priority: "high", scheduledDate });
      expect(buildDashboardSections([], [task], [], today, threeDaysOut).thisWeek).toEqual([]);
    },
  );

  it("retains earlier-week tasks across successive weeks without mutating fields", () => {
    const task = Object.freeze(makeTask({ scheduledDate: "2025-01-27", dueDate: "2025-12-31" }));
    const snapshot = { ...task };
    const tasks = [task];
    for (const date of ["2025-02-08", "2025-02-09", "2025-02-15", "2025-02-16", "2025-03-02"]) {
      expect(buildDashboardSections([], tasks, [], date, addDays(date, 3)).thisWeek).toEqual([
        task,
      ]);
    }
    expect(task).toEqual(snapshot);
    expect(tasks).toEqual([snapshot]);
  });

  it.each(["inprogress", "waiting", "done", "canceled"] as const)(
    "excludes %s tasks from This Week",
    (status) => {
      const task = makeTask({ status, scheduledDate: "2025-02-10" });
      expect(buildDashboardSections([], [task], [], today, threeDaysOut).thisWeek).toEqual([]);
    },
  );

  it("does not treat a passed scheduled date as overdue", () => {
    const task = makeTask({ scheduledDate: "2025-01-27" });
    expect(isOverdue(task, today)).toBe(false);
    expect(formatDueLabel(task, today)).toBeNull();
    expect(buildDashboardSections([], [task], [], today, threeDaysOut).inProgress).toEqual([]);
    expect(isOverdue(makeTask({ ...task, dueDate: "2025-02-12" }), today)).toBe(true);
  });

  it("updates membership when a task is rescheduled or its schedule is cleared", () => {
    for (const scheduledDate of ["2025-02-10", "2025-02-17", undefined]) {
      const task = makeTask({ scheduledDate });
      expect(buildDashboardSections([], [task], [], today, threeDaysOut).thisWeek).toEqual(
        scheduledDate === "2025-02-10" ? [task] : [],
      );
    }
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
        scheduledDate: "2025-02-10",
      }),
    ];
    const result = buildDashboardSections(ip, active, [], today, threeDaysOut);
    expect(result.inProgress).toHaveLength(1);
    expect(result.comingSoon).toHaveLength(0);
    expect(result.thisWeek).toHaveLength(0);
  });

  it("deduplicates comingSoon tasks from This Week", () => {
    const active = [
      makeTask({
        id: "t9" as Task["id"],
        status: "active",
        priority: "high",
        scheduledDate: "2025-02-10",
        dueDate: "2025-02-15",
      }),
    ];
    const result = buildDashboardSections([], active, [], today, threeDaysOut);
    // Coming Soon keeps precedence over This Week.
    expect(result.comingSoon).toHaveLength(1);
    expect(result.thisWeek).toHaveLength(0);
  });
});

describe("endOfWeek", () => {
  it.each([
    ["2026-10-17", "2026-10-17"],
    ["2026-10-18", "2026-10-24"],
    ["2026-10-19", "2026-10-24"],
    ["2026-10-24", "2026-10-24"],
    ["2026-10-25", "2026-10-31"],
    ["2025-01-31", "2025-02-01"],
    ["2025-12-31", "2026-01-03"],
    ["2026-03-07", "2026-03-07"],
    ["2026-03-08", "2026-03-14"],
    ["2026-03-09", "2026-03-14"],
    ["2026-10-31", "2026-10-31"],
    ["2026-11-01", "2026-11-07"],
    ["2026-11-02", "2026-11-07"],
  ])("includes Saturday and excludes next Sunday for %s", (today, saturday) => {
    expect(endOfWeek(today)).toBe(saturday);
    const included = makeTask({ id: "included" as Task["id"], scheduledDate: saturday });
    const excluded = makeTask({
      id: "excluded" as Task["id"],
      scheduledDate: addDays(saturday, 1),
    });
    expect(
      buildDashboardSections([], [included, excluded], [], today, addDays(today, 3)).thisWeek,
    ).toEqual([included]);
  });
});
