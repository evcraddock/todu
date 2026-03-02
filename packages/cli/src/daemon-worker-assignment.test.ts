import { describe, expect, it } from "vitest";
import {
  resolveDaemonAssignedWorkers,
  TODUAI_DAEMON_ASSIGNED_WORKERS_ENV,
} from "./daemon-worker-assignment.js";

describe("resolveDaemonAssignedWorkers", () => {
  it("prefers env override over config file assignments", () => {
    const resolved = resolveDaemonAssignedWorkers(
      {
        daemon: {
          workers: {
            assigned: ["recurring", "sync"],
          },
        },
      },
      {
        [TODUAI_DAEMON_ASSIGNED_WORKERS_ENV]: "habit,task",
      },
    );

    expect(resolved).toEqual({
      value: "habit,task",
      source: "env",
    });
  });

  it("loads assignments from config file when env override is not set", () => {
    const resolved = resolveDaemonAssignedWorkers(
      {
        daemon: {
          workers: {
            assigned: [" recurring ", "sync", "sync"],
          },
        },
      },
      {},
    );

    expect(resolved).toEqual({
      value: "recurring,sync,sync",
      source: "file",
    });
  });

  it("keeps explicit empty assignment list from config", () => {
    const resolved = resolveDaemonAssignedWorkers(
      {
        daemon: {
          workers: {
            assigned: [],
          },
        },
      },
      {},
    );

    expect(resolved).toEqual({
      value: "",
      source: "file",
    });
  });

  it("returns unset when neither env nor config assignments are present", () => {
    const resolved = resolveDaemonAssignedWorkers({}, {});

    expect(resolved).toEqual({
      value: undefined,
      source: "unset",
    });
  });
});
