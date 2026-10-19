import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WebSocket } from "ws";
import { startWebSocketHeartbeat } from "./websocket-heartbeat.js";

function fixture(open = true) {
  const socket = Object.assign(new EventEmitter(), {
    OPEN: 1,
    readyState: open ? 1 : 0,
    ping: vi.fn(
      (_data: Buffer, _mask: boolean | undefined, _callback: (error?: Error) => void) => {},
    ),
    terminate: vi.fn(() => {
      socket.readyState = 3;
      socket.emit("close");
    }),
  });
  const failure = vi.fn();
  const stop = startWebSocketHeartbeat(socket as unknown as WebSocket, failure);
  return { socket, failure, stop };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("outbound WebSocket heartbeat", () => {
  it("terminates a silently lost connection after a bounded pong deadline", () => {
    const { socket, failure } = fixture();
    vi.advanceTimersByTime(5_000);
    expect(socket.ping).toHaveBeenCalledOnce();
    expect(socket.terminate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5_000);
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(failure).toHaveBeenCalledWith("WebSocket heartbeat pong timed out");
    expect(vi.getTimerCount()).toBe(0);
    expect(socket.eventNames()).toEqual([]);
  });

  it("keeps an idle but responsive peer connected across repeated probes", () => {
    const { socket, failure, stop } = fixture();
    for (let cycle = 0; cycle < 5; cycle++) {
      vi.advanceTimersByTime(5_000);
      const payload = socket.ping.mock.lastCall![0];
      socket.emit("pong", payload);
    }
    expect(socket.ping).toHaveBeenCalledTimes(5);
    expect(socket.terminate).not.toHaveBeenCalled();
    expect(failure).not.toHaveBeenCalled();
    stop();
    expect(vi.getTimerCount()).toBe(0);
    expect(socket.eventNames()).toEqual([]);
  });

  it("does not accept an unsolicited or previous probe's pong as proof of liveness", () => {
    const { socket } = fixture();
    vi.advanceTimersByTime(5_000);
    const first = socket.ping.mock.lastCall![0];
    socket.emit("pong", first);
    vi.advanceTimersByTime(5_000);
    socket.emit("pong", first);
    socket.emit("pong", Buffer.from("unrelated pong"));
    vi.advanceTimersByTime(5_000);
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("starts only when the handshake opens and cleans timers on normal closure", () => {
    const { socket, failure } = fixture(false);
    vi.advanceTimersByTime(20_000);
    expect(vi.getTimerCount()).toBe(0);
    socket.readyState = 1;
    socket.emit("open");
    vi.advanceTimersByTime(5_000);
    expect(socket.ping).toHaveBeenCalledOnce();
    socket.readyState = 3;
    socket.emit("close");
    vi.advanceTimersByTime(20_000);
    expect(vi.getTimerCount()).toBe(0);
    expect(failure).not.toHaveBeenCalled();
    expect(socket.terminate).not.toHaveBeenCalled();
    expect(socket.eventNames()).toEqual([]);
  });

  it("cancels a pending deadline on disposal and ignores late ping errors", () => {
    const { socket, failure, stop } = fixture();
    vi.advanceTimersByTime(5_000);
    const callback = socket.ping.mock.lastCall![2];
    stop();
    stop();
    callback(new Error("late failure"));
    vi.advanceTimersByTime(20_000);
    expect(vi.getTimerCount()).toBe(0);
    expect(failure).not.toHaveBeenCalled();
    expect(socket.terminate).not.toHaveBeenCalled();
    expect(socket.eventNames()).toEqual([]);
  });

  it.each(["callback", "throw"])("retires and reports a failed ping (%s)", (mode) => {
    const { socket, failure } = fixture();
    socket.ping.mockImplementation((_data, _mask, callback) => {
      if (mode === "throw") throw new Error("cannot send");
      callback(new Error("cannot send"));
    });
    vi.advanceTimersByTime(5_000);
    expect(socket.terminate).toHaveBeenCalledOnce();
    expect(failure).toHaveBeenCalledWith(expect.stringContaining("cannot send"));
    expect(vi.getTimerCount()).toBe(0);
  });

  it("leaves browser sockets without control frames unchanged", () => {
    const socket = { close: vi.fn() };
    const stop = startWebSocketHeartbeat(socket as unknown as WebSocket, vi.fn());
    vi.advanceTimersByTime(20_000);
    stop();
    expect(socket.close).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
