import { describe, expect, it } from "vitest";
import { formatTaskMetadata, formatTaskRow } from "./task.js";

const task = {
  id: "task-1",
  title: "Ship the TUI task read model",
  status: "inprogress",
  priority: "medium",
  projectId: "project-1",
  labels: ["tui", "spec"],
  assigneeActorIds: [],
  assignees: [],
  createdAt: "2026-06-30T00:00:00.000Z",
  updatedAt: "2026-06-30T00:00:00.000Z",
} as const;

describe("task formatting", () => {
  it("formats compact task rows", () => {
    expect(formatTaskRow(task, "todu")).toBe(
      "[med] [doing] Ship the TUI task read model (todu) #tui #spec",
    );
  });

  it("formats compact task metadata", () => {
    expect(formatTaskMetadata(task, "todu")).toBe("doing • med • todu • #tui #spec");
  });
});
