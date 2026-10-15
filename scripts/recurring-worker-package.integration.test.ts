import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(import.meta.dirname, "..");

function fixtureEnv(directory: string): NodeJS.ProcessEnv {
  const inherited = Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !key.startsWith("TODU_") && !["NPM_TOKEN", "NODE_AUTH_TOKEN"].includes(key),
    ),
  );
  const home = path.join(directory, "home");
  mkdirSync(home);
  return {
    ...inherited,
    HOME: home,
    XDG_CONFIG_HOME: path.join(directory, "config"),
    XDG_DATA_HOME: path.join(directory, "xdg-data"),
    TODU_CONFIG: path.join(directory, "config.yaml"),
    TODU_DATA_DIR: path.join(directory, "storage"),
    TODU_SYNC_ENABLED: "false",
    npm_config_cache: path.join(directory, "npm-cache"),
    npm_config_userconfig: path.join(directory, "npmrc"),
    npm_config_registry: "https://registry.npmjs.org",
  };
}

describe("packed recurring-worker version", () => {
  it("reports the packed metadata version without source files or dependencies", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "todu-worker-pack-"));
    try {
      const env = fixtureEnv(directory);
      const output = execFileSync(
        "npm",
        [
          "pack",
          "./packages/recurring-worker",
          "--json",
          "--ignore-scripts",
          "--pack-destination",
          directory,
        ],
        { cwd: rootDir, env, encoding: "utf8", timeout: 30_000 },
      );
      const [packed] = JSON.parse(output) as { filename: string }[];
      execFileSync("tar", ["-xzf", path.join(directory, packed.filename), "-C", directory], {
        env,
        timeout: 10_000,
      });
      const outputVersion = execFileSync(
        process.execPath,
        [
          "--input-type=module",
          "-e",
          'import { readFileSync } from "node:fs"; import { workerPlugin } from "./package/dist/index.js"; const metadata = JSON.parse(readFileSync("./package/package.json", "utf8")); console.log(JSON.stringify({ reported: workerPlugin.manifest.version, expected: metadata.version }));',
        ],
        { cwd: directory, env, encoding: "utf8", timeout: 10_000 },
      );
      const versions = JSON.parse(outputVersion) as { reported: string; expected: string };
      expect(versions.reported).toBe(versions.expected);
    } finally {
      rmSync(directory, { recursive: true });
    }
  }, 60_000);

  it("installs packed release dependencies and automatically generates/persists an occurrence across natural restart", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "todu-worker-install-"));
    try {
      const env = fixtureEnv(directory);
      const packages = ["core", "engine", "daemon", "recurring-worker"];
      const versions: Record<string, string> = { cli: "0.25.2" };
      const archives = packages.map((name) => {
        const manifest = JSON.parse(
          readFileSync(path.join(rootDir, "packages", name, "package.json"), "utf8"),
        ) as { version: string };
        versions[name] = manifest.version;
        const output = execFileSync(
          "npm",
          [
            "pack",
            `./packages/${name}`,
            "--json",
            "--ignore-scripts",
            "--pack-destination",
            directory,
          ],
          { cwd: rootDir, env, encoding: "utf8", timeout: 30_000 },
        );
        const [packed] = JSON.parse(output) as { filename: string }[];
        return path.join(directory, packed.filename);
      });
      // Normal installation must execute the engine's required Repo teardown repair.
      execFileSync(
        "npm",
        ["install", "--save-exact", "--no-audit", "--no-fund", "@todu/cli@0.25.2", ...archives],
        { cwd: directory, env, encoding: "utf8", timeout: 60_000 },
      );
      const probe = path.join(directory, "installed-probe.mjs");
      copyFileSync(
        path.join(rootDir, "scripts/test-helpers/installed-recurring-worker.mjs"),
        probe,
      );
      copyFileSync(
        path.join(rootDir, "scripts/test-helpers/installed-sync-initialization.mjs"),
        path.join(directory, "installed-sync-initialization.mjs"),
      );
      for (const name of ["installed-replication-sockets.mjs", "replication-socket-client.mjs"]) {
        copyFileSync(path.join(rootDir, "scripts/test-helpers", name), path.join(directory, name));
      }
      const output = execFileSync(
        process.execPath,
        ["--experimental-import-meta-resolve", probe, directory],
        { cwd: directory, env, encoding: "utf8", timeout: 20_000 },
      );
      expect(JSON.parse(output)).toMatchObject({
        versions,
        manifestVersion: versions["recurring-worker"],
        unsupportedHostRefused: true,
        automaticOccurrences: 1,
        retainedHistory: true,
        replicationSockets: {
          compiledEngineVersion: versions.engine,
          packedModulesOnly: true,
          retainedSockets: 0,
          naturalExit: true,
          independentPeerListening: true,
          probeTimeoutCleaned: true,
        },
        syncInitialization: {
          apiVersion: 7,
          legacyVersionsAccepted: true,
          unsupportedHostRefused: true,
          equalityWithoutWrite: true,
          disagreementDeferred: true,
          approvalDeferred: true,
          legacyDrainBlocked: true,
          stalePushRefused: true,
          operatorStatusOnly: true,
        },
      });
    } finally {
      rmSync(directory, { recursive: true });
    }
  }, 120_000);
});
