import { execSync, spawnSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { VERSION } from "./version.js";

describe("CLI version output", { timeout: 30000 }, () => {
  const rootDir = path.resolve(import.meta.dirname, "../../..");
  const cliPath = path.join(rootDir, "packages/cli/dist/index.js");
  const packageJsonPath = path.join(rootDir, "packages/cli/package.json");

  it("prints only the version token", () => {
    const output = execSync(`node ${cliPath} --version`, {
      cwd: rootDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    expect(output).toBe(VERSION);
  });

  it("uses todu as the primary command name in help output", () => {
    const output = execSync(`node ${cliPath} --help`, {
      cwd: rootDir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    expect(output).toContain("Usage: todu");
  });

  it.each([
    { args: ["--unknown-option"], message: "unknown option '--unknown-option'" },
    { args: ["task", "show"], message: "missing required argument 'id'" },
  ])("rejects invalid arguments: $args", ({ args, message }) => {
    const result = spawnSync(process.execPath, [cliPath, ...args], {
      cwd: rootDir,
      encoding: "utf-8",
      timeout: 10000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stdout).toBe("");
    expect(result.stderr).toContain(message);
  });

  it("publishes only the todu CLI bin entry", async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8")) as {
      bin: Record<string, string>;
    };

    expect(packageJson.bin).toEqual({
      todu: "dist/index.js",
    });
  });
});
