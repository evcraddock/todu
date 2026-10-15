import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { createTodu } from "@todu/engine";
import { workerPlugin } from "@todu/recurring-worker";
import { runInstalledSyncInitializationProbe } from "./installed-sync-initialization.mjs";

const directory = process.argv[2];
assert.ok(directory, "Fixture directory required");
const storagePath = path.join(directory, "storage");
const metadata = (name) => JSON.parse(fs.readFileSync(path.join(directory, "node_modules", name, "package.json"), "utf8"));
const versions = Object.fromEntries(["core", "engine", "daemon", "recurring-worker", "cli"].map((name) => [name, metadata(`@todu/${name}`).version]));
assert.equal(workerPlugin.manifest.version, versions["recurring-worker"]);
const cli = path.join(directory, "node_modules/@todu/cli/dist/index.js");
const cliCommand = pathToFileURL(path.join(directory, "node_modules/@todu/cli/dist/commands/daemon.js")).href;
const daemonEntry = import.meta.resolve("@todu/daemon", cliCommand);
assert.equal(daemonEntry, pathToFileURL(path.join(directory, "node_modules/@todu/daemon/dist/index.js")).href);
for (const name of ["core", "engine"]) assert.equal(import.meta.resolve(`@todu/${name}`, daemonEntry), pathToFileURL(path.join(directory, `node_modules/@todu/${name}/dist/index.js`)).href);
const env = { ...process.env, TODU_DAEMON_LIFECYCLE_MODE: "direct", TODU_DAEMON_SOCKET: path.join(storagePath, "daemon.sock"), TODU_DAEMON_PLUGIN_PATHS: path.join(directory, "node_modules/@todu/recurring-worker/dist/index.js"), TODU_DAEMON_ASSIGNED_WORKERS: "recurring" };
const execute = promisify(execFile);
async function command(args) {
  const result = await execute(process.execPath, [cli, ...args], { cwd: directory, env, timeout: 15_000 });
  assert.doesNotMatch(result.stderr, /forced termination|SIGKILL|UnhandledPromiseRejection/);
  return result.stdout;
}

let hostLookups = 0;
const logger = { debug() {}, info() {}, warn() {}, error() {} };
for (const capabilities of [undefined, { awaitableStop: false }]) {
  assert.throws(() => workerPlugin.createRuntime({ capabilities, config: {}, logger, getTodu() { hostLookups += 1; return null; } }), /awaitable-stop support/);
}
assert.equal(hostLookups, 0, "Unsupported hosts must be refused before accessing resources");

const seeded = await createTodu({ storagePath });
let originalTask;
let originalNote;
let template;
const catalogId = seeded.sync.getCatalogId();
try {
  const project = await seeded.project.create({ name: "Installed worker fixture" });
  assert.ok(project.ok);
  const task = await seeded.task.create({ projectId: project.value.id, title: "Retained task", description: "Retained description", status: "done" });
  assert.ok(task.ok);
  const taskBaseline = await seeded.task.get(task.value.id);
  assert.ok(taskBaseline.ok);
  originalTask = taskBaseline.value;
  const note = await seeded.note.create({ entityType: "task", entityId: originalTask.id, content: "Retained note" });
  assert.ok(note.ok);
  const noteBaseline = await seeded.note.get(note.value.id);
  assert.ok(noteBaseline.ok);
  originalNote = noteBaseline.value;
  // Local noon prevents a date boundary from producing a second occurrence mid-test.
  const now = new Date();
  const offset = 12 - now.getUTCHours();
  const timezone = offset === 0 ? "UTC" : `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`;
  const recurring = await seeded.recurring.create({ projectId: project.value.id, title: "Automatic packed occurrence", schedule: "FREQ=DAILY", startDate: now.toISOString().slice(0, 10), timezone, missPolicy: "rollForward" });
  assert.ok(recurring.ok);
  template = recurring.value;
} finally { await seeded.close(); }

