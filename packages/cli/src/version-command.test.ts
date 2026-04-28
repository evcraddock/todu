import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { VERSION } from "./version.js";

describe("CLI version output", { timeout: 30000 }, () => {
  const rootDir = path.resolve(import.meta.dirname, "../../..");
  const cliPath = path.join(rootDir, "packages/cli/dist/index.js");
  const packageJsonPath = path.join(rootDir, "packages/cli/package.json");

  beforeAll(() => {
    execSync("npm run build", { cwd: rootDir, stdio: "pipe" });
  });

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

  it("publishes only the todu CLI bin entry", async () => {
    const packageJson = JSON.parse(await readFile(packageJsonPath, "utf-8")) as {
      bin: Record<string, string>;
    };

    expect(packageJson.bin).toEqual({
      todu: "dist/index.js",
    });
    expect(packageJson.bin).not.toHaveProperty("toduai");
  });
});
