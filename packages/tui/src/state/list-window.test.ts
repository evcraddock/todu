import { describe, expect, it } from "vitest";
import { formatListWindowIndicator, getVisibleListWindow } from "./list-window.js";

const items = Array.from({ length: 10 }, (_, index) => ({ id: `item-${index + 1}` }));

describe("getVisibleListWindow", () => {
  it("returns every item without indicators when the list fits", () => {
    const window = getVisibleListWindow(items.slice(0, 3), "item-2", 4);

    expect(window.items).toEqual(items.slice(0, 3));
    expect(window.start).toBe(0);
    expect(window.end).toBe(3);
    expect(window.hasAbove).toBe(false);
    expect(window.hasBelow).toBe(false);
  });

  it("keeps the selected item visible in a long list and reports rows above and below", () => {
    const window = getVisibleListWindow(items, "item-6", 4);

    expect(window.items.map((item) => item.id)).toEqual(["item-4", "item-5", "item-6", "item-7"]);
    expect(window.start).toBe(3);
    expect(window.end).toBe(7);
    expect(window.hasAbove).toBe(true);
    expect(window.hasBelow).toBe(true);
    expect(formatListWindowIndicator(window, "above")).toBe("↑ 3 more");
    expect(formatListWindowIndicator(window, "below")).toBe("↓ 3 more");
  });

  it("handles very short panes by showing one selected row", () => {
    const window = getVisibleListWindow(items, "item-10", 0);

    expect(window.items.map((item) => item.id)).toEqual(["item-10"]);
    expect(window.start).toBe(9);
    expect(window.end).toBe(10);
    expect(formatListWindowIndicator(window, "above")).toBe("↑ 9 more");
    expect(formatListWindowIndicator(window, "below")).toBeNull();
  });
});
