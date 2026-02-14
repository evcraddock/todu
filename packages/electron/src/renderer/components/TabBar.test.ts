import { describe, expect, it } from "vitest";
import type { Tab } from "./TabBar.js";

describe("TabBar types", () => {
  it("Tab interface accepts id and label", () => {
    const tab: Tab = { id: "desc", label: "Description" };
    expect(tab.id).toBe("desc");
    expect(tab.label).toBe("Description");
  });

  it("supports multiple tabs", () => {
    const tabs: Tab[] = [
      { id: "description", label: "Description" },
      { id: "comments", label: "Comments" },
      { id: "tasks", label: "Tasks" },
    ];
    expect(tabs).toHaveLength(3);
    expect(tabs[0].id).toBe("description");
    expect(tabs[2].label).toBe("Tasks");
  });
});
