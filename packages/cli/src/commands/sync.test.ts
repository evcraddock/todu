import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type DaemonHandle, startDaemonForTests } from "../test-helpers/daemon-process.js";

describe("sync CLI commands", () => {
  let tmpDir: string;
  let daemon: DaemonHandle | null = null;
  const rootDir = path.resolve(__dirname, "../../../..");
  const cliPath = path.resolve(rootDir, "packages/cli/dist/index.js");

  beforeAll(() => {
    execSync("npm run build", { cwd: rootDir, stdio: "pipe", timeout: 30000 });
  });

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-sync-test-"));
    daemon = await startDaemonForTests(rootDir, tmpDir);
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
      return execSync(`node ${cliPath} ${args}`, {
        cwd: rootDir,
        env: { ...process.env, TODUAI_DATA_DIR: tmpDir, TODUAI_CONFIG: "", TODUAI_NO_SYNC: "1" },
        encoding: "utf-8",
        timeout: 15000,
      }).trim();
    } catch (e: unknown) {
      if (!expectFail) {
        throw e;
      }

      const err = e as { stderr?: string; stdout?: string };
      return (err.stderr || err.stdout || "").trim();
    }
  }

  it("sync status shows standalone mode in text format", () => {
    const output = run("sync status");
    expect(output).toContain("standalone");
    expect(output).toContain("disconnected");
  });

  it("sync status shows standalone mode in JSON format", () => {
    const output = run("sync status --format json");
    const status = JSON.parse(output);
    expect(status.local.mode).toBe("standalone");
    expect(status.remote.state).toBe("disconnected");
  });

  it("fails fast when daemon is unavailable", async () => {
    if (daemon) {
      await daemon.stop("unavailable-test");
      daemon = null;
    }

    const output = run("sync status", true);
    expect(output).toContain("local daemon is required but unavailable");
  });
});
