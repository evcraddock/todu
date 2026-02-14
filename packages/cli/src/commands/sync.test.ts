import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("sync CLI commands", () => {
  let tmpDir: string;
  const rootDir = path.resolve(__dirname, "../../../..");
  const cliPath = path.resolve(rootDir, "packages/cli/dist/index.js");

  beforeAll(() => {
    execSync("npm run build", { cwd: rootDir, stdio: "pipe", timeout: 30000 });
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-sync-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run(args: string): string {
    return execSync(`node ${cliPath} ${args}`, {
      cwd: tmpDir,
      env: { ...process.env, TODU_DATA_DIR: tmpDir, TODU_CONFIG: "", TODU_NO_SYNC: "1" },
      encoding: "utf-8",
      timeout: 15000,
    }).trim();
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
});
