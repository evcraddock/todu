/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  STORAGE_KEY,
  applyTheme,
  getStoredPreference,
  resolveTheme,
  storePreference,
} from "./useTheme.js";

// jsdom doesn't implement matchMedia — provide a minimal mock
function mockMatchMedia(lightPreferred: boolean): void {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-color-scheme: light)" ? lightPreferred : !lightPreferred,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

describe("getStoredPreference", () => {
  beforeEach(() => localStorage.clear());

  it("returns 'system' when nothing is stored", () => {
    expect(getStoredPreference()).toBe("system");
  });

  it("returns 'dark' when 'dark' is stored", () => {
    localStorage.setItem(STORAGE_KEY, "dark");
    expect(getStoredPreference()).toBe("dark");
  });

  it("returns 'light' when 'light' is stored", () => {
    localStorage.setItem(STORAGE_KEY, "light");
    expect(getStoredPreference()).toBe("light");
  });

  it("returns 'system' when 'system' is stored", () => {
    localStorage.setItem(STORAGE_KEY, "system");
    expect(getStoredPreference()).toBe("system");
  });

  it("returns 'system' for invalid stored values", () => {
    localStorage.setItem(STORAGE_KEY, "invalid");
    expect(getStoredPreference()).toBe("system");
  });

  it("returns 'system' for empty string", () => {
    localStorage.setItem(STORAGE_KEY, "");
    expect(getStoredPreference()).toBe("system");
  });
});

describe("storePreference", () => {
  beforeEach(() => localStorage.clear());

  it("stores 'dark' in localStorage", () => {
    storePreference("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
  });

  it("stores 'light' in localStorage", () => {
    storePreference("light");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
  });

  it("stores 'system' in localStorage", () => {
    storePreference("system");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("system");
  });
});

describe("resolveTheme", () => {
  it("returns 'dark' for 'dark' preference", () => {
    mockMatchMedia(false);
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("returns 'light' for 'light' preference", () => {
    mockMatchMedia(false);
    expect(resolveTheme("light")).toBe("light");
  });

  it("returns 'dark' for 'system' when system prefers dark", () => {
    mockMatchMedia(false);
    expect(resolveTheme("system")).toBe("dark");
  });

  it("returns 'light' for 'system' when system prefers light", () => {
    mockMatchMedia(true);
    expect(resolveTheme("system")).toBe("light");
  });
});

describe("applyTheme", () => {
  afterEach(() => {
    document.documentElement.removeAttribute("data-theme");
  });

  it("sets data-theme='dark' on document element", () => {
    applyTheme("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("sets data-theme='light' on document element", () => {
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("overwrites previous theme", () => {
    applyTheme("dark");
    applyTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });
});
