import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
  createDaemonConnection,
  DAEMON_PROTOCOL_VERSION,
  type DaemonConnectionSnapshot,
  type DaemonSocket,
} from "./connection.js";

class FakeSocket extends EventEmitter implements DaemonSocket {
  readonly writes: string[] = [];
  destroyed = false;

  setEncoding(_encoding: BufferEncoding): this {
    return this;
  }

  write(payload: string): boolean {
    this.writes.push(payload);
    return true;
  }

  end(): this {
    return this;
  }

  destroy(_error?: Error): this {
    this.destroyed = true;
    return this;
  }
}

function readLastRequest(socket: FakeSocket): { id: string; method: string } {
  const payload = socket.writes.at(-1);
  if (!payload) {
    throw new Error("Expected socket write");
  }

  const parsed = JSON.parse(payload.trim()) as Record<string, unknown>;
  if (typeof parsed.id !== "string" || typeof parsed.method !== "string") {
    throw new Error("Expected request id and method");
  }

  return { id: parsed.id, method: parsed.method };
}

function sendSuccess(socket: FakeSocket, id: string, result: Record<string, unknown>): void {
  socket.emit("data", `${JSON.stringify({ id, result })}\n`);
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("TUI daemon connection", () => {
  it("connects and runs daemon.hello", async () => {
    const socket = new FakeSocket();
    const states: DaemonConnectionSnapshot[] = [];
    const connection = createDaemonConnection({
      socketPath: "/tmp/todu.sock",
      connect: () => socket,
      requestIdFactory: () => "hello-1",
    });

    connection.subscribe((snapshot) => states.push(snapshot));
    connection.start();
    socket.emit("connect");
    await flushPromises();

    const helloRequest = readLastRequest(socket);
    expect(helloRequest.method).toBe("daemon.hello");

    sendSuccess(socket, helloRequest.id, {
      protocolVersion: DAEMON_PROTOCOL_VERSION,
      daemonVersion: "1.2.3",
    });
    await flushPromises();

    expect(connection.getSnapshot()).toMatchObject({
      state: "connected",
      hello: { protocolVersion: DAEMON_PROTOCOL_VERSION, daemonVersion: "1.2.3" },
    });
    expect(states.map((state) => state.state)).toContain("connecting");

    connection.stop();
  });

  it("reports failed state and schedules capped reconnect after connect failure", async () => {
    vi.useFakeTimers();
    const sockets = [new FakeSocket(), new FakeSocket(), new FakeSocket()];
    let connectCount = 0;
    const states: DaemonConnectionSnapshot[] = [];
    const connection = createDaemonConnection({
      socketPath: "/tmp/missing.sock",
      reconnectBackoffMs: [10, 20],
      connect: () => sockets[connectCount++] ?? new FakeSocket(),
    });

    connection.subscribe((snapshot) => states.push(snapshot));
    connection.start();
    sockets[0].emit("error", Object.assign(new Error("missing socket"), { code: "ENOENT" }));
    await flushPromises();

    expect(connection.getSnapshot()).toMatchObject({
      state: "failed",
      reconnectAttempt: 1,
      reconnectDelayMs: 10,
    });

    await vi.advanceTimersByTimeAsync(10);
    sockets[1].emit("error", Object.assign(new Error("still missing"), { code: "ENOENT" }));
    await flushPromises();

    expect(connection.getSnapshot()).toMatchObject({
      state: "failed",
      reconnectAttempt: 2,
      reconnectDelayMs: 20,
    });

    await vi.advanceTimersByTimeAsync(20);
    sockets[2].emit("error", Object.assign(new Error("still missing"), { code: "ENOENT" }));
    await flushPromises();

    expect(connection.getSnapshot()).toMatchObject({
      state: "failed",
      reconnectAttempt: 3,
      reconnectDelayMs: 20,
    });
    expect(states.some((state) => state.error?.message.includes("Daemon unavailable"))).toBe(true);

    connection.stop();
    vi.useRealTimers();
  });

  it("times out daemon.hello requests", async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const connection = createDaemonConnection({
      socketPath: "/tmp/todu.sock",
      connect: () => socket,
      requestTimeoutMs: 25,
      reconnectBackoffMs: [100],
    });

    connection.start();
    socket.emit("connect");
    await flushPromises();

    expect(readLastRequest(socket).method).toBe("daemon.hello");

    await vi.advanceTimersByTimeAsync(25);
    await flushPromises();

    expect(connection.getSnapshot()).toMatchObject({
      state: "failed",
      error: { code: "TIMEOUT" },
      reconnectDelayMs: 100,
    });

    connection.stop();
    vi.useRealTimers();
  });

  it("dispatches daemon event frames to event subscribers", async () => {
    const socket = new FakeSocket();
    const events: unknown[] = [];
    const connection = createDaemonConnection({
      socketPath: "/tmp/todu.sock",
      connect: () => socket,
      requestIdFactory: () => "hello-event",
    });

    connection.subscribeEvents((event) => events.push(event));
    connection.start();
    socket.emit("connect");
    await flushPromises();
    sendSuccess(socket, readLastRequest(socket).id, { protocolVersion: DAEMON_PROTOCOL_VERSION });
    await flushPromises();

    socket.emit(
      "data",
      `${JSON.stringify({ event: "data.changed", payload: { type: "catalog" }, ts: "now" })}\n`,
    );
    await flushPromises();

    expect(events).toEqual([{ event: "data.changed", payload: { type: "catalog" }, ts: "now" }]);

    connection.stop();
  });

  it("transitions through disconnected to reconnecting when a connected socket closes", async () => {
    vi.useFakeTimers();
    const socket = new FakeSocket();
    const states: DaemonConnectionSnapshot[] = [];
    const connection = createDaemonConnection({
      socketPath: "/tmp/todu.sock",
      connect: () => socket,
      reconnectBackoffMs: [50],
      requestIdFactory: () => "hello-close",
    });

    connection.subscribe((snapshot) => states.push(snapshot));
    connection.start();
    socket.emit("connect");
    await flushPromises();
    sendSuccess(socket, readLastRequest(socket).id, { protocolVersion: DAEMON_PROTOCOL_VERSION });
    await flushPromises();

    socket.emit("close");
    await flushPromises();

    expect(states.map((state) => state.state)).toEqual(
      expect.arrayContaining(["connected", "disconnected", "reconnecting"]),
    );
    expect(connection.getSnapshot()).toMatchObject({
      state: "reconnecting",
      reconnectDelayMs: 50,
    });

    connection.stop();
    vi.useRealTimers();
  });
});
