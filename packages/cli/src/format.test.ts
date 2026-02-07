import type { NotFoundError, StorageError, ValidationError } from "@todu/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  colorPriority,
  colorStatus,
  formatError,
  formatJSON,
  formatTable,
  setColorEnabled,
} from "./format.js";

describe("formatTable", () => {
  const columns = [
    { key: "name", label: "Name" },
    { key: "status", label: "Status" },
  ];

  it("formats rows as aligned columns", () => {
    const rows = [
      { name: "Project A", status: "active" },
      { name: "B", status: "done" },
    ];
    const output = formatTable(rows, columns);
    const lines = output.split("\n");

    expect(lines[0]).toContain("Name");
    expect(lines[0]).toContain("Status");
    expect(lines[2]).toContain("Project A");
    expect(lines[2]).toContain("active");
    expect(lines[3]).toContain("B");
    expect(lines[3]).toContain("done");
  });

  it("returns 'No results.' for empty rows", () => {
    expect(formatTable([], columns)).toBe("No results.");
  });

  it("handles missing values gracefully", () => {
    const rows = [{ name: "Test" }];
    const output = formatTable(rows, columns);
    expect(output).toContain("Test");
  });
});

describe("formatJSON", () => {
  it("formats data as indented JSON", () => {
    const data = { name: "test", count: 42 };
    const output = formatJSON(data);
    expect(JSON.parse(output)).toEqual(data);
    expect(output).toContain("\n"); // indented
  });
});

describe("formatError", () => {
  it("formats NotFoundError", () => {
    const error: NotFoundError = { type: "not-found", entity: "project", id: "abc" };
    expect(formatError(error)).toBe("Error: project not found: abc");
  });

  it("formats ValidationError", () => {
    const error: ValidationError = {
      type: "validation",
      field: "title",
      message: "Title is required",
    };
    expect(formatError(error)).toBe("Error: title: Title is required");
  });

  it("formats StorageError", () => {
    const error: StorageError = { type: "storage", message: "Disk full" };
    expect(formatError(error)).toBe("Error: Disk full");
  });
});

describe("color functions", () => {
  describe("with color disabled", () => {
    beforeEach(() => setColorEnabled(false));
    afterEach(() => setColorEnabled(false));

    it("colorPriority returns plain text", () => {
      expect(colorPriority("high")).toBe("high");
      expect(colorPriority("medium")).toBe("medium");
      expect(colorPriority("low")).toBe("low");
    });

    it("colorStatus returns plain text", () => {
      expect(colorStatus("done")).toBe("done");
      expect(colorStatus("inprogress")).toBe("inprogress");
    });
  });

  describe("with color enabled", () => {
    beforeEach(() => setColorEnabled(true));
    afterEach(() => setColorEnabled(false));

    it("colorPriority returns text containing the value", () => {
      // picocolors may strip ANSI in non-TTY (test runner), so just verify
      // the function runs and returns the value
      expect(colorPriority("high")).toContain("high");
      expect(colorPriority("medium")).toContain("medium");
      expect(colorPriority("low")).toContain("low");
    });

    it("colorStatus returns text containing the value", () => {
      expect(colorStatus("done")).toContain("done");
      expect(colorStatus("inprogress")).toContain("inprogress");
      expect(colorStatus("canceled")).toContain("canceled");
      expect(colorStatus("waiting")).toContain("waiting");
      expect(colorStatus("active")).toContain("active");
    });
  });
});
