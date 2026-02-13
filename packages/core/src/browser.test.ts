import { describe, expect, it } from "vitest";
import * as browser from "./browser.js";

describe("@todu/core/browser", () => {
  it("exports type creators and constants", () => {
    // Branded ID creators
    expect(typeof browser.createTaskId).toBe("function");
    expect(typeof browser.createProjectId).toBe("function");
    expect(typeof browser.createLabelId).toBe("function");
    expect(typeof browser.createNoteId).toBe("function");
    expect(typeof browser.createHabitId).toBe("function");
    expect(typeof browser.createRecurringId).toBe("function");

    // Type guards
    expect(typeof browser.isTaskStatus).toBe("function");
    expect(typeof browser.isTaskPriority).toBe("function");
    expect(typeof browser.isTaskSortField).toBe("function");

    // Constants
    expect(browser.ALLOWED_STATUS_TRANSITIONS).toBeDefined();
    expect(browser.TASK_STATUSES).toBeDefined();
    expect(browser.TASK_PRIORITIES).toBeDefined();
    expect(browser.TASK_SORT_FIELDS).toBeDefined();

    // Schema
    expect(typeof browser.createEmptyCatalog).toBe("function");
  });

  it("does not export Node.js-dependent modules", () => {
    const exports = Object.keys(browser);
    // config.ts exports
    expect(exports).not.toContain("resolveConfigPath");
    expect(exports).not.toContain("resolveDataDir");
    expect(exports).not.toContain("resolveStoragePath");
    // schedule.ts exports
    expect(exports).not.toContain("nextOccurrence");
    expect(exports).not.toContain("generateDeterministicId");
  });
});
