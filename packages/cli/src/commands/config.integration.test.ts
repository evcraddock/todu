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

  function run(args: string, input = "", extraEnv: Record<string, string> = {}): string {
    return execSync(`node ${cliPath} ${args}`, {
      cwd: tmpDir,
      env: {
        ...process.env,
        TODU_DATA_DIR: "",
        TODU_CONFIG: "",
        TODUAI_NO_SYNC: "1",
        ...extraEnv,
      },
      input,
      encoding: "utf-8",
      timeout: 15000,
    }).trim();
  }

  it("config init creates config and gitignore in .todu", { timeout: 30000 }, () => {
    const output = run("config init", "actor-erik\nErik\nn\n");

    const configPath = path.join(tmpDir, ".todu", "config.yaml");
    const gitignorePath = path.join(tmpDir, ".todu", ".gitignore");

    expect(fs.existsSync(configPath)).toBe(true);
    expect(fs.existsSync(gitignorePath)).toBe(true);

    const configContent = fs.readFileSync(configPath, "utf-8");
    expect(configContent).toContain("data_dir");
    expect(configContent).toContain("identity:");
    expect(configContent).toContain("id: actor-erik");
    expect(configContent).toContain("displayName: Erik");
    expect(configContent).not.toContain("sync:");

    const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
    expect(gitignoreContent).toContain("# Ignore todu data");
    expect(gitignoreContent).toContain("data/");

    expect(output).toContain("Owner actor ID:");
    expect(output).toContain("Display name:");
    expect(output).toContain("Configure a sync server? [y/N]");
    expect(output).toContain(`todu --config ${configPath} task list`);
  });

  it(
    "config init migrates legacy .toduai directory when .todu is absent",
    { timeout: 30000 },
    () => {
      const legacyDir = path.join(tmpDir, ".toduai");
      const legacyConfigPath = path.join(legacyDir, "config.yaml");
      fs.mkdirSync(legacyDir, { recursive: true });
      fs.writeFileSync(legacyConfigPath, "data_dir: ./data\n", "utf-8");

      const output = run("config init");

      const newDir = path.join(tmpDir, ".todu");
      const newConfigPath = path.join(newDir, "config.yaml");
      expect(fs.existsSync(newConfigPath)).toBe(true);
      expect(fs.existsSync(legacyDir)).toBe(false);
      expect(output).toContain(`Migrated: ${legacyDir} -> ${newDir}`);
      expect(output).toContain(`todu --config ${newConfigPath} task list`);
    },
  );

  it("config show displays resolved config", { timeout: 30000 }, () => {
    run("config init", "actor-erik\nErik\nn\n");
    const configPath = path.join(tmpDir, ".todu", "config.yaml");

    const output = run(`--config ${configPath} config show`);
    expect(output).toContain("Config file:");
    expect(output).toContain("Data dir:");
    expect(output).toContain("--config flag");
  });

  it("config init enables sync when a sync server is provided", { timeout: 30000 }, () => {
    run("config init", "actor-erik\nErik\ny\nws://localhost:3030\n");

    const configPath = path.join(tmpDir, ".todu", "config.yaml");
    const configContent = fs.readFileSync(configPath, "utf-8");

    expect(configContent).toContain("sync:");
    expect(configContent).toContain("remote:");
    expect(configContent).toContain("server: ws://localhost:3030");
    expect(configContent).toContain("enabled: true");
  });

  it("--config flag routes data to config data_dir", { timeout: 30000 }, async () => {
    run("config init", "actor-erik\nErik\nn\n");
    const configPath = path.join(tmpDir, ".todu", "config.yaml");
    const dataDir = path.join(tmpDir, ".todu", "data");

    const daemon = await startDaemonForTests(rootDir, dataDir);
    const daemonEnv = {
      TODU_DAEMON_SOCKET: path.join(dataDir, "daemon.sock"),
      TODUAI_DAEMON_SOCKET: path.join(dataDir, "daemon.sock"),
    };
    try {
      run(`--config ${configPath} project create --name "Dev Project"`, "", daemonEnv);
      const output = run(`--config ${configPath} --format json project list`, "", daemonEnv);
      const projects = JSON.parse(output);
      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe("Dev Project");
    } finally {
      await daemon.stop("test-cleanup");
    }

    expect(fs.existsSync(dataDir)).toBe(true);
  });
});
