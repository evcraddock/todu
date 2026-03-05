import { describe, expect, it } from "vitest";
import {
  validateWorkerPluginRegistration,
  type WorkerPluginRegistration,
} from "./worker-plugin.js";

describe("validateWorkerPluginRegistration", () => {
  it("accepts valid worker plugin registration", () => {
    const registration = createValidRegistration();

    const result = validateWorkerPluginRegistration(registration);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected worker plugin registration to be valid");
    }

    expect(result.value.manifest).toEqual({
      name: "recurring-worker",
      version: "1.0.0",
      worker: {
        type: "recurring",
        requiredDomains: ["recurring", "task"],
        optionalDomains: [],
        roleHints: ["node"],
      },
    });
  });

  it("rejects empty worker type", () => {
    const registration = createValidRegistration();
    registration.manifest.worker.type = "  ";

    const result = validateWorkerPluginRegistration(registration);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected worker plugin registration to fail");
    }

    expect(result.error).toMatchObject({
      code: "INVALID_MANIFEST",
      details: {
        field: "worker.type",
      },
    });
  });

  it("rejects unknown domain capability", () => {
    const registration = createValidRegistration();
    registration.manifest.worker.requiredDomains = ["recurring", "not-real"] as never;

    const result = validateWorkerPluginRegistration(registration);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected worker plugin registration to fail for invalid requiredDomains");
    }

    expect(result.error).toMatchObject({
      code: "INVALID_MANIFEST",
      details: {
        field: "worker.requiredDomains",
      },
    });
  });

  it("rejects missing createRuntime", () => {
    const registration = createValidRegistration();
    registration.createRuntime = undefined as unknown as WorkerPluginRegistration["createRuntime"];

    const result = validateWorkerPluginRegistration(registration);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected worker plugin registration to fail without createRuntime");
    }

    expect(result.error).toMatchObject({
      code: "INVALID_RUNTIME",
      details: {
        field: "createRuntime",
      },
    });
  });
});

function createValidRegistration(): WorkerPluginRegistration {
  return {
    manifest: {
      name: "recurring-worker",
      version: "1.0.0",
      worker: {
        type: "recurring",
        requiredDomains: ["recurring", "task"],
        roleHints: ["node"],
      },
    },
    createRuntime: () => ({
      start: () => ({
        stop: () => {},
      }),
    }),
  };
}
