import { type ChildProcess, execSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { type DaemonHandle, startDaemonForTests } from "../test-helpers/daemon-process.js";

describe("daemon CLI commands", { timeout: 30000 }, () => {
  const rootDir = path.resolve(import.meta.dirname, "../../../..");
  const cliPath = path.resolve(rootDir, "packages/cli/dist/index.js");

  let tmpDir: string;
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
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  function run(args: string, expectFail = false): string {
    try {
      return execSync(`node ${cliPath} ${args}`, {
        cwd: rootDir,
        env: { ...process.env, TODUAI_DATA_DIR: tmpDir, TODUAI_NO_SYNC: "1" },
        encoding: "utf-8",
        timeout: 15000,
      }).trim();
    } catch (e: unknown) {
      if (expectFail) {
        const err = e as { stderr?: string; stdout?: string };
        return (err.stderr || err.stdout || "").trim();
      }
      throw e;
    }
  }

  it("daemon status reports not running when daemon is unavailable", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-test-"));

    const textOutput = run("daemon status");
    expect(textOutput).toContain("Daemon: not running");

    const jsonOutput = JSON.parse(run("--format json daemon status"));
    expect(jsonOutput.running).toBe(false);
    expect(jsonOutput.reason).toContain("Daemon unavailable at socket");
  });

  it("daemon status reports running daemon details", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-test-"));
    daemon = await startDaemonForTests(rootDir, tmpDir);

    const textOutput = run("daemon status");
    expect(textOutput).toContain("Daemon: running");
    expect(textOutput).toContain("State:  running");

    const jsonOutput = JSON.parse(run("--format json daemon status"));
    expect(jsonOutput.running).toBe(true);
    expect(jsonOutput.status.state).toBe("running");
    expect(jsonOutput.status.transport.path).toContain("daemon.sock");
  });

  it("daemon run starts foreground daemon process", async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-run-test-"));
    const socketPath = path.join(tmpDir, "daemon.sock");

    daemonRunProcess = spawn("node", [cliPath, "daemon", "run"], {
      cwd: rootDir,
      env: { ...process.env, TODUAI_DATA_DIR: tmpDir, TODUAI_NO_SYNC: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    await waitForSocket(socketPath, daemonRunProcess, 7000);

    const jsonOutput = JSON.parse(run("--format json daemon status"));
    expect(jsonOutput.running).toBe(true);
    expect(jsonOutput.status.state).toBe("running");

    daemonRunProcess.kill("SIGTERM");
    await waitForProcessExit(daemonRunProcess, 5000);
    daemonRunProcess = null;

    const afterStop = JSON.parse(run("--format json daemon status"));
    expect(afterStop.running).toBe(false);
  });

  it("serve command is removed", () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-daemon-test-"));

    const output = run("serve", true);
    expect(output).toContain("unknown command 'serve'");
  });
});

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
