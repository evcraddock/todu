import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { pathToFileURL } from "node:url";

async function until(predicate, timeout = 5_000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    assert(Date.now() < deadline, "Installed socket probe did not settle");
    await sleep(5);
  }
}

async function within(promise, timeout = 3_000) {
  let timer;
  try {
    return await Promise.race([promise, new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("Installed client did not exit naturally")), timeout);
    })]);
  } finally { clearTimeout(timer); }
}

export async function runInstalledReplicationSocketProbe({ directory }) {
  const engineDirectory = path.join(directory, "node_modules/@todu/engine");
  const compiledHelper = path.join(engineDirectory, "dist/sync-client.js");
  assert(fs.realpathSync(compiledHelper).startsWith(fs.realpathSync(path.join(directory, "node_modules")) + path.sep));
  const require = createRequire(pathToFileURL(path.join(engineDirectory, "package.json")));
  const { WebSocketServer } = require("ws");
  const { isSyncServerAvailable } = await import(pathToFileURL(compiledHelper).href);
  const server = http.createServer();
  const websocketServer = new WebSocketServer({ noServer: true });
  const sockets = new Set();
  const pending = [];
  let attempts = 0;
  let held = true;
  let child;
  let exit;
  let stderr = "";
  const errors = [];
  let result;
  server.on("connection", (socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
  });
  server.on("upgrade", (request, socket, head) => {
    socket.on("end", () => socket.end());
    socket.resume();
    attempts++;
    const accept = () => {
      if (socket.destroyed) return;
      websocketServer.handleUpgrade(request, socket, head, (ws) => websocketServer.emit("connection", ws, request));
    };
    if (held) pending.push(accept);
    else accept();
  });
  try {
    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    assert(address && typeof address !== "string");
    const url = `ws://127.0.0.1:${address.port}`;
    assert.equal(await isSyncServerAvailable(url, 100), false);
    await until(() => sockets.size === 0, 1_000);
    const initialAttempts = attempts;
    child = spawn(process.execPath, [path.join(directory, "replication-socket-client.mjs"), url, directory], {
      cwd: directory,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    exit = new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("exit", (code, signal) => resolve({ code, signal }));
    });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    const phases = new Map();
    child.on("message", (message) => {
      if (message && typeof message === "object" && "phase" in message) phases.set(message.phase, message);
    });
    await until(() => attempts >= initialAttempts + 4);
    held = false;
    for (const accept of pending.splice(0)) accept();
    await until(() => phases.has("connected"));
    assert.equal(phases.get("connected").installed, true);
    assert.equal(phases.get("connected").helper, pathToFileURL(compiledHelper).href);
    child.send("stop");
    assert.deepEqual(await within(exit), { code: 0, signal: null }, stderr);
    assert(phases.has("shutdown-returned"));
    assert.equal(server.listening, true, "Independent peer must remain available until natural client exit");
    await until(() => sockets.size === 0, 1_000);
    const stoppedAttempts = attempts;
    await sleep(200);
    assert.equal(attempts, stoppedAttempts);
    assert.equal(sockets.size, 0);
    assert.equal(websocketServer.clients.size, 0);
    result = { compiledEngineVersion: JSON.parse(fs.readFileSync(path.join(engineDirectory, "package.json"), "utf8")).version, packedModulesOnly: true, delayedAttempts: attempts - initialAttempts, retainedSockets: 0, naturalExit: true, independentPeerListening: true, probeTimeoutCleaned: true };
  } catch (error) { errors.push(error); }
  const cleanups = [
    async () => {
      // Only a failed fixture is terminated; it cannot satisfy the success assertions.
      if (child && exit && child.exitCode === null && child.signalCode === null) {
        child.kill("SIGKILL");
        await within(exit);
      }
    },
    async () => {
      for (const ws of websocketServer.clients) ws.terminate();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => websocketServer.close(() => resolve()));
    },
    async () => { await new Promise((resolve) => server.close(() => resolve())); },
  ];
  for (const cleanup of cleanups) {
    try { await cleanup(); } catch (error) { errors.push(error); }
  }
  if (errors.length === 1) throw errors[0];
  if (errors.length > 1) throw new AggregateError(errors, "Installed replication probe failed");
  return result;
}
