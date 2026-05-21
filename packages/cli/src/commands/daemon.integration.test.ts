import { type ChildProcess, execSync, spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type DaemonHandle, startDaemonForTests } from "../test-helpers/daemon-process.js";

describe("daemon CLI commands", { timeout: 30000 }, () => {
  const rootDir = path.resolve(import.meta.dirname, "../../../..");
  const cliPath = path.resolve(rootDir, "packages/cli/dist/index.js");

  let tmpDir: string;
  let homeDir: string;
  let daemon: DaemonHandle | null = null;
  let daemonRunProcess: ChildProcess | null = null;

  beforeAll(() => {
    execSync("npm run build", { cwd: rootDir, stdio: "pipe", timeout: 30000 });
  });

  afterEach(async () => {
    if (daemon) {
      await daemon.stop("test-cleanup");
      daemon = null;
    }

    if (daemonRunProcess && daemonRunProcess.exitCode === null) {
      daemonRunProcess.kill("SIGTERM");
      await waitForProcessExit(daemonRunProcess, 5000);
    }
    daemonRunProcess = null;

    if (tmpDir) {
      stopManagedDaemon(tmpDir);
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }

    if (homeDir) {
      fs.rmSync(homeDir, { recursive: true, force: true });
    }
  });

  function runCli(
    args: string[],
    options: { env?: Record<string, string>; timeoutMs?: number; launcherPath?: string } = {},
  ): {
    status: number;
    stdout: string;
    stderr: string;
  } {
    const completed = spawnSync(process.execPath, [options.launcherPath ?? cliPath, ...args], {
      cwd: rootDir,
      env: {
        ...process.env,
        TODU_CONFIG: "",
        TODU_DAEMON_SOCKET: "",
        TODU_DATA_DIR: tmpDir,
        TODU_NO_SYNC: "1",
        TODU_DAEMON_LIFECYCLE_MODE: "direct",
        HOME: homeDir,
        ...(options.env ?? {}),
      },
      encoding: "utf8",
      timeout: options.timeoutMs ?? 15000,
    });

    return {
      status: completed.status ?? -1,
      stdout: completed.stdout.trim(),
      stderr: completed.stderr.trim(),
    };
  }

  it("daemon status reports not running when daemon is unavailable", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-test-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-home-"));

    const textResult = runCli(["daemon", "status"]);
    expect(textResult.status).toBe(0);
    expect(textResult.stdout).toContain("Daemon: not running");

    const jsonResult = runCli(["--format", "json", "daemon", "status"]);
    expect(jsonResult.status).toBe(0);
    const jsonOutput = JSON.parse(jsonResult.stdout);
    expect(jsonOutput.running).toBe(false);
    expect(jsonOutput.reason).toContain("Daemon unavailable at socket");
  });

  it("daemon status reports running daemon details", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-test-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-home-"));
    daemon = await startDaemonForTests(rootDir, tmpDir);

    const textResult = runCli(["daemon", "status"]);
    expect(textResult.status).toBe(0);
    expect(textResult.stdout).toContain("Daemon: running");
    expect(textResult.stdout).toContain("State:  running");

    const jsonResult = runCli(["--format", "json", "daemon", "status"]);
    expect(jsonResult.status).toBe(0);
    const jsonOutput = JSON.parse(jsonResult.stdout);
    expect(jsonOutput.running).toBe(true);
    expect(jsonOutput.status.state).toBe("running");
    expect(jsonOutput.status.transport.path).toContain("daemon.sock");
  });

  it("daemon run starts foreground daemon process", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-run-test-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-home-"));
    const socketPath = path.join(tmpDir, "daemon.sock");

    daemonRunProcess = spawn(process.execPath, [cliPath, "daemon", "run"], {
      cwd: rootDir,
      env: {
        ...process.env,
        TODU_CONFIG: "",
        TODU_DAEMON_SOCKET: "",
        TODU_DATA_DIR: tmpDir,
        TODU_NO_SYNC: "1",
        HOME: homeDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    await waitForSocket(socketPath, daemonRunProcess, 7000);
    const daemonPid = await waitForChildProcessPid(
      daemonRunProcess.pid,
      "daemon __run-internal",
      5000,
    );
    expect(resolveProcessCwd(daemonPid)).toBe(fs.realpathSync(tmpDir));

    const jsonResult = runCli(["--format", "json", "daemon", "status"]);
    expect(jsonResult.status).toBe(0);
    const jsonOutput = JSON.parse(jsonResult.stdout);
    expect(jsonOutput.running).toBe(true);
    expect(jsonOutput.status.state).toBe("running");

    daemonRunProcess.kill("SIGTERM");
    await waitForProcessExit(daemonRunProcess, 5000);
    daemonRunProcess = null;

    const afterStopResult = runCli(["--format", "json", "daemon", "status"]);
    expect(afterStopResult.status).toBe(0);
    const afterStop = JSON.parse(afterStopResult.stdout);
    expect(afterStop.running).toBe(false);
  });

  async function expectManagedDirectLifecycle(launcherPath?: string): Promise<void> {
    const start = runCli(["daemon", "start"], { launcherPath });
    expect(start.status).toBe(0);
    expect(start.stdout).toContain("Daemon start: started managed daemon process");

    const stdoutLogPath = path.join(tmpDir, "daemon.out.log");
    const stderrLogPath = path.join(tmpDir, "daemon.err.log");
    await waitForFileContains(stdoutLogPath, '"message":"daemon process started"', 5000);
    expect(fs.existsSync(stderrLogPath)).toBe(true);
    expect(resolveProcessCwd(readManagedDaemonPid(tmpDir))).toBe(fs.realpathSync(tmpDir));

    const statusAfterStart = runCli(["--format", "json", "daemon", "status"], { launcherPath });
    expect(statusAfterStart.status).toBe(0);
    expect(JSON.parse(statusAfterStart.stdout).running).toBe(true);

    const restart = runCli(["daemon", "restart"], { launcherPath });
    expect(restart.status).toBe(0);
    expect(restart.stdout).toContain("Daemon restart: started managed daemon process");
    expect(resolveProcessCwd(readManagedDaemonPid(tmpDir))).toBe(fs.realpathSync(tmpDir));

    const statusAfterRestart = runCli(["--format", "json", "daemon", "status"], { launcherPath });
    expect(statusAfterRestart.status).toBe(0);
    expect(JSON.parse(statusAfterRestart.stdout).running).toBe(true);

    const stop = runCli(["daemon", "stop"], { launcherPath });
    expect(stop.status).toBe(0);
    expect(stop.stdout).toContain("Daemon stop: stopped managed daemon process");

    const statusAfterStop = runCli(["--format", "json", "daemon", "status"], { launcherPath });
    expect(statusAfterStop.status).toBe(0);
    expect(JSON.parse(statusAfterStop.stdout).running).toBe(false);
  }

  it("daemon start/stop/restart commands manage daemon in direct mode", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-lifecycle-test-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-home-"));

    await expectManagedDirectLifecycle();
  });

  it("daemon start works when invoked through a symlinked launcher without a js suffix", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-symlink-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-home-"));
    const launcherPath = path.join(tmpDir, "todu");
    fs.symlinkSync(cliPath, launcherPath);

    await expectManagedDirectLifecycle(launcherPath);
  });

  it("daemon start rotates oversized direct log files on startup", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-log-rotation-test-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-home-"));

    const stdoutLogPath = path.join(tmpDir, "daemon.out.log");
    const stderrLogPath = path.join(tmpDir, "daemon.err.log");
    createLargeLogFile(stdoutLogPath, "old-stdout-log");
    createLargeLogFile(stderrLogPath, "old-stderr-log");

    const start = runCli(["daemon", "start"]);
    expect(start.status).toBe(0);

    await waitForFileContains(stdoutLogPath, '"message":"daemon process started"', 5000);
    expect(fs.readFileSync(`${stdoutLogPath}.1`, "utf8")).toContain("old-stdout-log");
    expect(fs.readFileSync(`${stderrLogPath}.1`, "utf8")).toContain("old-stderr-log");
    expect(fs.readFileSync(stdoutLogPath, "utf8")).not.toContain("old-stdout-log");
  });

  it("daemon stop fails when daemon is unmanaged in direct mode", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-unmanaged-test-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-home-"));
    daemon = await startDaemonForTests(rootDir, tmpDir);

    const stop = runCli(["daemon", "stop"], {
      env: {
        TODU_DAEMON_LIFECYCLE_MODE: "direct",
      },
    });

    expect(stop.status).toBe(1);
    expect(stop.stderr).toContain("not managed by direct lifecycle wrapper");
  });

  it("daemon start returns json error output for invalid lifecycle mode", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-invalid-mode-test-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-home-"));

    const result = runCli(["--format", "json", "daemon", "start"], {
      env: {
        TODU_DAEMON_LIFECYCLE_MODE: "invalid-mode",
      },
    });

    expect(result.status).toBe(1);
    const json = JSON.parse(result.stdout);
    expect(json.ok).toBe(false);
    expect(json.message).toContain(
      "Invalid TODU_DAEMON_LIFECYCLE_MODE/TODU_DAEMON_LIFECYCLE_MODE value",
    );
  });

  it("serve command is removed", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-test-"));
    homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-home-"));

    const output = runCli(["serve"]);
    expect(output.status).toBe(1);
    expect(output.stderr).toContain("unknown command 'serve'");
  });
});

