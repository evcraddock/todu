import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DaemonHandle, startDaemonForTests } from "../test-helpers/daemon-process.js";

describe("habit CLI commands", { timeout: 30000 }, () => {
  const rootDir = path.resolve(import.meta.dirname, "../../../..");
  const cliPath = path.join(rootDir, "packages/cli/dist/index.js");
  let tmpDir: string;
  let daemon: DaemonHandle | null = null;

  beforeAll(async () => {
    execSync("npm run build", { cwd: rootDir, stdio: "pipe" });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-habit-cli-"));
    daemon = await startDaemonForTests(rootDir, tmpDir);
  });

  afterAll(async () => {
    if (daemon) {
      await daemon.stop("test-cleanup");
      daemon = null;
    }

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run(args: string, expectFail = false): string {
    try {
      return execSync(`node ${cliPath} ${args}`, {
        cwd: rootDir,
        env: { ...process.env, TODUAI_DATA_DIR: tmpDir, TODUAI_NO_SYNC: "1" },
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
    } catch (e: unknown) {
      const error = e as { stdout?: string; stderr?: string };
      if (expectFail) return (error.stderr || error.stdout || "").toString();
      throw new Error(
        `Command failed: toduai ${args}\nstdout: ${error.stdout}\nstderr: ${error.stderr}`,
      );
    }
  }

  it("habit create → list → show → check → streak → uncheck → history → update → pause → resume → delete flow", () => {
    // Create
    const createOutput = run(
      'habit create --title "Meditate" --schedule "FREQ=DAILY" --timezone UTC --start-date 2026-02-01 --format json',
    );
    const created = JSON.parse(createOutput);
    expect(created.id).toMatch(/^hab-/);
    expect(created.title).toBe("Meditate");
    expect(created.schedule).toBe("FREQ=DAILY");
    expect(created.paused).toBe(false);

    // List
    const listOutput = run("habit list");
    expect(listOutput).toContain("Meditate");
    expect(listOutput).toContain("Daily");

    const listJson = JSON.parse(run("habit list --format json"));
    expect(listJson).toHaveLength(1);

    // Show
    const showOutput = run(`habit show ${created.id}`);
    expect(showOutput).toContain("Meditate");
    expect(showOutput).toContain("FREQ=DAILY");

    // Show JSON includes streak
    const showJson = JSON.parse(run(`habit show ${created.id} --format json`));
    expect(showJson.streak).toBeDefined();
    expect(showJson.streak.current).toBe(0);

    // Check
    const checkOutput = run(`habit check ${created.id}`);
    expect(checkOutput).toContain("Meditate");
    expect(checkOutput).toContain("checked in");

    // Check JSON
    const checkJson = JSON.parse(run(`habit check ${created.id} --format json`));
    expect(checkJson.completed).toBe(true);
    expect(checkJson.date).toBeDefined();

    // Streak
    const streakJson = JSON.parse(run(`habit streak ${created.id} --format json`));
    expect(streakJson.current).toBeGreaterThanOrEqual(1);
    expect(streakJson.completedToday).toBe(true);

    // Uncheck
    run(`habit uncheck ${created.id}`);
    const afterUncheck = JSON.parse(run(`habit streak ${created.id} --format json`));
    expect(afterUncheck.completedToday).toBe(false);

    // History
    const historyJson = JSON.parse(run(`habit history ${created.id} --days 7 --format json`));
    expect(historyJson.length).toBeGreaterThanOrEqual(1);
    expect(historyJson[0].scheduled).toBe(true);

    // History text
    const historyText = run(`habit history ${created.id} --days 7`);
    expect(historyText).toContain("Date");
    expect(historyText).toContain("Status");

    // Update
    run(`habit update ${created.id} --title "Meditate 10min"`);
    const updated = JSON.parse(run(`habit show ${created.id} --format json`));
    expect(updated.title).toBe("Meditate 10min");

    // Pause
    run(`habit pause ${created.id}`);
    const paused = JSON.parse(run(`habit show ${created.id} --format json`));
    expect(paused.paused).toBe(true);

    // List active only
    const activeOnly = JSON.parse(run("habit list --active --format json"));
    expect(activeOnly).toHaveLength(0);

    // Resume
    run(`habit resume ${created.id}`);
    const resumed = JSON.parse(run(`habit show ${created.id} --format json`));
    expect(resumed.paused).toBe(false);

    // Lookup by name
    const byName = run('habit show "Meditate 10min"');
    expect(byName).toContain("Meditate 10min");

    // Delete
    run(`habit delete ${created.id}`);
    const afterDelete = JSON.parse(run("habit list --format json"));
    expect(afterDelete).toHaveLength(0);
  });

  it("handles errors gracefully", () => {
    const output = run("habit show nonexistent-id", true);
    expect(output).toContain("not found");
  });
});