async function connect(socketPath) {
  const socket = net.createConnection(socketPath);
  let sequence = 0;
  let buffer = "";
  const requests = new Map();
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const frame = JSON.parse(line);
      const pending = requests.get(frame.id);
      if (!pending) continue;
      requests.delete(frame.id);
      clearTimeout(pending.timer);
      if (frame.error) pending.reject(new Error(JSON.stringify(frame.error)));
      else pending.resolve(frame.result);
    }
  });
  socket.on("error", (error) => {
    for (const pending of requests.values()) { clearTimeout(pending.timer); pending.reject(error); }
    requests.clear();
  });
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.destroy(); reject(new Error("Installed fixture connection timed out")); }, 2_000);
    socket.once("connect", () => { clearTimeout(timer); resolve(); });
    socket.once("error", (error) => { clearTimeout(timer); reject(error); });
  });
  return {
    request(method, params = {}) {
      return new Promise((resolve, reject) => {
        const id = `installed-${++sequence}`;
        const timer = setTimeout(() => { requests.delete(id); reject(new Error(`Installed fixture RPC timed out: ${method}`)); }, 2_000);
        requests.set(id, { timer, resolve, reject });
        socket.write(`${JSON.stringify({ id, method, params })}\n`);
      });
    },
    close() { socket.destroy(); },
  };
}

let client;
let generated;
let managed = false;
const timings = {};
try {
  managed = true;
  await command(["daemon", "start"]);
  client = await connect(env.TODU_DAEMON_SOCKET);
  await client.request("events.subscribe", { events: ["data.changed"] });
  const deadline = Date.now() + 4_000;
  while (Date.now() < deadline) {
    generated = (await client.request("task.list", { filter: { projectId: template.projectId } })).filter((task) => task.templateId === template.id);
    if (generated.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  assert.equal(generated.length, 1, "Occurrence must be generated automatically, without manual generate");
  assert.equal(generated[0].title, "Automatic packed occurrence");
  const workers = await client.request("worker.status", { workerType: "recurring" });
  assert.equal(workers.workers[0].state, "running");
  const initialStatus = JSON.parse(await command(["--format", "json", "daemon", "status"]));
  assert.equal(initialStatus.running, true);
  assert.equal(initialStatus.status.healthy, true);
  assert.equal(initialStatus.status.catalog.id, catalogId);
  const pidPath = path.join(storagePath, "daemon.pid");
  const previousPid = fs.readFileSync(pidPath, "utf8");
  let started = performance.now();
  await command(["daemon", "restart"]);
  timings.restartMs = performance.now() - started;
  assert.ok(timings.restartMs < 10_000);
  assert.notEqual(fs.readFileSync(pidPath, "utf8"), previousPid);
  client.close();
  client = await connect(env.TODU_DAEMON_SOCKET);
  await client.request("events.subscribe", { events: ["data.changed"] });
  const afterRestart = (await client.request("task.list", { filter: { projectId: template.projectId } })).filter((task) => task.templateId === template.id);
  assert.deepEqual(afterRestart, generated, "Restart must not duplicate the occurrence");
  const status = JSON.parse(await command(["--format", "json", "daemon", "status"]));
  assert.equal(status.running, true);
  assert.equal(status.status.healthy, true);
  assert.equal(status.status.catalog.id, catalogId);
  client.close();
  started = performance.now();
  await command(["daemon", "stop"]);
  timings.stopMs = performance.now() - started;
  managed = false;
  assert.ok(timings.stopMs < 10_000);
  assert.equal(fs.existsSync(env.TODU_DAEMON_SOCKET), false);
  assert.equal(fs.existsSync(pidPath), false);
  assert.doesNotMatch(fs.readFileSync(path.join(storagePath, "daemon.out.log"), "utf8"), /UnhandledPromiseRejection|shutdown failed/);
  const reopened = await createTodu({ storagePath });
  try {
    assert.equal(reopened.sync.getCatalogId(), catalogId);
    const task = await reopened.task.get(originalTask.id);
    assert.ok(task.ok);
    assert.deepEqual(task.value, originalTask);
    const note = await reopened.note.get(originalNote.id);
    assert.ok(note.ok);
    assert.deepEqual(note.value, originalNote);
  } finally { await reopened.close(); }
} finally { client?.close(); if (managed) await command(["daemon", "stop"]); }
const syncInitialization = await runInstalledSyncInitializationProbe({ directory, connect });
console.log(JSON.stringify({ versions, manifestVersion: workerPlugin.manifest.version, unsupportedHostRefused: true, automaticOccurrences: generated.length, retainedHistory: true, timings, syncInitialization }));
