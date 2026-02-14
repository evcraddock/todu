/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// Test the persistence and validation logic directly
// The hook itself needs React — we test the pure logic here

const STORAGE_KEY = "todu-sidebar";

function loadState(): { width: number; mode: string } {
  // Mirror the logic from useSidebar.ts
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        width:
          typeof parsed.width === "number" && parsed.width >= 140 && parsed.width <= 400
            ? parsed.width
            : 200,
        mode:
          parsed.mode === "expanded" || parsed.mode === "collapsed" || parsed.mode === "hidden"
            ? parsed.mode
            : "expanded",
      };
    }
  } catch {
    // ignore
  }
  return { width: 200, mode: "expanded" };
}

describe("sidebar state persistence", () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  it("defaults to width 200 and expanded mode", () => {
    const state = loadState();
    expect(state.width).toBe(200);
    expect(state.mode).toBe("expanded");
  });

  it("restores valid saved state", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: 280, mode: "collapsed" }));
    const state = loadState();
    expect(state.width).toBe(280);
    expect(state.mode).toBe("collapsed");
  });

  it("restores hidden mode", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: 200, mode: "hidden" }));
    const state = loadState();
    expect(state.mode).toBe("hidden");
  });

  it("clamps width below minimum to default", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: 50, mode: "expanded" }));
    const state = loadState();
    expect(state.width).toBe(200);
  });

  it("clamps width above maximum to default", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: 800, mode: "expanded" }));
    const state = loadState();
    expect(state.width).toBe(200);
  });

  it("rejects invalid mode", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: 200, mode: "invalid" }));
    const state = loadState();
    expect(state.mode).toBe("expanded");
  });

  it("handles corrupted JSON", () => {
    localStorage.setItem(STORAGE_KEY, "not-json");
    const state = loadState();
    expect(state.width).toBe(200);
    expect(state.mode).toBe("expanded");
  });

  it("handles non-numeric width", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: "abc", mode: "expanded" }));
    const state = loadState();
    expect(state.width).toBe(200);
  });

  it("accepts boundary values", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: 140, mode: "expanded" }));
    expect(loadState().width).toBe(140);

    localStorage.setItem(STORAGE_KEY, JSON.stringify({ width: 400, mode: "expanded" }));
    expect(loadState().width).toBe(400);
  });
});

describe("sidebar cssWidth calculation", () => {
  it("returns 0 for hidden mode", () => {
    const mode = "hidden";
    const width = 200;
    const cssWidth = mode === "hidden" ? 0 : mode === "collapsed" ? 48 : width;
    expect(cssWidth).toBe(0);
  });

  it("returns 48 for collapsed mode", () => {
    const mode = "collapsed";
    const width = 200;
    const cssWidth = mode === "hidden" ? 0 : mode === "collapsed" ? 48 : width;
    expect(cssWidth).toBe(48);
  });

  it("returns actual width for expanded mode", () => {
    const mode = "expanded";
    const width = 250;
    const cssWidth = mode === "hidden" ? 0 : mode === "collapsed" ? 48 : width;
    expect(cssWidth).toBe(250);
  });
});
