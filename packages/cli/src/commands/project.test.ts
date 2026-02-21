import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * CLI integration test — builds then runs the actual CLI binary.
 * Uses TODUAI_DATA_DIR env var to isolate storage.
 */
describe("project CLI commands", () => {
  let tmpDir: string;
  const rootDir = path.resolve(__dirname, "../../../..");
  const cliPath = path.resolve(rootDir, "packages/cli/dist/index.js");

  beforeAll(() => {
    // Build all packages before running CLI tests
    execSync("npm run build", { cwd: rootDir, stdio: "pipe", timeout: 30000 });
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run(args: string, expectFail = false): string {
    try {
      const result = execSync(`node ${cliPath} ${args}`, {
        cwd: rootDir,
        env: { ...process.env, TODUAI_DATA_DIR: tmpDir, TODUAI_NO_SYNC: "1" },
        encoding: "utf-8",
        timeout: 15000,
      });
      return result.trim();
    } catch (e: unknown) {
      if (expectFail) {
        const err = e as { stderr?: string; stdout?: string };
        return (err.stderr || err.stdout || "").trim();
      }
      throw e;
    }
  }

  it("project create → list → show → update → delete flow", { timeout: 30000 }, () => {
    // Create
    const createOutput = run('project create --name "Test Project" --priority high');
    expect(createOutput).toContain("Project created:");
    expect(createOutput).toContain("Test Project");
    expect(createOutput).toContain("high");

    // Create JSON
    const createJson = run('--format json project create --name "JSON Project"');
    const created = JSON.parse(createJson);
    expect(created.name).toBe("JSON Project");
    expect(created.id).toMatch(/^proj-/);

    // List
    const listOutput = run("project list");
    expect(listOutput).toContain("Test Project");
    expect(listOutput).toContain("JSON Project");

    // List JSON
    const listJson = run("--format json project list");
    const projects = JSON.parse(listJson);
    expect(projects).toHaveLength(2);

    // Show by ID
    const showOutput = run(`project show ${created.id}`);
    expect(showOutput).toContain("JSON Project");
    expect(showOutput).toContain(created.id);

    // Show by name
    const showByName = run('project show "Test Project"');
    expect(showByName).toContain("Test Project");

    // Update
    const updateOutput = run(`project update ${created.id} --name "Updated Project" --status done`);
    expect(updateOutput).toContain("Project updated:");
    expect(updateOutput).toContain("Updated Project");
    expect(updateOutput).toContain("done");

    // Verify update in list
    const afterUpdate = run("--format json project list --status done");
    const doneProjects = JSON.parse(afterUpdate);
    expect(doneProjects).toHaveLength(1);
    expect(doneProjects[0].name).toBe("Updated Project");

    // Delete
    const deleteOutput = run(`project delete ${created.id}`);
    expect(deleteOutput).toContain("Deleted project:");

    // Verify deletion
    const afterDelete = run("--format json project list");
    const remaining = JSON.parse(afterDelete);
    expect(remaining).toHaveLength(1);
    expect(remaining[0].name).toBe("Test Project");
  });

  it("handles errors gracefully", () => {
    // Show nonexistent
    const showErr = run("project show nonexistent", true);
    expect(showErr).toContain("not found");
  });

  it("list returns 'No results.' when empty", () => {
    const output = run("project list");
    expect(output).toBe("No results.");
  });
});
