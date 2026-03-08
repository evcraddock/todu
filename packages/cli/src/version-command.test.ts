import { execSync } from "node:child_process";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { VERSION } from "./version.js";

describe("CLI version output", { timeout: 30000 }, () => {
  const rootDir = path.resolve(import.meta.dirname, "../../..");
  const cliPath = path.join(rootDir, "packages/cli/dist/index.js");

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
});
