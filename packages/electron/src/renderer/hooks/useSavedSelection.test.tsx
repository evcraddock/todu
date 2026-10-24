/** @vitest-environment jsdom */
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useSavedSelection } from "./useSavedSelection.js";

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

it("restores a dropdown after remount without sharing it with another page", () => {
  const first = renderHook(() => useSavedSelection<string>("habits:status", "all"));
  act(() => first.result.current[1]("paused"));
  first.unmount();
  const restored = renderHook(() => useSavedSelection<string>("habits:status", "all"));
  const other = renderHook(() => useSavedSelection<string>("recurring:status", "all"));
  expect(restored.result.current[0]).toBe("paused");
  expect(other.result.current[0]).toBe("all");
});

it("preserves an empty All selection and falls back for unsupported saved options", () => {
  localStorage.setItem("todu:list:journal:tag", "");
  localStorage.setItem("todu:list:journal:sort", "unsupported");
  const tag = renderHook(() => useSavedSelection<string>("journal:tag", "default"));
  const sort = renderHook(() =>
    useSavedSelection<string>("journal:sort", "newest", ["newest", "oldest"]),
  );
  expect(tag.result.current[0]).toBe("");
  expect(sort.result.current[0]).toBe("newest");
});

it("keeps dropdowns usable when storage is unavailable", () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
    throw new Error("Unavailable");
  });
  const selection = renderHook(() => useSavedSelection<string>("assignees:status", "active"));
  act(() => selection.result.current[1]("archived"));
  expect(selection.result.current[0]).toBe("archived");
});
