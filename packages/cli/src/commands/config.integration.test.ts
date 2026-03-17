import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { startDaemonForTests } from "../test-helpers/daemon-process.js";

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
    const output = run("config init");

    const configPath = path.join(tmpDir, ".toduai", "config.yaml");
    const gitignorePath = path.join(tmpDir, ".toduai", ".gitignore");

    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.existsSync(gitignorePath)).toBe(true);

    const configContent = fs.readFileSync(configPath, "utf-8");
    expect(configContent).toContain("data_dir");

    const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
    expect(gitignoreContent).toContain("# Ignore todu data");
    expect(gitignoreContent).toContain("data/");

    expect(output).toContain(`todu --config ${configPath} task list`);
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

    const daemon = await startDaemonForTests(rootDir, dataDir);
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
