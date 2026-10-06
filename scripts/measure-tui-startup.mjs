import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";

// Emulate terminal capabilities on pipes so Ink emits interactive frames without a PTY dependency.
const preload = `
Object.defineProperty(process.stdin, "isTTY", { value: true });
process.stdin.setRawMode = () => {};
Object.defineProperty(process.stdout, "isTTY", { value: true });
Object.defineProperty(process.stdout, "columns", { value: 100 });
Object.defineProperty(process.stdout, "rows", { value: 30 });
`;
const entrypoint = path.resolve("packages/tui/dist/index.js");
const modes = ["normal", "delayed-data", "delayed-hello", "failed-data", "absent"];

async function measure(mode, trial) {
  const dir = await mkdtemp(path.join(os.tmpdir(), "ts-"));
  const socketPath = path.join(dir, "daemon.sock");
  const timings = {};
  const timers = new Set();
  const sockets = new Set();
  let start;
  let socketFailure;
  const elapsed = () => Math.round(performance.now() - start);
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.on("error", (error) => {
      socketFailure = error;
      child?.kill();
    });
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines.filter(Boolean)) {
        const request = JSON.parse(line);
        timings[request.method] ??= elapsed();
        const frame = { id: request.id };
        if (request.method === "daemon.hello") {
          frame.result = { protocolVersion: "1", daemonVersion: "fixture" };
        } else if (request.method === "events.subscribe") {
          frame.result = { subscribed: ["data.changed", "sync.statusChanged"] };
        } else if (request.method === "task.list") {
          if (mode === "failed-data") {
            frame.error = { code: "TIMEOUT", message: "Fixture timeout" };
          } else {
            frame.result = [];
          }
        } else {
          throw new Error(`Unexpected fixture request: ${request.method}`);
        }
        const delayed =
          (mode === "delayed-data" && request.method === "task.list") ||
          (mode === "delayed-hello" && request.method === "daemon.hello");
        const timer = setTimeout(() => {
          timers.delete(timer);
          if (!socket.destroyed) socket.write(`${JSON.stringify(frame)}\n`);
          timings[`${request.method}.response`] ??= elapsed();
        }, delayed ? 1000 : 0);
        timers.add(timer);
      }
    });
  });
  let child;
  let timeout;
  try {
    if (mode !== "absent") {
      await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(socketPath, resolve);
      });
    }
    start = performance.now();
    child = spawn(
      process.execPath,
      ["--import", `data:text/javascript,${encodeURIComponent(preload)}`, entrypoint],
      {
        env: {
          ...process.env,
          TODU_DAEMON_SOCKET: socketPath,
          NO_COLOR: "1",
          CI: "false",
        },
        stdio: ["pipe", "pipe", "pipe"],
      },
    );
    let output = "";
    let stderr = "";
    let quit = false;
    let timedOut = false;
    timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 5000);
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.stdout.on("data", (chunk) => {
      output += chunk;
      const markers = {
        startupFrame: "Starting Todu TUI",
        shellFrame: "All Projects",
        connectingFrame: "Connecting to daemon",
        loadingFrame: "loading",
        loadingBody: "Loading tasks from local daemon",
        emptyFrame: "No tasks.",
        readyFrame: "Home • ready",
        failureFrame: "Tasks unavailable",
        absentFrame: "Daemon unavailable",
      };
      for (const [key, text] of Object.entries(markers)) {
        if (output.includes(text)) timings[key] ??= elapsed();
      }
      if (
        timings["task.list.response"] !== undefined &&
        chunk.toString().includes("No tasks.")
      ) {
        timings.loadedFrame ??= elapsed();
      }
      const complete =
        mode === "failed-data"
          ? timings.failureFrame
          : mode === "absent"
            ? timings.absentFrame
            : timings.loadedFrame;
      if (complete !== undefined && !quit) {
        quit = true;
        child.stdin.write("q");
      }
    });
    const exit = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("exit", (code, signal) => resolve({ code, signal }));
    });
    if (socketFailure) throw new Error(`Fixture socket failed (${mode})`, { cause: socketFailure });
    if (timedOut || exit.code !== 0) {
      throw new Error(`TUI fixture failed (${mode}): ${JSON.stringify(exit)} ${stderr}`);
    }
    if (timings.startupFrame === undefined) throw new Error(`Missing startup feedback (${mode})`);
    if (
      mode === "delayed-data" &&
      (timings.loadingBody === undefined ||
        timings.emptyFrame < timings["task.list.response"] ||
        timings.readyFrame < timings["task.list.response"])
    ) {
      throw new Error("Initial task loading was not represented truthfully");
    }
    if (mode === "delayed-hello" && timings["task.list"] < timings["daemon.hello.response"]) {
      throw new Error("Task request started before handshake completed");
    }
    if (
      mode === "failed-data" &&
      (timings.emptyFrame !== undefined || timings.readyFrame !== undefined)
    ) {
      throw new Error("Failed task request was represented as empty or ready");
    }
    return { mode, trial, timings };
  } finally {
    clearTimeout(timeout);
    if (child && child.exitCode === null && child.signalCode === null) child.kill();
    for (const timer of timers) clearTimeout(timer);
    for (const socket of sockets) socket.destroy();
    if (server.listening) await new Promise((resolve) => server.close(resolve));
    await rm(dir, { recursive: true });
  }
}

async function measureLocalData() {
  const { createTodu } = await import("../packages/engine/dist/index.js");
  const dir = await mkdtemp(path.join(os.tmpdir(), "todu-startup-data-"));
  let todu;
  const unwrap = (result) => {
    if (!result.ok) throw new Error(`Fixture operation failed: ${JSON.stringify(result.error)}`);
    return result.value;
  };
  try {
    todu = await createTodu({ storagePath: dir });
    for (let projectIndex = 0; projectIndex < 10; projectIndex += 1) {
      const project = unwrap(await todu.project.create({ name: `Fixture ${projectIndex}` }));
      for (let taskIndex = 0; taskIndex < 20; taskIndex += 1) {
        unwrap(
          await todu.task.create({
            projectId: project.id,
            title: `Fixture task ${taskIndex}`,
            description: "Fixture description ".repeat(50),
          }),
        );
      }
    }
    await todu.close();
    todu = undefined;
    for (let trial = 1; trial <= 3; trial += 1) {
      let start = performance.now();
      todu = await createTodu({ storagePath: dir });
      const openMs = performance.now() - start;
      start = performance.now();
      const tasks = unwrap(await todu.task.list({ status: ["active", "inprogress", "waiting"] }));
      const firstListMs = performance.now() - start;
      start = performance.now();
      unwrap(await todu.task.list({ status: ["active", "inprogress", "waiting"] }));
      const warmListMs = performance.now() - start;
      console.log(
        JSON.stringify({
          mode: "local-data",
          trial,
          projects: 10,
          tasks: tasks.length,
          openMs,
          firstListMs,
          warmListMs,
          remoteSync: false,
        }),
      );
      await todu.close();
      todu = undefined;
    }
  } finally {
    if (todu) await todu.close();
    await rm(dir, { recursive: true });
  }
}

for (const mode of modes) {
  for (let trial = 1; trial <= 3; trial += 1) {
    console.log(JSON.stringify(await measure(mode, trial)));
  }
}
await measureLocalData();
