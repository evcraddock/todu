import { describe, expect, it } from "vitest";
import { extractTasksFromResult } from "./extract-tasks.js";

describe("extractTasksFromResult", () => {
  it("returns empty array for null input", () => {
    expect(extractTasksFromResult(null)).toEqual([]);
  });

  it("returns empty array for undefined input", () => {
    expect(extractTasksFromResult(undefined)).toEqual([]);
  });

  it("returns empty array for non-object input", () => {
    expect(extractTasksFromResult("string")).toEqual([]);
    expect(extractTasksFromResult(42)).toEqual([]);
    expect(extractTasksFromResult(true)).toEqual([]);
  });

  it("returns empty array when content is missing", () => {
    expect(extractTasksFromResult({})).toEqual([]);
    expect(extractTasksFromResult({ details: {} })).toEqual([]);
  });

  it("returns empty array when content is not an array", () => {
    expect(extractTasksFromResult({ content: "not-array" })).toEqual([]);
  });

  it("returns empty array for empty content array", () => {
    expect(extractTasksFromResult({ content: [] })).toEqual([]);
  });

  it("extracts tasks from valid tool result", () => {
    const tasks = [
      { id: "t1", title: "Task 1", status: "active", priority: "high" },
      { id: "t2", title: "Task 2", status: "done", priority: "low" },
    ];
    const result = {
      content: [{ type: "text", text: JSON.stringify(tasks) }],
      details: {},
    };
    const extracted = extractTasksFromResult(result);
    expect(extracted).toHaveLength(2);
    expect(extracted[0].id).toBe("t1");
    expect(extracted[1].id).toBe("t2");
  });

  it("filters out non-task objects (missing id)", () => {
    const items = [
      { id: "t1", title: "Valid task" },
      { title: "Missing id" },
      { id: "t3", title: "Also valid" },
    ];
    const result = {
      content: [{ type: "text", text: JSON.stringify(items) }],
      details: {},
    };
    const extracted = extractTasksFromResult(result);
    expect(extracted).toHaveLength(2);
    expect(extracted[0].id).toBe("t1");
    expect(extracted[1].id).toBe("t3");
  });

  it("filters out non-task objects (missing title)", () => {
    const items = [
      { id: "t1", title: "Valid" },
      { id: "t2", status: "active" },
    ];
    const result = {
      content: [{ type: "text", text: JSON.stringify(items) }],
      details: {},
    };
    const extracted = extractTasksFromResult(result);
    expect(extracted).toHaveLength(1);
    expect(extracted[0].id).toBe("t1");
  });

  it("filters out null items in array", () => {
    const items = [{ id: "t1", title: "Valid" }, null, { id: "t3", title: "Also valid" }];
    const result = {
      content: [{ type: "text", text: JSON.stringify(items) }],
      details: {},
    };
    const extracted = extractTasksFromResult(result);
    expect(extracted).toHaveLength(2);
  });

  it("skips non-text content blocks", () => {
    const tasks = [{ id: "t1", title: "Task" }];
    const result = {
      content: [
        { type: "image", url: "https://example.com/img.png" },
        { type: "text", text: JSON.stringify(tasks) },
      ],
      details: {},
    };
    const extracted = extractTasksFromResult(result);
    expect(extracted).toHaveLength(1);
  });

  it("skips text blocks with non-JSON content", () => {
    const tasks = [{ id: "t1", title: "Task" }];
    const result = {
      content: [
        { type: "text", text: "Not found: project with id abc" },
        { type: "text", text: JSON.stringify(tasks) },
      ],
      details: {},
    };
    const extracted = extractTasksFromResult(result);
    expect(extracted).toHaveLength(1);
    expect(extracted[0].id).toBe("t1");
  });

  it("skips text blocks with empty text", () => {
    const result = {
      content: [{ type: "text", text: "" }],
      details: {},
    };
    expect(extractTasksFromResult(result)).toEqual([]);
  });

  it("skips text blocks with undefined text", () => {
    const result = {
      content: [{ type: "text" }],
      details: {},
    };
    expect(extractTasksFromResult(result)).toEqual([]);
  });

  it("returns first valid array only", () => {
    const tasks1 = [{ id: "t1", title: "First" }];
    const tasks2 = [{ id: "t2", title: "Second" }];
    const result = {
      content: [
        { type: "text", text: JSON.stringify(tasks1) },
        { type: "text", text: JSON.stringify(tasks2) },
      ],
      details: {},
    };
    const extracted = extractTasksFromResult(result);
    // Returns first valid array (early return in loop)
    expect(extracted).toHaveLength(1);
    expect(extracted[0].id).toBe("t1");
  });

  it("skips non-array JSON (object)", () => {
    const result = {
      content: [{ type: "text", text: '{"id": "t1", "title": "Single task"}' }],
      details: {},
    };
    expect(extractTasksFromResult(result)).toEqual([]);
  });

  it("skips non-array JSON (string)", () => {
    const result = {
      content: [{ type: "text", text: '"just a string"' }],
      details: {},
    };
    expect(extractTasksFromResult(result)).toEqual([]);
  });

  it("returns empty array for JSON array with all non-task items", () => {
    const items = [{ name: "not a task" }, { count: 42 }];
    const result = {
      content: [{ type: "text", text: JSON.stringify(items) }],
      details: {},
    };
    expect(extractTasksFromResult(result)).toEqual([]);
  });
});
