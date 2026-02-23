import { execSync, spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

interface DaemonHandle {
  stop(reason?: string): Promise<void>;
}

describe("config CLI commands", () => {
  let tmpDir: string;
  const rootDir = path.resolve(__dirname, "../../../..");
  const cliPath = path.resolve(rootDir, "packages/cli/dist/index.js");

  beforeAll(() => {
    execSync("npm run build", { cwd: rootDir, stdio: "pipe", timeout: 30000 });
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-config-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run(args: string): string {
    return execSync(`node ${cliPath} ${args}`, {
      cwd: tmpDir,
      env: { ...process.env, TODUAI_DATA_DIR: "", TODUAI_CONFIG: "", TODUAI_NO_SYNC: "1" },
      encoding: "utf-8",
      timeout: 15000,
    }).trim();
  }

  it("config init creates config and gitignore", { timeout: 30000 }, () => {
    run("config init");

    const configPath = path.join(tmpDir, ".toduai", "config.yaml");
    const gitignorePath = path.join(tmpDir, ".toduai", ".gitignore");

    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.existsSync(gitignorePath)).toBe(true);

    const configContent = fs.readFileSync(configPath, "utf-8");
    expect(configContent).toContain("data_dir");

    const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
    expect(gitignoreContent).toContain("data/");
  });

  it("config show displays resolved config", { timeout: 30000 }, () => {
    run("config init");
    const configPath = path.join(tmpDir, ".toduai", "config.yaml");

    const output = run(`--config ${configPath} config show`);
    expect(output).toContain("Config file:");
    expect(output).toContain("Data dir:");
    expect(output).toContain("--config flag");
  });

  it("--config flag routes data to config data_dir", { timeout: 30000 }, async () => {
    run("config init");
    const configPath = path.join(tmpDir, ".toduai", "config.yaml");
    const dataDir = path.join(tmpDir, ".toduai", "data");

    const daemon = await startDaemon(rootDir, dataDir);
    try {
      // Create a project using the dev config
      run(`--config ${configPath} project create --name "Dev Project"`);
      const output = run(`--config ${configPath} --format json project list`);
      const projects = JSON.parse(output);
      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe("Dev Project");
    } finally {
      await daemon.stop("test-cleanup");
    }

    // Data should be in .toduai/data/
    expect(fs.existsSync(dataDir)).toBe(true);
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
