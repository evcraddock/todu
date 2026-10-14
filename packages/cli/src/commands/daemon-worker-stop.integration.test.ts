import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import net, { type Socket } from "node:net";
import os from "node:os";
import path from "node:path";
import type { Note, RecurringTemplate, Task } from "@todu/core";
import { createTodu } from "@todu/engine";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("direct lifecycle with active plugins and subscribed clients", () => {
  const root = path.resolve(import.meta.dirname, "../../../..");
  const cli = path.join(root, "packages/cli/dist/index.js");
  let directory: string;
  let release: string;
  let env: NodeJS.ProcessEnv;
  let started: boolean;
  let clients: Socket[];
  let commands: Set<ChildProcess>;

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-worker-stop-"));
    release = path.join(directory, "release-pull");
    clients = [];
    commands = new Set();
    started = false;
    const inherited = Object.fromEntries(
      Object.entries(process.env).filter(([key]) => !key.startsWith("TODU_")),
    );
    env = {
      ...inherited,
      HOME: path.join(directory, "home"),
      XDG_CONFIG_HOME: path.join(directory, "config"),
      XDG_DATA_HOME: path.join(directory, "xdg-data"),
      TODU_CONFIG: path.join(directory, "config.yaml"),
      TODU_DATA_DIR: path.join(directory, "storage"),
      TODU_DAEMON_SOCKET: path.join(directory, "storage/daemon.sock"),
      TODU_SYNC_ENABLED: "false",
      TODU_DAEMON_LIFECYCLE_MODE: "direct",
    };
    for (const key of ["HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "TODU_DATA_DIR"])
      fs.mkdirSync(env[key]!, { recursive: true });
    fs.writeFileSync(env.TODU_CONFIG!, "sync:\n  remote:\n    enabled: false\n");
  });

  function run(args: string[]): Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
  }> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [cli, ...args], {
        cwd: directory,
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      commands.add(child);
      let stdout = "";
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        stdout += chunk.toString();
      });
      child.stderr.on("data", (chunk: Buffer) => {
        stderr += chunk.toString();
      });
      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        reject(new Error(`Fixture CLI command exceeded its deadline: ${args.join(" ")}`));
      }, 15_000);
      child.once("error", (error) => {
        clearTimeout(timer);
        commands.delete(child);
        reject(error);
      });
      child.once("close", (code, signal) => {
        clearTimeout(timer);
        commands.delete(child);
        resolve({ code, signal, stdout, stderr });
      });
    });
  }

  afterEach(async () => {
    for (const client of clients) client.destroy();
    fs.writeFileSync(release, "released");
    try {
      if (started) {
        const stop = await run(["daemon", "stop"]);
        expect(stop.code, stop.stderr).toBe(0);
      }
      expect(commands.size).toBe(0);
      fs.rmSync(directory, { recursive: true });
    } finally {
      for (const command of commands) command.kill("SIGTERM");
    }
  });

  async function subscribe(): Promise<void> {
    const socket = net.createConnection({ path: env.TODU_DAEMON_SOCKET! });
    clients.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    socket.setEncoding("utf8");
    let buffer = "";
    const response = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Fixture subscription timed out")), 2_000);
      socket.on("data", (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const frame = JSON.parse(line) as { id?: string; error?: unknown };
          if (frame.id === "fixture-subscribe") {
            clearTimeout(timer);
            if (frame.error) reject(new Error(JSON.stringify(frame.error)));
            else resolve();
          }
        }
      });
    });
    socket.write(
      `${JSON.stringify({ id: "fixture-subscribe", method: "events.subscribe", params: { events: ["data.changed"] } })}\n`,
    );
    await response;
  }

  it("waits for active pull/cleanup, restarts naturally, and retains data with the source recurring worker", async () => {
    const seeded = await createTodu({ storagePath: env.TODU_DATA_DIR!, remoteSync: undefined });
    let originalTask: Task;
    let originalNote: Note;
    let templateId: RecurringTemplate["id"];
    const catalogId = seeded.sync.getCatalogId();
    try {
      const project = await seeded.project.create({ name: "Lifecycle retained project" });
      if (!project.ok) throw new Error(project.error.message);
      const task = await seeded.task.create({
        projectId: project.value.id,
        title: "Retained task",
        description: "Retained description",
        status: "done",
      });
      if (!task.ok) throw new Error(task.error.message);
      originalTask = task.value;
      const note = await seeded.note.create({
        entityType: "task",
        entityId: task.value.id,
        content: "Retained note",
      });
      if (!note.ok) throw new Error(note.error.message);
      originalNote = note.value;
      const binding = await seeded.integration.create({
        provider: "direct-stop",
        projectId: project.value.id,
        targetKind: "repository",
        targetRef: "fixture/local",
        enabled: true,
        strategy: "pull",
      });
      if (!binding.ok) throw new Error(binding.error.message);
      // Anchor at local noon so midnight cannot generate a second occurrence mid-test.
      const now = new Date();
      const offset = 12 - now.getUTCHours();
      const timezone = offset === 0 ? "UTC" : `Etc/GMT${offset > 0 ? "-" : "+"}${Math.abs(offset)}`;
      const template = await seeded.recurring.create({
        projectId: project.value.id,
        title: "Generated fixture task",
        schedule: "FREQ=DAILY",
        timezone,
        startDate: now.toISOString().slice(0, 10),
        missPolicy: "rollForward",
      });
      if (!template.ok) throw new Error(template.error.message);
      templateId = template.value.id;
    } finally {
      await seeded.close();
    }

    const trace = path.join(directory, "provider.trace");
    const plugin = path.join(directory, "provider.mjs");
    fs.writeFileSync(
      plugin,
      `import fs from "node:fs";
      function record(event) { fs.appendFileSync(${JSON.stringify(trace)}, event + "\\n"); }
      export const syncProvider = {
        manifest: { name: "direct-stop", version: "1.0.0", apiVersion: 4 },
        provider: {
          name: "direct-stop", version: "1.0.0",
          async initialize() { record("initialize"); },
          async pull() {
            record("pull-entered");
            while (!fs.existsSync(${JSON.stringify(release)})) await new Promise((resolve) => setTimeout(resolve, 20));
            record("pull-completed");
            return { tasks: [], comments: [], checkpoint: "fixture" };
          },
          async acknowledgePull() { record("acknowledged"); },
          async push() { return { taskLinks: [], commentLinks: [] }; },
          async shutdown() {
            record("shutdown-entered");
            await new Promise((resolve) => setTimeout(resolve, 180));
            record("shutdown-completed");
          },
        },
      };`,
    );
    env.TODU_DAEMON_PLUGIN_PATHS = `${plugin},${path.join(root, "packages/recurring-worker/dist/index.js")}`;
    env.TODU_DAEMON_ASSIGNED_WORKERS = "direct-stop-sync,recurring";
    const log = path.join(env.TODU_DATA_DIR!, "daemon.out.log");
    const startedAt = performance.now();
    started = true;
    const start = await run(["daemon", "start"]);
    expect(start.code, start.stderr).toBe(0);
    await vi.waitFor(
      () =>
        expect(fs.existsSync(trace) && fs.readFileSync(trace, "utf8")).toContain("pull-entered"),
      { timeout: 5_000 },
    );
    await subscribe();
    const statusAt = performance.now();
    const status = await run(["--format", "json", "daemon", "status"]);
    const firstStatus = JSON.parse(status.stdout);
    expect(firstStatus).toMatchObject({
      running: true,
      status: { healthy: true, catalog: { id: catalogId } },
    });
    console.info(
      "DIRECT_STARTUP_TIMING",
      JSON.stringify({
        spawnToStatusMs: performance.now() - startedAt,
        statusCommandMs: performance.now() - statusAt,
      }),
    );

    const previousPid = fs.readFileSync(path.join(env.TODU_DATA_DIR!, "daemon.pid"), "utf8").trim();
    const restartingAt = performance.now();
    const restarting = run(["daemon", "restart"]);
    await vi.waitFor(
      () => expect(fs.readFileSync(log, "utf8")).toContain("daemon runtime stop requested"),
      { timeout: 5_000 },
    );
    expect(fs.readFileSync(log, "utf8")).not.toContain('"message":"daemon process stopped"');
    fs.writeFileSync(release, "released");
    const restart = await restarting;
    expect(restart.code, restart.stderr).toBe(0);
    expect(restart.stdout).toContain("started managed daemon process");
    expect(restart.stderr).not.toMatch(/forced termination|SIGKILL/);
    expect(performance.now() - restartingAt).toBeLessThan(10_000);
    expect(fs.readFileSync(path.join(env.TODU_DATA_DIR!, "daemon.pid"), "utf8").trim()).not.toBe(
      previousPid,
    );
    expect(fs.readFileSync(trace, "utf8")).toContain("shutdown-completed");
    const after = await run(["--format", "json", "daemon", "status"]);
    expect(JSON.parse(after.stdout)).toMatchObject({
      running: true,
      status: { healthy: true, catalog: { id: catalogId } },
    });
    console.info(
      "DIRECT_RESTART_TIMING",
      JSON.stringify({ restartCommandMs: performance.now() - restartingAt }),
    );
    await subscribe();
    await vi.waitFor(
      () =>
        expect(
          fs
            .readFileSync(trace, "utf8")
            .split("\n")
            .filter((event) => event === "pull-completed"),
        ).toHaveLength(2),
      { timeout: 5_000 },
    );
    for (const client of clients) client.destroy();
    const stop = await run(["daemon", "stop"]);
    expect(stop.code, stop.stderr).toBe(0);
    expect(stop.stdout).toContain("stopped managed daemon process");
    expect(stop.stderr).not.toMatch(/forced termination|SIGKILL/);
    started = false;
    expect(fs.existsSync(env.TODU_DAEMON_SOCKET!)).toBe(false);
    expect(fs.existsSync(path.join(env.TODU_DATA_DIR!, "daemon.pid"))).toBe(false);
    const traceEvents = fs.readFileSync(trace, "utf8").trim().split("\n");
    expect(traceEvents.filter((event) => event === "shutdown-completed")).toHaveLength(2);
    expect(fs.readFileSync(log, "utf8")).not.toMatch(/UnhandledPromiseRejection|shutdown failed/);
    const reopened = await createTodu({ storagePath: env.TODU_DATA_DIR! });
    try {
      expect(reopened.sync.getCatalogId()).toBe(catalogId);
      const task = await reopened.task.get(originalTask.id);
      expect(task.ok && task.value).toEqual(originalTask);
      const note = await reopened.note.get(originalNote.id);
      expect(note.ok && note.value).toEqual(originalNote);
      const tasks = await reopened.task.list();
      expect(tasks.ok && tasks.value.filter((item) => item.templateId === templateId)).toEqual([
        expect.objectContaining({ title: "Generated fixture task" }),
      ]);
    } finally {
      await reopened.close();
    }
  }, 25_000);
});
