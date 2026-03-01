import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDaemonRuntime } from "./runtime.js";
import { createWorkerRegistry, validateWorkerManifest } from "./workers.js";

describe("validateWorkerManifest", () => {
  it("accepts and normalizes valid manifests", () => {
    const manifestResult = validateWorkerManifest({
      type: " recurring ",
      requiredDomains: ["recurring", "sync", "recurring"],
      optionalDomains: ["habit", "habit"],
      roleHints: ["authority", "authority"],
    });

    expect(manifestResult.ok).toBe(true);
    if (!manifestResult.ok) {
      throw new Error("Expected valid worker manifest");
    }

    expect(manifestResult.value).toEqual({
      type: "recurring",
      requiredDomains: ["recurring", "sync"],
      optionalDomains: ["habit"],
      roleHints: ["authority"],
    });
  });

  it("rejects unsupported domain capabilities", () => {
    const manifestResult = validateWorkerManifest({
      type: "github-sync",
      requiredDomains: ["sync", "github" as "sync"],
    });

    expect(manifestResult.ok).toBe(false);
    if (manifestResult.ok) {
      throw new Error("Expected invalid manifest result");
    }

    expect(manifestResult.error).toMatchObject({
      code: "INVALID_MANIFEST",
      details: {
        field: "requiredDomains",
        domain: "github",
      },
    });
  });

  it("rejects overlap between required and optional domains", () => {
    const manifestResult = validateWorkerManifest({
      type: "forgejo-sync",
      requiredDomains: ["sync"],
      optionalDomains: ["sync"],
    });

    expect(manifestResult.ok).toBe(false);
    if (manifestResult.ok) {
      throw new Error("Expected invalid manifest result");
    }

    expect(manifestResult.error).toMatchObject({
      code: "INVALID_MANIFEST",
      details: {
        field: "optionalDomains",
        overlappingDomains: ["sync"],
      },
    });
  });
});

describe("createWorkerRegistry", () => {
  it("tracks lifecycle transitions with deterministic state rules", () => {
    let tick = 0;
    const registry = createWorkerRegistry({
      now: () => `2026-03-01T12:00:0${tick++}.000Z`,
    });

    const registration = registry.register({
      manifest: {
        type: "recurring",
        requiredDomains: ["recurring"],
        optionalDomains: ["task"],
      },
    });

    expect(registration.ok).toBe(true);
    if (!registration.ok) {
      throw new Error("Expected successful registration");
    }

    expect(registration.value.state).toBe("registered");

    const runningTransition = registry.transition("recurring", "running");
    expect(runningTransition.ok).toBe(true);
    if (!runningTransition.ok) {
      throw new Error("Expected transition to running");
    }
    expect(runningTransition.value.state).toBe("running");

    const missingBlockedReasonTransition = registry.transition("recurring", "blocked");
    expect(missingBlockedReasonTransition.ok).toBe(false);
    if (missingBlockedReasonTransition.ok) {
      throw new Error("Expected blocked transition to require a reason");
    }
    expect(missingBlockedReasonTransition.error.code).toBe("MISSING_BLOCKED_REASON");

    const blockedTransition = registry.transition("recurring", "blocked", {
      blockedReason: "required domain disabled",
    });
    expect(blockedTransition.ok).toBe(true);
    if (!blockedTransition.ok) {
      throw new Error("Expected blocked transition with reason");
    }
    expect(blockedTransition.value.state).toBe("blocked");
    expect(blockedTransition.value.blockedReason).toBe("required domain disabled");

    const invalidTransition = registry.transition("recurring", "registered");
    expect(invalidTransition.ok).toBe(false);
    if (invalidTransition.ok) {
      throw new Error("Expected invalid transition result");
    }

    expect(invalidTransition.error).toMatchObject({
      code: "INVALID_TRANSITION",
      details: {
        from: "blocked",
        to: "registered",
      },
    });
  });
});

describe("createDaemonRuntime worker registration entrypoints", () => {
  let tmpDir: string;

  afterEach(async () => {
    if (tmpDir) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("registers workers through runtime entrypoints", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-worker-runtime-test-"));

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
    });

    const registerResult = runtime.registerWorker({
      manifest: {
        type: "recurring",
        requiredDomains: ["recurring"],
        optionalDomains: ["task"],
        roleHints: ["authority"],
      },
    });

    expect(registerResult.ok).toBe(true);
    if (!registerResult.ok) {
      throw new Error("Expected runtime worker registration to succeed");
    }

    expect(runtime.getWorker("recurring")).toMatchObject({
      manifest: {
        type: "recurring",
      },
      state: "registered",
    });

    expect(runtime.listWorkers()).toHaveLength(1);
  });

  it("rejects duplicate registrations through runtime entrypoints", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-worker-runtime-test-"));

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      workerRegistrations: [
        {
          manifest: {
            type: "recurring",
            requiredDomains: ["recurring"],
          },
        },
      ],
    });

    const duplicateRegistration = runtime.registerWorker({
      manifest: {
        type: "recurring",
        requiredDomains: ["recurring"],
      },
    });

    expect(duplicateRegistration.ok).toBe(false);
    if (duplicateRegistration.ok) {
      throw new Error("Expected duplicate registration to fail");
    }

    expect(duplicateRegistration.error.code).toBe("ALREADY_REGISTERED");
  });
});
