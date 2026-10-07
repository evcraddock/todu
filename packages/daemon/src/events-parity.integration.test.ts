import fs from "node:fs";
import net, { type Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import type { Todu } from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { startTestSyncServer } from "../../../scripts/test-helpers/sync-server.js";
import { createDaemonRuntime, type DaemonRuntime } from "./runtime.js";

describe("daemon event parity", () => {
  let tmpDir: string;
  let runtime: DaemonRuntime | undefined;
  let relay: Todu | undefined;
  let client: JsonLineClient | undefined;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-daemon-events-"));
  });

  afterEach(async () => {
    try {
      try {
        await client?.close();
      } finally {
        try {
          await runtime?.stop();
        } finally {
          await relay?.close();
        }
      }
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } finally {
      client = undefined;
      runtime = undefined;
      relay = undefined;
    }
  });

  it("emits data.changed for RPC domain mutations", async () => {
    runtime = createDaemonRuntime({ storagePath: tmpDir });
    await runtime.start();
    client = await connectJsonLineClient(runtime.config().socketPath);

    client.send({
      id: "sub-data-changed",
      method: "events.subscribe",
      params: {
        events: ["data.changed"],
      },
    });

    const subscribeResponse = await client.nextFrame();
    expect(subscribeResponse).toEqual({
      id: "sub-data-changed",
      result: {
        subscribed: ["data.changed"],
      },
    });

    client.send({
      id: "project-create-for-event",
      method: "project.create",
      params: {
        input: {
          name: "Event Project",
        },
      },
    });

    const frames = await client.collectUntil((collected) => {
      const hasResponse = collected.some((frame) => frame.id === "project-create-for-event");
      const hasEvent = collected.some((frame) => frame.event === "data.changed");
      return hasResponse && hasEvent;
    }, 2000);

    const mutationResponse = frames.find((frame) => frame.id === "project-create-for-event");
    expect(mutationResponse?.result).toMatchObject({
      name: "Event Project",
    });

    const eventFrame = frames.find((frame) => frame.event === "data.changed");
    expect(eventFrame).toEqual(
      expect.objectContaining({
        event: "data.changed",
        payload: {
          catalog: {
            id: runtime.status().catalogId,
          },
        },
      }),
    );
  });

  it("emits sync.statusChanged on sync.stop and sync.start transitions", async () => {
    const started = await startTestSyncServer(path.join(tmpDir, "relay"));
    relay = started.server;
    runtime = createDaemonRuntime({
      storagePath: path.join(tmpDir, "runtime"),
      remoteSync: { server: started.url },
    });
    await runtime.start();
    client = await connectJsonLineClient(runtime.config().socketPath);

    client.send({
      id: "sub-sync-status",
      method: "events.subscribe",
      params: {
        events: ["sync.statusChanged"],
      },
    });

    const subscribeResponse = await client.nextFrame();
    expect(subscribeResponse).toEqual({
      id: "sub-sync-status",
      result: {
        subscribed: ["sync.statusChanged"],
      },
    });

    client.send({
      id: "sync-stop-for-event",
      method: "sync.stop",
      params: {},
    });

    const stopFrames = await client.collectUntil((collected) => {
      const hasResponse = collected.some((frame) => frame.id === "sync-stop-for-event");
      const hasDisconnectedEvent = collected.some(
        (frame) =>
          frame.event === "sync.statusChanged" &&
          (frame.payload as { remote?: { state?: string } } | undefined)?.remote?.state ===
            "disconnected",
      );
      return hasResponse && hasDisconnectedEvent;
    }, 5000);

    expect(stopFrames.some((frame) => frame.id === "sync-stop-for-event")).toBe(true);

    client.send({
      id: "sync-start-for-event",
      method: "sync.start",
      params: {},
    });

    const startFrames = await client.collectUntil((collected) => {
      const hasResponse = collected.some((frame) => frame.id === "sync-start-for-event");
      const hasConnectedEvent = collected.some(
        (frame) =>
          frame.event === "sync.statusChanged" &&
          (frame.payload as { remote?: { state?: string } } | undefined)?.remote?.state ===
            "connected",
      );
      return hasResponse && hasConnectedEvent;
    }, 5000);

    expect(startFrames.some((frame) => frame.id === "sync-start-for-event")).toBe(true);
  });
});

interface JsonLineClient {
  send(frame: Record<string, unknown>): void;
  nextFrame(timeoutMs?: number): Promise<Record<string, unknown>>;
  collectUntil(
    predicate: (frames: Array<Record<string, unknown>>) => boolean,
    timeoutMs?: number,
  ): Promise<Array<Record<string, unknown>>>;
  close(): Promise<void>;
}

async function connectJsonLineClient(socketPath: string): Promise<JsonLineClient> {
  const client = net.createConnection(socketPath);
  client.setEncoding("utf8");

  await waitForConnect(client);

  const queuedFrames: Array<Record<string, unknown>> = [];
  const waiters: Array<(frame: Record<string, unknown>) => void> = [];

  let buffer = "";
  client.on("data", (chunk: string) => {
    buffer += chunk;

    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        continue;
      }

      const frame = JSON.parse(trimmed) as Record<string, unknown>;
      const waiter = waiters.shift();
      if (waiter) {
        waiter(frame);
      } else {
        queuedFrames.push(frame);
      }
    }
  });

  async function nextFrame(timeoutMs = 1000): Promise<Record<string, unknown>> {
    if (queuedFrames.length > 0) {
      return queuedFrames.shift() ?? {};
    }

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        const index = waiters.indexOf(onFrame);
        if (index >= 0) {
          waiters.splice(index, 1);
        }
        reject(new Error("Timed out waiting for frame"));
      }, timeoutMs);

      const onFrame = (frame: Record<string, unknown>) => {
        clearTimeout(timeout);
        resolve(frame);
      };

      waiters.push(onFrame);
    });
  }

  return {
    send(frame: Record<string, unknown>) {
      client.write(`${JSON.stringify(frame)}\n`);
    },
    nextFrame,
    async collectUntil(
      predicate: (frames: Array<Record<string, unknown>>) => boolean,
      timeoutMs = 2000,
    ): Promise<Array<Record<string, unknown>>> {
      const started = Date.now();
      const frames: Array<Record<string, unknown>> = [];

      while (Date.now() - started < timeoutMs) {
        const remaining = timeoutMs - (Date.now() - started);
        const frame = await nextFrame(Math.max(remaining, 1));
        frames.push(frame);
        if (predicate(frames)) {
          return frames;
        }
      }

      throw new Error("Timed out collecting expected frames");
    },
    close() {
      return new Promise((resolve) => {
        client.end(() => resolve());
      });
    },
  };
}

function waitForConnect(socket: Socket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.once("connect", () => {
      socket.off("error", reject);
      resolve();
    });
  });
}
