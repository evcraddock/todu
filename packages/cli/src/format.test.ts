import type { NotFoundError, StorageError, ValidationError } from "@todu/core";
import { describe, expect, it } from "vitest";
import { formatError, formatJSON, formatTable } from "./format.js";

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
