import { describe, expect, it } from "vitest";
import {
  parseAssignedWorkerTypesFromEnv,
  TODUAI_DAEMON_ASSIGNED_WORKERS_ENV,
} from "./worker-assignment.js";

describe("parseAssignedWorkerTypesFromEnv", () => {
  it("returns undefined assignment when env var is not set", () => {
    const parsed = parseAssignedWorkerTypesFromEnv({});

    expect(parsed).toEqual({
      assignedWorkerTypes: undefined,
      duplicateWorkerTypes: [],
      ignoredEntries: [],
    });
  });

  it("parses assigned worker types from comma-separated env value", () => {
    const parsed = parseAssignedWorkerTypesFromEnv({
      [TODUAI_DAEMON_ASSIGNED_WORKERS_ENV]: " recurring,sync ",
    });

    expect(parsed).toEqual({
      assignedWorkerTypes: ["recurring", "sync"],
      duplicateWorkerTypes: [],
      ignoredEntries: [],
    });
  });

  it("reports duplicates and ignored empty entries", () => {
    const parsed = parseAssignedWorkerTypesFromEnv({
      [TODUAI_DAEMON_ASSIGNED_WORKERS_ENV]: "recurring,,sync,recurring, ",
    });

    expect(parsed).toEqual({
      assignedWorkerTypes: ["recurring", "sync"],
      duplicateWorkerTypes: ["recurring"],
      ignoredEntries: ["", " "],
    });
  });

  it("supports explicit empty assignment list", () => {
    const parsed = parseAssignedWorkerTypesFromEnv({
      [TODUAI_DAEMON_ASSIGNED_WORKERS_ENV]: "",
    });

    expect(parsed).toEqual({
      assignedWorkerTypes: [],
      duplicateWorkerTypes: [],
      ignoredEntries: [],
    });
  });
});
