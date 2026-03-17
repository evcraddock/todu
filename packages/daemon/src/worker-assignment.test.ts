import { describe, expect, it } from "vitest";
import {
  parseAssignedWorkerTypesFromEnv,
  TODU_DAEMON_ASSIGNED_WORKERS_ENV,
  TODUAI_DAEMON_ASSIGNED_WORKERS_ENV,
} from "./worker-assignment.js";

describe("parseAssignedWorkerTypesFromEnv", () => {
  it("returns undefined assignment when env vars are not set", () => {
    const parsed = parseAssignedWorkerTypesFromEnv({});

    expect(parsed).toEqual({
      assignedWorkerTypes: undefined,
      duplicateWorkerTypes: [],
      ignoredEntries: [],
    });
  });

  it("prefers TODU_DAEMON_ASSIGNED_WORKERS over the legacy env var", () => {
    const parsed = parseAssignedWorkerTypesFromEnv({
      [TODU_DAEMON_ASSIGNED_WORKERS_ENV]: " recurring,sync ",
      [TODUAI_DAEMON_ASSIGNED_WORKERS_ENV]: " habit,legacy ",
    });

    expect(parsed).toEqual({
      assignedWorkerTypes: ["recurring", "sync"],
      duplicateWorkerTypes: [],
      ignoredEntries: [],
    });
  });

  it("falls back to the legacy env var", () => {
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
      [TODU_DAEMON_ASSIGNED_WORKERS_ENV]: "recurring,,sync,recurring, ",
    });

    expect(parsed).toEqual({
      assignedWorkerTypes: ["recurring", "sync"],
      duplicateWorkerTypes: ["recurring"],
      ignoredEntries: ["", " "],
    });
  });

  it("supports explicit empty assignment list", () => {
    const parsed = parseAssignedWorkerTypesFromEnv({
      [TODU_DAEMON_ASSIGNED_WORKERS_ENV]: "",
    });

    expect(parsed).toEqual({
      assignedWorkerTypes: [],
      duplicateWorkerTypes: [],
      ignoredEntries: [],
    });
  });
});
