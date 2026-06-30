import { describe, expect, it } from "vitest";
import { getSelectedItem, moveSelection, resolveSelectedId } from "./selection.js";

const items = [{ id: "task-1" }, { id: "task-2" }, { id: "task-3" }];

describe("selection helpers", () => {
  it("preserves the current selected ID when it still exists", () => {
    expect(resolveSelectedId(items, "task-2")).toBe("task-2");
  });

  it("falls back to the first item when the selected ID disappears", () => {
    expect(resolveSelectedId(items, "missing")).toBe("task-1");
  });

  it("returns null for empty lists", () => {
    expect(resolveSelectedId([], "task-1")).toBeNull();
  });

  it("moves selection within bounds", () => {
    expect(moveSelection(items, "task-1", "next")).toBe("task-2");
    expect(moveSelection(items, "task-2", "previous")).toBe("task-1");
    expect(moveSelection(items, "task-3", "next")).toBe("task-3");
    expect(moveSelection(items, "task-1", "previous")).toBe("task-1");
  });

  it("returns the selected item", () => {
    expect(getSelectedItem(items, "task-2")).toEqual({ id: "task-2" });
  });
});
