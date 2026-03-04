import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDaemonRuntime } from "./runtime.js";
import {
  createNoopWorkerRuntime,
  createWorkerDependencyBlockedReason,
  createWorkerNotAssignedReason,
  createWorkerRegistry,
  findMissingRequiredWorkerDomains,
  validateWorkerManifest,
} from "./workers.js";

const noopWorkerRuntime = createNoopWorkerRuntime();

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

describe("worker dependency gating helpers", () => {
  it("finds missing required domains deterministically", () => {
    const missing = findMissingRequiredWorkerDomains(["recurring", "sync"], ["sync", "task"]);
    expect(missing).toEqual(["recurring"]);
  });

  it("creates blocked reasons with missing domain details", () => {
    const reason = createWorkerDependencyBlockedReason(["recurring", "sync"]);
    expect(reason).toBe("required domains are disabled or missing: recurring, sync");
  });

  it("creates not-assigned reasons with worker type details", () => {
    const reason = createWorkerNotAssignedReason("recurring");
    expect(reason).toBe("worker is not assigned to this daemon: recurring");
  });
});

describe("createWorkerRegistry", () => {
  it("rejects registrations without executable runtime", () => {
    const registry = createWorkerRegistry();

    const registration = registry.register({
      manifest: {
        type: "recurring",
        requiredDomains: ["recurring"],
      },
      runtime: undefined as unknown as { start(): { stop(): void } },
    });

    expect(registration.ok).toBe(false);
    if (registration.ok) {
      throw new Error("Expected registration to fail without runtime");
    }

    expect(registration.error).toMatchObject({
      code: "INVALID_MANIFEST",
      details: {
        field: "runtime",
      },
    });
  });

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
      runtime: noopWorkerRuntime,
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
      runtime: noopWorkerRuntime,
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
          runtime: noopWorkerRuntime,
        },
      ],
    });

    const duplicateRegistration = runtime.registerWorker({
      manifest: {
        type: "recurring",
        requiredDomains: ["recurring"],
      },
      runtime: noopWorkerRuntime,
    });

    expect(duplicateRegistration.ok).toBe(false);
    if (duplicateRegistration.ok) {
      throw new Error("Expected duplicate registration to fail");
    }

    expect(duplicateRegistration.error.code).toBe("ALREADY_REGISTERED");
  });

  it("blocks unassigned workers from running", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-worker-runtime-test-"));

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      assignedWorkerTypes: ["sync"],
    });

    const registerResult = runtime.registerWorker({
      manifest: {
        type: "recurring",
        requiredDomains: ["recurring"],
      },
      runtime: noopWorkerRuntime,
    });

    expect(registerResult.ok).toBe(true);
    if (!registerResult.ok) {
      throw new Error("Expected registration to succeed with blocked state");
    }

    expect(registerResult.value.state).toBe("blocked");
    expect(registerResult.value.blockedReason).toBe(
      "worker is not assigned to this daemon: recurring",
    );

    const transitionResult = runtime.transitionWorkerState("recurring", "running");
    expect(transitionResult.ok).toBe(false);
    if (transitionResult.ok) {
      throw new Error("Expected transition to running to fail for unassigned worker");
    }

    expect(transitionResult.error).toMatchObject({
      code: "NOT_ASSIGNED",
      details: {
        workerType: "recurring",
        blockedReason: "worker is not assigned to this daemon: recurring",
        assignedWorkerTypes: ["sync"],
      },
    });
  });

  it("applies assignment gating to startup registrations", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-worker-runtime-test-"));

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      assignedWorkerTypes: ["sync"],
      workerRegistrations: [
        {
          manifest: {
            type: "recurring",
            requiredDomains: ["recurring"],
          },
          runtime: noopWorkerRuntime,
        },
      ],
    });

    expect(runtime.getWorker("recurring")).toMatchObject({
      state: "blocked",
      blockedReason: "worker is not assigned to this daemon: recurring",
    });
  });

  it("logs duplicate assignment entries from runtime config", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-worker-runtime-test-"));

    const warnings: Array<{ message: string; context?: Record<string, unknown> }> = [];

    const runtimeLogger = {
      level: "info" as const,
      debug: () => {},
      info: () => {},
      warn: (message: string, context?: Record<string, unknown>) => {
        warnings.push({ message, context });
      },
      error: () => {},
      child: () => runtimeLogger,
    };

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      assignedWorkerTypes: ["recurring", "sync", "recurring"],
      logger: runtimeLogger,
    });

    expect(runtime.config().assignedWorkerTypes).toEqual(["recurring", "sync"]);
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          message: "duplicate worker assignment entries detected",
          context: expect.objectContaining({
            duplicateWorkerTypes: ["recurring"],
            assignedWorkerTypes: ["recurring", "sync"],
          }),
        }),
      ]),
    );
  });

  it("blocks worker registration when required domains are unavailable", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-worker-runtime-test-"));

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      enabledWorkerDomains: ["task", "sync"],
    });

    const registerResult = runtime.registerWorker({
      manifest: {
        type: "recurring",
        requiredDomains: ["recurring"],
      },
      runtime: noopWorkerRuntime,
    });

    expect(registerResult.ok).toBe(true);
    if (!registerResult.ok) {
      throw new Error("Expected registration to succeed in blocked state");
    }

    expect(registerResult.value.state).toBe("blocked");
    expect(registerResult.value.blockedReason).toBe(
      "required domains are disabled or missing: recurring",
    );
  });

  it("applies dependency gating to startup registrations", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-worker-runtime-test-"));

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      enabledWorkerDomains: ["task", "sync"],
      workerRegistrations: [
        {
          manifest: {
            type: "recurring",
            requiredDomains: ["recurring"],
          },
          runtime: noopWorkerRuntime,
        },
      ],
    });

    expect(runtime.getWorker("recurring")).toMatchObject({
      state: "blocked",
      blockedReason: "required domains are disabled or missing: recurring",
    });
  });

  it("returns dependency-blocked errors when starting a blocked worker", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-worker-runtime-test-"));

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      enabledWorkerDomains: ["task", "sync"],
    });

    runtime.registerWorker({
      manifest: {
        type: "recurring",
        requiredDomains: ["recurring"],
      },
      runtime: noopWorkerRuntime,
    });

    const transitionResult = runtime.transitionWorkerState("recurring", "running");

    expect(transitionResult.ok).toBe(false);
    if (transitionResult.ok) {
      throw new Error("Expected transition to running to fail due to dependency gating");
    }

    expect(transitionResult.error).toMatchObject({
      code: "DEPENDENCY_BLOCKED",
      details: {
        workerType: "recurring",
        blockedReason: "required domains are disabled or missing: recurring",
        missingRequiredDomains: ["recurring"],
      },
    });

    expect(runtime.getWorker("recurring")).toMatchObject({
      state: "blocked",
      blockedReason: "required domains are disabled or missing: recurring",
    });
  });

  it("allows running transitions when required domains are enabled", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-worker-runtime-test-"));

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      enabledWorkerDomains: ["recurring", "task", "sync"],
    });

    const registerResult = runtime.registerWorker({
      manifest: {
        type: "recurring",
        requiredDomains: ["recurring"],
      },
      runtime: noopWorkerRuntime,
    });

    expect(registerResult.ok).toBe(true);
    if (!registerResult.ok) {
      throw new Error("Expected registration to succeed");
    }

    const transitionResult = runtime.transitionWorkerState("recurring", "running");
    expect(transitionResult.ok).toBe(true);
    if (!transitionResult.ok) {
      throw new Error("Expected transition to running to succeed");
    }

    expect(transitionResult.value.state).toBe("running");
    expect(transitionResult.value.blockedReason).toBeUndefined();
  });

  it("starts executable workers on daemon start and stops them on daemon stop", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-worker-runtime-test-"));

    let startCount = 0;
    let stopCount = 0;

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      enabledWorkerDomains: ["recurring", "task", "sync"],
      workerRegistrations: [
        {
          manifest: {
            type: "recurring",
            requiredDomains: ["recurring"],
          },
          runtime: {
            start() {
              startCount += 1;
              return {
                stop() {
                  stopCount += 1;
                },
              };
            },
          },
        },
      ],
    });

    await runtime.start();

    expect(startCount).toBe(1);
    expect(runtime.getWorker("recurring")?.state).toBe("running");

    await runtime.stop();

    expect(stopCount).toBe(1);
    expect(runtime.getWorker("recurring")?.state).toBe("stopped");
  });

  it("transitions workers to error when start throws", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-worker-runtime-test-"));

    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      enabledWorkerDomains: ["recurring", "task", "sync"],
      workerRegistrations: [
        {
          manifest: {
            type: "recurring",
            requiredDomains: ["recurring"],
          },
          runtime: {
            start() {
              throw new Error("boom");
            },
          },
        },
      ],
    });

    await runtime.start();

    expect(runtime.getWorker("recurring")).toMatchObject({
      state: "error",
      errorMessage: "boom",
    });

    await runtime.stop();
  });
});
