import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

interface DaemonHandle {
  stop(reason?: string): Promise<void>;
}

describe("task CLI commands", () => {
  let tmpDir: string;
  let daemon: DaemonHandle | null = null;
  const rootDir = path.resolve(__dirname, "../../../..");
  const cliPath = path.resolve(rootDir, "packages/cli/dist/index.js");

  beforeAll(() => {
    execSync("npm run build", { cwd: rootDir, stdio: "pipe", timeout: 30000 });
  });

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-task-test-"));
    daemon = await startDaemon(rootDir, tmpDir);
  });

  afterEach(async () => {
    if (daemon) {
      await daemon.stop("test-cleanup");
      daemon = null;
    }

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run(args: string, expectFail = false): string {
    try {
      const result = execSync(`node ${cliPath} ${args}`, {
        cwd: rootDir,
        env: { ...process.env, TODUAI_DATA_DIR: tmpDir, TODUAI_NO_SYNC: "1" },
        encoding: "utf-8",
        timeout: 15000,
      });
      return result.trim();
    } catch (e: unknown) {
      if (expectFail) {
        const err = e as { stderr?: string; stdout?: string };
        return (err.stderr || err.stdout || "").trim();
      }
      throw e;
    }
  }

  it("task create → list → show → update → move → search → delete flow", { timeout: 30000 }, () => {
    // Create a project first
    const projJson = run('--format json project create --name "My App"');
    const proj = JSON.parse(projJson);

    // Create task
    const createOutput = run(
      `task create --title "Fix login bug" --project "${proj.id}" --priority high --description "Users can't log in"`,
    );
    expect(createOutput).toContain("Task created:");
    expect(createOutput).toContain("Fix login bug");
    expect(createOutput).toContain("high");

    // Create task JSON
    const taskJson = run(
      `--format json task create --title "Add signup" --project "My App" --label feature`,
    );
    const task = JSON.parse(taskJson);
    expect(task.title).toBe("Add signup");
    expect(task.id).toMatch(/^task-/);
    expect(task.labels).toContain("feature");

    // List
    const listOutput = run("task list");
    expect(listOutput).toContain("Fix login bug");
    expect(listOutput).toContain("Add signup");

    // List with filter
    const highOnly = run("--format json task list --priority high");
    const highTasks = JSON.parse(highOnly);
    expect(highTasks).toHaveLength(1);
    expect(highTasks[0].title).toBe("Fix login bug");

    // List by project name
    const byProject = run(`--format json task list --project "My App"`);
    expect(JSON.parse(byProject)).toHaveLength(2);

    // Show
    const showOutput = run(`task show ${task.id}`);
    expect(showOutput).toContain("Add signup");
    expect(showOutput).toContain(task.id);

    // Update
    const updateOutput = run(
      `task update ${task.id} --status inprogress --title "Add signup flow"`,
    );
    expect(updateOutput).toContain("Task updated:");
    expect(updateOutput).toContain("Add signup flow");
    expect(updateOutput).toContain("inprogress");

    // Search
    const searchOutput = run("task search login");
    expect(searchOutput).toContain("Fix login bug");

    const searchJson = run('--format json task search "signup"');
    const searchResults = JSON.parse(searchJson);
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0].title).toBe("Add signup flow");

    // Move to a new project
    run('--format json project create --name "Archive"');
    const moveOutput = run(`task move ${task.id} "Archive"`);
    expect(moveOutput).toContain("Moved task to Archive:");

    // Verify moved
    const archiveTasks = run('--format json task list --project "Archive"');
    expect(JSON.parse(archiveTasks)).toHaveLength(1);

    const appTasks = run('--format json task list --project "My App"');
    expect(JSON.parse(appTasks)).toHaveLength(1); // only the login bug remains

    // Delete
    const deleteOutput = run(`task delete ${task.id}`);
    expect(deleteOutput).toContain("Deleted task:");

    // Verify deletion
    const afterDelete = run('--format json task list --project "Archive"');
    expect(JSON.parse(afterDelete)).toHaveLength(0);
  });

  it("status shortcuts: start, done, cancel", { timeout: 30000 }, () => {
    // Create project and task
    run('project create --name "Test"');
    const taskJson = run('--format json task create --title "Shortcut test" --project "Test"');
    const task = JSON.parse(taskJson);

    // Start
    const startOut = run(`task start ${task.id}`);
    expect(startOut).toContain("inprogress");

    // Done
    const doneOut = run(`task done ${task.id}`);
    expect(doneOut).toContain("done");

    // Reopen then cancel
    run(`task update ${task.id} --status active`);
    const cancelOut = run(`task cancel ${task.id}`);
    expect(cancelOut).toContain("canceled");
  });

  it("multi-status filter and sort", { timeout: 30000 }, () => {
    run('project create --name "Filter"');
    run('--format json task create --title "Alpha" --project "Filter" --priority low');
    const tJson = run(
      '--format json task create --title "Bravo" --project "Filter" --priority high',
    );
    const t = JSON.parse(tJson);
    run(`task start ${t.id}`);

    // Multi-status filter
    const multi = run('--format json task list --status "active,inprogress"');
    const parsed = JSON.parse(multi);
    expect(parsed).toHaveLength(2);

    // Sort by title asc
    const sorted = run("--format json task list --sort title --asc");
    const sortedParsed = JSON.parse(sorted);
    expect(sortedParsed[0].title).toBe("Alpha");
    expect(sortedParsed[1].title).toBe("Bravo");
  });

  it("handles errors gracefully", () => {
    // Show nonexistent task
    const showErr = run("task show task-nonexistent", true);
    expect(showErr).toContain("not found");

    // Create task in nonexistent project
    const createErr = run('task create --title "Test" --project "Nope"', true);
    expect(createErr).toContain("not found");
  });
});

async function startDaemon(rootDir: string, storagePath: string): Promise<DaemonHandle> {
  const daemonEntrypoint = path.resolve(rootDir, "packages/daemon/dist/entrypoint.js");
  const socketPath = path.join(storagePath, "daemon.sock");
  const daemonProcess = spawn("node", [daemonEntrypoint], {
    cwd: rootDir,
    env: { ...process.env, TODUAI_DATA_DIR: storagePath },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  daemonProcess.stderr?.on("data", (chunk: Buffer) => {
    stderr += chunk.toString();
  });

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (fs.existsSync(socketPath)) {
      return {
        stop: async () => {
          await stopProcess(daemonProcess);
        },
      };
    }

    if (daemonProcess.exitCode !== null) {
      throw new Error(`Daemon exited early with code ${daemonProcess.exitCode}: ${stderr}`);
    }

    await sleep(50);
  }

  throw new Error(`Timed out waiting for daemon socket: ${socketPath}\n${stderr}`);
}

async function stopProcess(processHandle: ReturnType<typeof spawn>): Promise<void> {
  if (processHandle.exitCode !== null) {
    return;
  }

  processHandle.kill("SIGTERM");

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (processHandle.exitCode === null) {
        processHandle.kill("SIGKILL");
      }
      resolve();
    }, 3000);

    processHandle.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
