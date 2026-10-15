import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import type {
  IntegrationBinding,
  Project,
  SyncWorkflowIntentPreview,
  SyncWorkflowIntentReceipt,
  TaskWithDetail,
} from "@todu/core";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ProtocolErrorFrame, ProtocolRequestFrame, ProtocolSuccessFrame } from "./protocol.js";
import { createDaemonRuntime, type DaemonRuntime } from "./runtime.js";

describe("local operator cancellation RPC", () => {
  let directory: string,
    runtime: DaemonRuntime,
    project: Project,
    binding: IntegrationBinding,
    task: TaskWithDetail;
  let sequence = 0;
  async function request<T>(
    method: string,
    params: Record<string, unknown>,
  ): Promise<ProtocolSuccessFrame<T> | ProtocolErrorFrame> {
    const frame: ProtocolRequestFrame = { id: String(++sequence), method, params };
    return new Promise((resolve, reject) => {
      const client = net.createConnection(runtime.config().socketPath);
      let buffer = "";
      client.setEncoding("utf8");
      client.setTimeout(3000, () => client.destroy(new Error("Fixture RPC timeout")));
      client.once("error", reject);
      client.once("connect", () => client.write(`${JSON.stringify(frame)}\n`));
      client.on("data", (chunk: string) => {
        buffer += chunk;
        const end = buffer.indexOf("\n");
        if (end < 0) return;
        try {
          resolve(JSON.parse(buffer.slice(0, end)) as ProtocolSuccessFrame<T> | ProtocolErrorFrame);
          client.end();
        } catch (error) {
          client.destroy();
          reject(error);
        }
      });
    });
  }
  async function call<T>(method: string, params: Record<string, unknown>): Promise<T> {
    const response = await request<T>(method, params);
    if ("error" in response) throw new Error(JSON.stringify(response.error));
    return response.result;
  }
  const prepare = () =>
    call<SyncWorkflowIntentPreview>("integration.prepareWorkflowIntent", {
      input: {
        bindingId: binding.id,
        localTaskId: task.id,
        externalId: "remote-1",
        intent: "cancel",
        reason: "confirmed-remote-deletion",
      },
    });
  beforeEach(async () => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-workflow-rpc-"));
    runtime = createDaemonRuntime({
      storagePath: directory,
      assignedWorkerTypes: [],
      logLevel: "error",
    });
    await runtime.start();
    project = await call<Project>("project.create", { input: { name: "Operator fixture" } });
    binding = await call<IntegrationBinding>("integration.create", {
      input: {
        provider: "fixture",
        projectId: project.id,
        targetKind: "repository",
        targetRef: "owner/repo",
        strategy: "pull",
        enabled: true,
      },
    });
    task = await call<TaskWithDetail>("task.create", {
      input: {
        projectId: project.id,
        title: "Retained title",
        description: "Retained body",
        labels: ["retained"],
        status: "done",
        externalId: "remote-1",
      },
    });
  });
  afterEach(async () => {
    await runtime.stop();
    fs.rmSync(directory, { recursive: true, force: true });
  });

  it("advertises the local-only methods and cancels only workflow, including a completed task", async () => {
    const hello = await call<{ capabilities: { methods: string[] } }>("daemon.hello", {
      protocolVersion: "1",
    });
    expect(hello.capabilities.methods).toContain("integration.prepareWorkflowIntent");
    const original = await call<TaskWithDetail>("task.get", { id: task.id });
    const preview = await prepare();
    expect(preview).toMatchObject({
      currentStatus: "done",
      targetStatus: "canceled",
      localTaskId: task.id,
    });
    const ordinary = await request("task.update", { id: task.id, input: { status: "canceled" } });
    expect(ordinary).toHaveProperty("error.code", "VALIDATION_ERROR");
    const receipt = await call<SyncWorkflowIntentReceipt>("integration.confirmWorkflowIntent", {
      input: { token: preview.token, confirmed: true },
    });
    const actual = await call<TaskWithDetail>("task.get", { id: task.id });
    expect(actual).toEqual({ ...original, status: "canceled", updatedAt: receipt.updatedAt });
    expect(receipt).toMatchObject({
      localTaskId: task.id,
      externalId: "remote-1",
      status: "canceled",
    });
    expect(
      await request("integration.confirmWorkflowIntent", {
        input: { token: preview.token, confirmed: true },
      }),
    ).toHaveProperty("error.code", "VALIDATION_ERROR");
  });

  it("invalidates preview after a same-clock edit and requires fresh intent after reopening", async () => {
    const preview = await prepare();
    await call("task.update", {
      id: task.id,
      input: { title: "Concurrent title", updatedAt: task.updatedAt },
    });
    expect(
      await request("integration.confirmWorkflowIntent", {
        input: { token: preview.token, confirmed: true },
      }),
    ).toHaveProperty("error.code", "VALIDATION_ERROR");
    await call("task.update", { id: task.id, input: { status: "active" } });
    const fresh = await prepare();
    expect(fresh.currentStatus).toBe("active");
    await call("integration.confirmWorkflowIntent", {
      input: { token: fresh.token, confirmed: true },
    });
    expect(await call<TaskWithDetail>("task.get", { id: task.id })).toMatchObject({
      status: "canceled",
      title: "Concurrent title",
      description: "Retained body",
    });
  });

  it("rejects missing confirmation and arbitrary fields without allowing token reuse", async () => {
    const preview = await prepare();
    expect(
      await request("integration.confirmWorkflowIntent", {
        input: { token: preview.token, confirmed: true, title: "Not allowed" },
      }),
    ).toHaveProperty("error.code", "VALIDATION_ERROR");
    expect(
      await request("integration.confirmWorkflowIntent", {
        input: { token: preview.token, confirmed: true },
      }),
    ).toHaveProperty("error.code", "VALIDATION_ERROR");
    const fresh = await prepare();
    expect(
      await request("integration.confirmWorkflowIntent", { input: { token: fresh.token } }),
    ).toHaveProperty("error.code", "VALIDATION_ERROR");
    expect((await call<TaskWithDetail>("task.get", { id: task.id })).status).toBe("done");
  });

  it("does not retain operator tokens across daemon restart", async () => {
    const preview = await prepare();
    await runtime.stop();
    await runtime.start();
    expect(
      await request("integration.confirmWorkflowIntent", {
        input: { token: preview.token, confirmed: true },
      }),
    ).toHaveProperty("error.code", "VALIDATION_ERROR");
    expect((await call<TaskWithDetail>("task.get", { id: task.id })).status).toBe("done");
  });
});
