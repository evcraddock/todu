import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type DaemonHandle, startDaemonForTests } from "../test-helpers/daemon-process.js";

describe("plugin CLI commands", () => {
  let tmpDir: string;
  let configPath: string;
  let daemon: DaemonHandle | null = null;

  const rootDir = path.resolve(import.meta.dirname, "../../../..");
  const cliPath = path.resolve(rootDir, "packages/cli/dist/index.js");

  beforeAll(() => {
    execSync("npm run build", { cwd: rootDir, stdio: "pipe", timeout: 30000 });
  });

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-plugin-test-"));
    configPath = path.join(tmpDir, "config.yaml");
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
      const result = execSync(`node ${cliPath} --config ${configPath} ${args}`, {
        cwd: rootDir,
        env: { ...process.env, TODU_DATA_DIR: tmpDir, TODUAI_NO_SYNC: "1" },
        encoding: "utf-8",
        timeout: 15000,
      });

      return result.trim();
    } catch (error: unknown) {
      if (!expectFail) {
        throw error;
      }

      const typedError = error as { stderr?: string; stdout?: string };
      return (typedError.stderr || typedError.stdout || "").trim();
    }
  }

  it("installs, lists, and removes plugins", () => {
    const pluginPath = writePluginModule(tmpDir, "github-plugin.mjs", {
      name: "github",
      version: "1.0.0",
      apiVersion: 3,
    });

    const installOutput = run(`plugin install ${pluginPath}`);
    expect(installOutput).toContain("Plugin installed: github@1.0.0");

    const listJson = run("--format json plugin list");
    const listed = JSON.parse(listJson) as Array<{
      modulePath: string;
      pluginKind: "sync-provider" | "worker-plugin" | null;
      manifest: {
        name: string;
        version: string;
        apiVersion?: number;
        worker?: { type: string };
      } | null;
      runtimeState: string;
      status: string;
    }>;

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      modulePath: pluginPath,
      pluginKind: "sync-provider",
      manifest: {
        name: "github",
        version: "1.0.0",
        apiVersion: 3,
      },
      status: "ok",
    });
    expect(["not-loaded", "running", "blocked", "error", "stopped"]).toContain(
      listed[0].runtimeState,
    );

    const removeOutput = run("plugin remove github");
    expect(removeOutput).toContain("Removed plugin: github@1.0.0");

    const listAfterRemove = run("--format json plugin list");
    expect(JSON.parse(listAfterRemove)).toEqual([]);
  });

  it("supports plugin config show, set, and clear", () => {
    const pluginPath = writePluginModule(tmpDir, "forgejo-plugin.mjs", {
      name: "forgejo",
      version: "2.1.0",
      apiVersion: 3,
    });

    run(`plugin install ${pluginPath}`);

    const initialConfigJson = run("--format json plugin config forgejo");
    expect(JSON.parse(initialConfigJson)).toEqual({
      plugin: "forgejo",
      settings: {},
    });

    run('plugin config forgejo --set \'{"repo":"acme/demo","intervalSeconds":120}\'');

    const updatedConfigJson = run("--format json plugin config forgejo");
    expect(JSON.parse(updatedConfigJson)).toEqual({
      plugin: "forgejo",
      settings: {
        repo: "acme/demo",
        intervalSeconds: 120,
      },
    });

    run("plugin config forgejo --clear");

    const clearedConfigJson = run("--format json plugin config forgejo");
    expect(JSON.parse(clearedConfigJson)).toEqual({
      plugin: "forgejo",
      settings: {},
    });
  });

  it("fails with actionable error for missing plugin removal", () => {
    const output = run("plugin remove missing-plugin", true);

    expect(output).toContain("Plugin not found: missing-plugin");
  });

  it("installs standalone worker plugins", () => {
    const pluginPath = writeWorkerPluginModule(tmpDir, "recurring-worker-plugin.mjs", {
      name: "recurring-worker",
      version: "1.0.0",
      workerType: "recurring",
    });

    const installOutput = run(`plugin install ${pluginPath}`);
    expect(installOutput).toContain("Plugin installed: recurring-worker@1.0.0");

    const listJson = run("--format json plugin list");
    const listed = JSON.parse(listJson) as Array<{
      pluginKind: "sync-provider" | "worker-plugin" | null;
      manifest: { name: string; worker?: { type: string } } | null;
      workerType: string | null;
      status: string;
    }>;

    expect(listed).toHaveLength(1);
    expect(listed[0]).toMatchObject({
      pluginKind: "worker-plugin",
      manifest: {
        name: "recurring-worker",
        worker: {
          type: "recurring",
        },
      },
      workerType: "recurring",
      status: "ok",
    });

    const removeOutput = run("plugin remove recurring-worker");
    expect(removeOutput).toContain("Removed plugin: recurring-worker@1.0.0");
  });

  it("fails install for incompatible plugin API version", () => {
    const pluginPath = writePluginModule(tmpDir, "bad-plugin.mjs", {
      name: "github",
      version: "1.0.0",
      apiVersion: 999,
    });

    const output = run(`plugin install ${pluginPath}`, true);

    expect(output).toContain("API_VERSION_MISMATCH");
  });

  it("fails config update for invalid JSON", () => {
    const pluginPath = writePluginModule(tmpDir, "config-plugin.mjs", {
      name: "github",
      version: "1.2.3",
      apiVersion: 3,
    });

    run(`plugin install ${pluginPath}`);

    const output = run('plugin config github --set "{not-json"', true);

    expect(output).toContain("invalid JSON config");
  });
});

function writePluginModule(
  directory: string,
  filename: string,
  options: {
    name: string;
    version: string;
    apiVersion: number;
  },
): string {
  const modulePath = path.join(directory, filename);

  const moduleSource = `export const syncProvider = {
  manifest: {
    name: ${JSON.stringify(options.name)},
    version: ${JSON.stringify(options.version)},
    apiVersion: ${options.apiVersion},
  },
  provider: {
    name: ${JSON.stringify(options.name)},
    version: ${JSON.stringify(options.version)},
    async initialize() {},
    async shutdown() {},
    async pull() {
      return { tasks: [], comments: [] };
    },
    async push() {
      return { commentLinks: [], taskLinks: [] };
    },
  },
};`;

  fs.writeFileSync(modulePath, moduleSource, "utf8");

  return modulePath;
}

function writeWorkerPluginModule(
  directory: string,
  filename: string,
  options: {
    name: string;
    version: string;
    workerType: string;
  },
): string {
  const modulePath = path.join(directory, filename);

  const moduleSource = `export const workerPlugin = {
  manifest: {
    name: ${JSON.stringify(options.name)},
    version: ${JSON.stringify(options.version)},
    worker: {
      type: ${JSON.stringify(options.workerType)},
      requiredDomains: ["recurring", "task"],
      roleHints: ["node"],
    },
  },
  createRuntime() {
    return {
      start() {
        return {
          stop() {},
        };
      },
    };
  },
};`;

  fs.writeFileSync(modulePath, moduleSource, "utf8");

  return modulePath;
}