function readManagedDaemonPid(storagePath: string): number {
  const pidPath = path.join(storagePath, "daemon.pid");
  const pid = Number.parseInt(fs.readFileSync(pidPath, "utf8").trim(), 10);

  if (!Number.isInteger(pid) || pid < 1) {
    throw new Error(`Invalid managed daemon pid in ${pidPath}`);
  }

  return pid;
}

function stopManagedDaemon(storagePath: string): void {
  const pidPath = path.join(storagePath, "daemon.pid");

  if (!fs.existsSync(pidPath)) {
    return;
  }

  const rawPid = fs.readFileSync(pidPath, "utf8").trim();
  const pid = Number.parseInt(rawPid, 10);
  if (!Number.isInteger(pid) || pid < 1) {
    fs.rmSync(pidPath, { force: true });
    return;
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    fs.rmSync(pidPath, { force: true });
    return;
  }

  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    try {
      process.kill(pid, 0);
    } catch {
      fs.rmSync(pidPath, { force: true });
      return;
    }
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // best effort cleanup
  }

  fs.rmSync(pidPath, { force: true });
}

async function waitForChildProcessPid(
  parentPid: number | undefined,
  commandSubstring: string,
  timeoutMs: number,
): Promise<number> {
  if (!parentPid) {
    throw new Error("Parent process pid is unavailable");
  }

  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const child = listChildProcesses(parentPid).find((processInfo) =>
      processInfo.command.includes(commandSubstring),
    );
    if (child) {
      return child.pid;
    }

    await sleep(50);
  }

  throw new Error(`Timed out waiting for child process containing: ${commandSubstring}`);
}

