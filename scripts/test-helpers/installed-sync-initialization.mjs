import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  SYNC_PROVIDER_API_VERSION,
  SYNC_PROVIDER_SUPPORTED_API_VERSIONS,
  validateSyncProviderRegistration,
} from "@todu/core";
import { createDaemonLogger, createDaemonRuntime, createSyncPluginWorkerRuntime } from "@todu/daemon";
import { createTodu } from "@todu/engine";

function value(result) {
  assert.ok(result.ok, JSON.stringify(result.error));
  return result.value;
}

export async function runInstalledSyncInitializationProbe({ directory, connect }) {
  for (const name of ["core", "engine", "daemon", "recurring-worker"]) {
    const packagePath = path.join(directory, "node_modules/@todu", name);
    assert.equal(fs.lstatSync(packagePath).isSymbolicLink(), false);
    if (name !== "core") {
      const parent = pathToFileURL(path.join(packagePath, "dist/index.js")).href;
      assert.equal(import.meta.resolve("@todu/core", parent), pathToFileURL(path.join(directory, "node_modules/@todu/core/dist/index.js")).href);
      if (name !== "engine") assert.equal(import.meta.resolve("@todu/engine", parent), pathToFileURL(path.join(directory, "node_modules/@todu/engine/dist/index.js")).href);
    }
  }
  assert.equal(SYNC_PROVIDER_API_VERSION, 7);
  assert.deepEqual(SYNC_PROVIDER_SUPPORTED_API_VERSIONS, [3, 4, 5, 6, 7]);
  const storagePath = path.join(directory, "api-v7-storage");
  const todu = await createTodu({ storagePath });
  let project, binding, local, receipt;
  let pulls = 0, pushes = 0;
  const checkpoint = { originalBatch: "packed-v7", cursor: 42 };
  const empty = () => ({ tasks: [], taskUpdates: [], cancelledTaskExclusions: [], checkpoint });
  const provider = {
    name: "packed-v7", version: "1.0.0",
    async initialize() {}, async shutdown() {},
    async recoveryState() { return { state: "ready" }; },
    async pull(_binding, _project, context) {
      pulls++;
      const observed = await context.observeTaskGroups({ localTaskId: local.id, externalId: local.externalId });
      assert.equal(observed.state, "found");
      assert.equal(Object.isFrozen(observed.task.groups.content), true);
      return { ...empty(), taskUpdates: [{ externalId: local.externalId, observationToken: observed.task.observationToken, groups: { content: { base: { state: "unknown" }, remote: observed.task.groups.content.value }, assignment: { base: { state: "unknown" }, remote: { assignees: [] } } } }] };
    },
    async acknowledgePull(_binding, actual, _project, acknowledgment) { assert.deepEqual(actual, checkpoint); receipt = acknowledgment; },
    async push() { pushes++; return { taskLinks: [], commentLinks: [] }; },
  };
  const registration = { manifest: { name: provider.name, version: provider.version, apiVersion: 7 }, provider };
  assert.equal(validateSyncProviderRegistration(registration).ok, true);
  const unsupported = validateSyncProviderRegistration(registration, { supportedApiVersions: [3, 4, 5, 6] });
  assert.equal(unsupported.ok, false);
  assert.equal(unsupported.error.code, "API_VERSION_MISMATCH");
  for (const apiVersion of [3, 4, 5, 6]) assert.equal(validateSyncProviderRegistration({ ...registration, manifest: { ...registration.manifest, apiVersion } }).ok, true);
  async function cycle() {
    const scheduled = [];
    const handle = createSyncPluginWorkerRuntime({
      pluginName: provider.name, pluginVersion: provider.version, modulePath: "/fixture", authorityId: "packed-fixture",
      provider, providerApiVersion: 7, getTodu: () => todu, logger: createDaemonLogger({ level: "error" }),
      config: { enabled: true, settings: {}, intervalMs: 60000, retryInitialMs: 60000, retryMaxMs: 60000 },
      scheduler: { setTimeoutFn(handler) { scheduled.push(handler); return 1; }, clearTimeoutFn() {} },
    }).start();
    try {
      scheduled[0]();
      const deadline = Date.now() + 3000;
      while (scheduled.length < 2 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 5));
      assert.equal(scheduled.length, 2, "Packed provider cycle must settle");
      return value(await todu.integration.getStatus(binding.id)).state;
    } finally { await handle.stop(); }
  }
  try {
    project = value(await todu.project.create({ name: "Packed API v7 fixture" }));
    binding = value(await todu.integration.create({ provider: provider.name, projectId: project.id, targetKind: "repository", targetRef: "fixture/repository", strategy: "pull", enabled: true }));
    local = value(await todu.task.create({ projectId: project.id, title: "Canonical title", description: "Canonical body", externalId: "remote-1" }));
    local = value(await todu.task.get(local.id));
    value(await todu.note.create({ entityType: "task", entityId: local.id, content: "Preserved comment" }));
    assert.equal(await cycle(), "idle");
    assert.equal(pushes, 0);
    assert.deepEqual(value(await todu.task.get(local.id)), local, "Equality initialization must not rewrite local values or clock");
    assert.deepEqual(receipt.taskResults[0], { externalId: local.externalId, localTaskId: local.id, groups: { content: { state: "persisted", value: { title: local.title, description: local.description }, baseline: "mirrored", remoteWriteRequired: false }, assignment: { state: "persisted", value: { assignees: [] }, baseline: "mirrored", remoteWriteRequired: false } } });
    provider.pull = async (_binding, _project, context) => {
      const observed = await context.observeTaskGroups({ localTaskId: local.id, externalId: local.externalId });
      assert.equal(observed.state, "found");
      return { ...empty(), taskUpdates: [{ externalId: local.externalId, observationToken: observed.task.observationToken, groups: { content: { base: { state: "unknown" }, remote: { title: "Different remote", description: "Remote body" } } } }] };
    };
    assert.equal(await cycle(), "idle");
    assert.equal(receipt.taskResults[0].groups.content.baseline, "unproven");
    assert.equal(receipt.taskResults[0].groups.content.reason, "initialization-disagreement");
    assert.deepEqual(value(await todu.task.get(local.id)), local);
    provider.pull = async () => ({ ...empty(), tasks: [{ externalId: "new-remote", title: "Pending import", description: "Unapproved remote body" }] });
    assert.equal(await cycle(), "idle");
    assert.deepEqual(receipt.bootstrapResults[0].groups.content, { state: "deferred", reason: "pending-content-approval" });
    const imported = value(await todu.task.get(receipt.bootstrapResults[0].localTaskId));
    assert.equal(imported.descriptionApproval.state, "pendingApproval");
    const previousReceipt = receipt;
    provider.recoveryState = async () => ({ state: "legacy-pending", batchIds: ["original-v4-batch"] });
    assert.equal(await cycle(), "blocked");
    assert.equal(receipt, previousReceipt);
    assert.equal(pushes, 0);
    assert.equal(pulls, 1);
    binding = value(await todu.integration.update(binding.id, { strategy: "push" }));
    let readinessCalls = 0;
    provider.recoveryState = async () => {
      if (++readinessCalls === 2) value(await todu.task.update(local.id, { externalId: "remote-2", description: "New local body", updatedAt: local.updatedAt }));
      return { state: "ready" };
    };
    assert.equal(await cycle(), "error");
    assert.equal(pushes, 0, "Stale mixed-snapshot exports must not reach the provider");
    value(await todu.task.update(local.id, { status: "done" }));
  } finally { await todu.close(); }

  const runtime = createDaemonRuntime({ storagePath, socketPath: path.join(storagePath, "operator.sock"), assignedWorkerTypes: [], logLevel: "error" });
  let client;
  try {
    await runtime.start();
    const socketPath = runtime.config().socketPath;
    assert.ok(path.relative(directory, socketPath) && !path.relative(directory, socketPath).startsWith(".."), "Packed operator socket must stay inside disposable storage");
    client = await connect(socketPath);
    const hello = await client.request("daemon.hello", { protocolVersion: "1" });
    assert.ok(hello.capabilities.methods.includes("integration.prepareWorkflowIntent"));
    assert.ok(hello.capabilities.methods.includes("integration.confirmWorkflowIntent"));
    const baseline = await client.request("task.get", { id: local.id });
    const notes = await client.request("note.list", { filter: { entityType: "task", entityId: local.id } });
    const input = { bindingId: binding.id, localTaskId: local.id, externalId: "remote-2", intent: "cancel", reason: "confirmed-remote-deletion" };
    const preview = await client.request("integration.prepareWorkflowIntent", { input });
    assert.equal(preview.currentStatus, "done");
    const confirmed = await client.request("integration.confirmWorkflowIntent", { input: { token: preview.token, confirmed: true } });
    assert.deepEqual(await client.request("task.get", { id: local.id }), { ...baseline, status: "canceled", updatedAt: confirmed.updatedAt });
    assert.deepEqual(await client.request("note.list", { filter: { entityType: "task", entityId: local.id } }), notes);
    await assert.rejects(client.request("integration.confirmWorkflowIntent", { input: { token: preview.token, confirmed: true } }), /VALIDATION_ERROR/);
  } finally { client?.close(); await runtime.stop(); }
  return { apiVersion: 7, legacyVersionsAccepted: true, unsupportedHostRefused: true, equalityWithoutWrite: true, disagreementDeferred: true, approvalDeferred: true, legacyDrainBlocked: true, stalePushRefused: true, operatorStatusOnly: true };
}
