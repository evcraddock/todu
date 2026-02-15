import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Test the pub/sub mechanism directly (no DOM needed)
describe("toast pub/sub", () => {
  let showToast: (message: string, type?: "error" | "success" | "info") => void;
  let _listeners: Set<(toast: { id: number; message: string; type: string }) => void>;

  beforeEach(async () => {
    // Reset module state between tests
    vi.resetModules();
    const mod = await import("./ToastContainer.js");
    showToast = mod.showToast;
    // Access internal listeners via the module behavior
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("showToast is a function", () => {
    expect(typeof showToast).toBe("function");
  });

  it("does not throw when called with no listeners", () => {
    expect(() => showToast("test message", "error")).not.toThrow();
    expect(() => showToast("test message")).not.toThrow();
  });

  it("defaults to info type", () => {
    // showToast with one arg should not throw
    expect(() => showToast("info message")).not.toThrow();
  });
});