function listChildProcesses(parentPid: number): Array<{ pid: number; command: string }> {
  const result = spawnSync("ps", ["-axo", "pid=,ppid=,command="], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || "failed to list child processes");
  }

  return result.stdout
    .split("\n")
    .map((line) => line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => ({
      pid: Number.parseInt(match[1], 10),
      ppid: Number.parseInt(match[2], 10),
      command: match[3],
    }))
    .filter((processInfo) => processInfo.ppid === parentPid)
    .map((processInfo) => ({ pid: processInfo.pid, command: processInfo.command }));
}

function resolveProcessCwd(pid: number): string {
  if (process.platform === "linux") {
    return fs.realpathSync(fs.readlinkSync(`/proc/${pid}/cwd`));
  }

  const result = spawnSync("lsof", ["-a", "-p", String(pid), "-d", "cwd", "-Fn"], {
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || `failed to resolve cwd for process ${pid}`);
  }

  const cwdLine = result.stdout.split("\n").find((line) => line.startsWith("n"));
  if (!cwdLine) {
    throw new Error(`cwd not found for process ${pid}`);
  }

  return fs.realpathSync(cwdLine.slice(1));
}

async function waitForSocket(socketPath: string, processHandle: ChildProcess, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (fs.existsSync(socketPath)) {
      return;
    }

    if (processHandle.exitCode !== null) {
      throw new Error(`daemon run exited early with code ${processHandle.exitCode}`);
    }

    await sleep(50);
  }

  throw new Error(`Timed out waiting for daemon socket: ${socketPath}`);
}

function createLargeLogFile(filePath: string, marker: string): void {
  const targetSizeBytes = 11 * 1024 * 1024;
  const chunk = `${marker}\n`;
  const repeated = chunk.repeat(Math.ceil(targetSizeBytes / chunk.length));
  fs.writeFileSync(filePath, repeated, "utf8");
}

async function waitForFileContains(
  filePath: string,
  expected: string,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (fs.existsSync(filePath)) {
      const contents = fs.readFileSync(filePath, "utf8");
      if (contents.includes(expected)) {
        return;
      }
    }

    await sleep(50);
  }

  throw new Error(`Timed out waiting for log output in ${filePath}`);
}

async function waitForProcessExit(processHandle: ChildProcess, timeoutMs: number): Promise<void> {
  if (processHandle.exitCode !== null) {
    return;
  }

  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      if (processHandle.exitCode === null) {
        processHandle.kill("SIGKILL");
      }
      resolve();
    }, timeoutMs);

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
