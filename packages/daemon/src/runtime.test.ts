import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DAEMON_CAPABILITY_EVENTS,
  DAEMON_CAPABILITY_METHODS,
  DAEMON_PROTOCOL_VERSION,
} from "./rpc.js";
import { createDaemonRuntime } from "./runtime.js";

describe("createDaemonRuntime", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-runtime-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("defaults daemon role to node in runtime config", () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    expect(runtime.config().role).toBe("node");
    expect(runtime.config().daemonVersion.length).toBeGreaterThan(0);
    expect(runtime.status().role).toBe("node");
    expect(runtime.status().state).toBe("stopped");
  });

  it("starts and reports running status with catalog id and UDS endpoint", async () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir, role: "authority" });

    const status = await runtime.start();

    expect(status.state).toBe("running");
    expect(status.role).toBe("authority");
    expect(status.startedAt).toBeDefined();
    expect(status.catalogId).toBeTruthy();
    expect(status.transport?.kind).toBe("uds");
    expect(status.transport?.path).toBe(runtime.config().socketPath);
    expect(fs.existsSync(runtime.config().socketPath)).toBe(true);

    await runtime.stop();
  });

  it("routes daemon.hello over UDS with handshake response", async () => {
    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      role: "authority",
      daemonVersion: "1.2.3",
    });

    await runtime.start();

    const response = await sendRequest(runtime.config().socketPath, {
      id: "req-1",
      method: "daemon.hello",
      params: {
        protocolVersion: DAEMON_PROTOCOL_VERSION,
      },
    });

    expect(response.id).toBe("req-1");
    expect(response.result).toEqual({
      protocolVersion: DAEMON_PROTOCOL_VERSION,
      daemonVersion: "1.2.3",
      role: "authority",
      capabilities: {
        methods: DAEMON_CAPABILITY_METHODS,
        events: [...DAEMON_CAPABILITY_EVENTS],
      },
      catalog: {
        id: runtime.status().catalogId,
      },
    });

    await runtime.stop();
  });

  it("routes daemon.ping and daemon.status over UDS", async () => {
    const runtime = createDaemonRuntime({
      storagePath: tmpDir,
      role: "authority",
      daemonVersion: "2.0.0",
    });

    await runtime.start();

    const pingResponse = await sendRequest(runtime.config().socketPath, {
      id: "ping-1",
      method: "daemon.ping",
      params: {},
    });

    expect(pingResponse.id).toBe("ping-1");
    expect(pingResponse.result).toMatchObject({
      ok: true,
    });

    if (!pingResponse.result || typeof pingResponse.result !== "object") {
      throw new Error("Expected ping result object");
    }

    const pingResult = pingResponse.result as { ts?: unknown };
    expect(typeof pingResult.ts).toBe("string");
    expect(Number.isNaN(Date.parse(pingResult.ts as string))).toBe(false);

    const statusResponse = await sendRequest(runtime.config().socketPath, {
      id: "status-1",
      method: "daemon.status",
      params: {},
    });

    const runtimeStatus = runtime.status();

    expect(statusResponse.id).toBe("status-1");
    expect(statusResponse.result).toEqual({
      protocolVersion: DAEMON_PROTOCOL_VERSION,
      daemonVersion: "2.0.0",
      role: "authority",
      state: "running",
      healthy: true,
      startedAt: runtimeStatus.startedAt,
      transport: {
        kind: "uds",
        path: runtime.config().socketPath,
        mode: runtime.config().socketMode,
      },
      catalog: {
        id: runtimeStatus.catalogId,
      },
    });

    await runtime.stop();
  });

  it("routes events.subscribe and events.unsubscribe over UDS", async () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    await runtime.start();

    const subscribeResponse = await sendRequest(runtime.config().socketPath, {
      id: "sub-1",
      method: "events.subscribe",
      params: {
        events: ["data.changed", "sync.statusChanged"],
      },
    });

    expect(subscribeResponse).toEqual({
      id: "sub-1",
      result: {
        subscribed: ["data.changed", "sync.statusChanged"],
      },
    });

    const unsupportedSubscribeResponse = await sendRequest(runtime.config().socketPath, {
      id: "sub-2",
      method: "events.subscribe",
      params: {
        events: ["unsupported.event"],
      },
    });

    expect(unsupportedSubscribeResponse.id).toBe("sub-2");
    expect(unsupportedSubscribeResponse.error).toMatchObject({
      code: "UNSUPPORTED_CAPABILITY",
    });

    // sendRequest opens a new connection per call, so this unsubscribe call
    // intentionally validates routing/shape only (not same-connection state).
    const unsubscribeResponse = await sendRequest(runtime.config().socketPath, {
      id: "unsub-1",
      method: "events.unsubscribe",
      params: {
        events: ["data.changed"],
      },
    });

    expect(unsubscribeResponse).toEqual({
      id: "unsub-1",
      result: {
        unsubscribed: [],
      },
    });

    await runtime.stop();
  });

  it("stops cleanly and clears runtime status", async () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    await runtime.start();
    const socketPath = runtime.config().socketPath;
    await runtime.stop();

    const status = runtime.status();
    expect(status.state).toBe("stopped");
    expect(status.startedAt).toBeUndefined();
    expect(status.catalogId).toBeUndefined();
    expect(status.transport).toBeUndefined();
    expect(fs.existsSync(socketPath)).toBe(false);
  });

  it("treats repeated start and stop calls as safe no-ops", async () => {
    const runtime = createDaemonRuntime({ storagePath: tmpDir });

    const firstStart = await runtime.start();
    const secondStart = await runtime.start();

    expect(secondStart.state).toBe("running");
    expect(secondStart.catalogId).toBe(firstStart.catalogId);

    await runtime.stop();
    await expect(runtime.stop()).resolves.toBeUndefined();
  });
});

function sendRequest(
  socketPath: string,
  request: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath);

    let buffer = "";

    client.setEncoding("utf8");

    client.once("error", reject);

    client.once("connect", () => {
      client.write(`${JSON.stringify(request)}\n`);
    });

    client.on("data", (chunk: string) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      if (lines.length === 0) {
        return;
      }

      const first = lines[0];
      if (!first) {
        return;
      }

      try {
        resolve(JSON.parse(first) as Record<string, unknown>);
        client.end();
      } catch (error) {
        reject(error);
      }
    });
  });
}
