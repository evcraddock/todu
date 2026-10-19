import type { WebSocket } from "ws";

const HEARTBEAT_INTERVAL_MS = 5_000;
const PONG_TIMEOUT_MS = 5_000;

/** Probe idle Node WebSockets without changing the native replication protocol. */
export function startWebSocketHeartbeat(
  socket: WebSocket,
  onFailure: (message: string) => void,
): () => void {
  // Browser WebSockets do not expose control frames; daemon transports use Node's `ws`.
  if (typeof socket.ping !== "function") return () => {};

  let interval: ReturnType<typeof setInterval> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let pending: Buffer | undefined;
  let sequence = 0;
  let stopped = false;

  const stop = (): void => {
    stopped = true;
    clearInterval(interval);
    clearTimeout(deadline);
    socket.off("open", start);
    socket.off("close", stop);
    socket.off("pong", onPong);
  };
  const fail = (message: string): void => {
    if (stopped) return;
    stop();
    try {
      onFailure(message);
    } finally {
      // A close handshake cannot retire a half-open connection in bounded time.
      socket.terminate();
    }
  };
  const onPong = (data: Buffer): void => {
    if (!pending || !pending.equals(data)) return;
    pending = undefined;
    clearTimeout(deadline);
    deadline = undefined;
  };
  const probe = (): void => {
    if (socket.readyState !== socket.OPEN || pending) return;
    pending = Buffer.from(`todu-heartbeat-${++sequence}`);
    deadline = setTimeout(() => fail("WebSocket heartbeat pong timed out"), PONG_TIMEOUT_MS);
    deadline.unref();
    try {
      socket.ping(pending, undefined, (error?: Error) => {
        if (error) fail(`WebSocket heartbeat ping failed: ${error.message}`);
      });
    } catch (error) {
      fail(`WebSocket heartbeat ping failed: ${String(error)}`);
    }
  };
  function start(): void {
    if (stopped || interval) return;
    interval = setInterval(probe, HEARTBEAT_INTERVAL_MS);
    interval.unref();
  }
  socket.on("open", start);
  socket.on("close", stop);
  socket.on("pong", onPong);
  if (socket.readyState === socket.OPEN) start();
  return stop;
}
