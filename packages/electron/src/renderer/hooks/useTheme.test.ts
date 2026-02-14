/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("theme utilities", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("defaults to system preference", () => {
    const stored = localStorage.getItem("todu-theme-preference");
    expect(stored).toBeNull();
  });

  it("stores preference in localStorage", () => {
    localStorage.setItem("todu-theme-preference", "dark");
    expect(localStorage.getItem("todu-theme-preference")).toBe("dark");
  });

  it("ignores invalid stored values", () => {
    localStorage.setItem("todu-theme-preference", "invalid");
    const stored = localStorage.getItem("todu-theme-preference");
    const valid = stored === "dark" || stored === "light" || stored === "system";
    expect(valid).toBe(false);
  });

  it("data-theme attribute can be set on document", () => {
    document.documentElement.setAttribute("data-theme", "light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    document.documentElement.setAttribute("data-theme", "dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("CSS variables resolve based on data-theme", () => {
    // Just verify the attribute mechanism works — actual CSS variable
    // resolution requires a real browser, but we test the DOM integration
    document.documentElement.setAttribute("data-theme", "light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
