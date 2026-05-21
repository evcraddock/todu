import { describe, expect, it } from "vitest";
import {
  parseAssignedWorkerTypesFromEnv,
  TODU_DAEMON_ASSIGNED_WORKERS_ENV,
} from "./worker-assignment.js";

describe("parseAssignedWorkerTypesFromEnv", () => {
  it("returns undefined assignment when env var is not set", () => {
    expect(parseAssignedWorkerTypesFromEnv({})).toEqual({
      assignedWorkerTypes: undefined,
      duplicateWorkerTypes: [],
      ignoredEntries: [],
    });
  });

  it("parses TODU_DAEMON_ASSIGNED_WORKERS", () => {
    expect(
      parseAssignedWorkerTypesFromEnv({ [TODU_DAEMON_ASSIGNED_WORKERS_ENV]: " recurring,sync " }),
    ).toEqual({
      assignedWorkerTypes: ["recurring", "sync"],
      duplicateWorkerTypes: [],
      ignoredEntries: [],
    });
  });

  it("reports duplicates and ignored empty entries", () => {
    expect(
      parseAssignedWorkerTypesFromEnv({
        [TODU_DAEMON_ASSIGNED_WORKERS_ENV]: "recurring,,sync,recurring, ",
      }),
    ).toEqual({
      assignedWorkerTypes: ["recurring", "sync"],
      duplicateWorkerTypes: ["recurring"],
      ignoredEntries: ["", " "],
    });
  });

  it("supports explicit empty assignment list", () => {
    expect(parseAssignedWorkerTypesFromEnv({ [TODU_DAEMON_ASSIGNED_WORKERS_ENV]: "" })).toEqual({
      assignedWorkerTypes: [],
      duplicateWorkerTypes: [],
      ignoredEntries: [],
    });
  });
});
