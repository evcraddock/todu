/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { EntityTimestamps, formatEntityTimestamp } from "./EntityTimestamps.js";

afterEach(cleanup);

it("formats the local date and time across midnight and daylight saving changes", () => {
  expect(formatEntityTimestamp("2026-10-24T01:30:00Z", "America/Chicago")).toBe(
    "Oct 23, 2026, 8:30 PM",
  );
  expect(formatEntityTimestamp("2026-12-24T01:30:00Z", "America/Chicago")).toBe(
    "Dec 23, 2026, 7:30 PM",
  );
});

it("preserves date-only data and handles invalid timestamps", () => {
  expect(formatEntityTimestamp("2026-10-23", "America/Chicago")).toBe("2026-10-23");
  expect(formatEntityTimestamp("invalid", "America/Chicago")).toBe("—");
});

it("uses the configured timezone and falls back to creation for legacy update dates", async () => {
  Object.defineProperty(window, "todu", {
    configurable: true,
    value: {
      settings: { get: vi.fn().mockResolvedValue({ timezone: "America/Chicago" }) },
    },
  });
  render(<EntityTimestamps createdAt="2026-10-24T01:30:00Z" />);
  await waitFor(() => expect(screen.getByText("Created: Oct 23, 2026, 8:30 PM")).toBeDefined());
  expect(screen.getByText("Updated: Oct 23, 2026, 8:30 PM")).toBeDefined();
});
