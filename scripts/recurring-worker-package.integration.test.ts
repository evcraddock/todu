import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rootDir = path.resolve(import.meta.dirname, "..");

describe("packed recurring-worker version", () => {
  it("reports the packed metadata version without source files or dependencies", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "todu-worker-pack-"));
    try {
      const home = path.join(directory, "home");
      mkdirSync(home);
      const env = {
        ...process.env,
        HOME: home,
        XDG_CONFIG_HOME: path.join(directory, "config"),
        XDG_DATA_HOME: path.join(directory, "data"),
        npm_config_cache: path.join(directory, "npm-cache"),
      };
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
});
