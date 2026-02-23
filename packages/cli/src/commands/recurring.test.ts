import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { type DaemonHandle, startDaemonForTests } from "../test-helpers/daemon-process.js";

describe("recurring CLI commands", { timeout: 30000 }, () => {
  const rootDir = path.resolve(import.meta.dirname, "../../../..");
  const cliPath = path.join(rootDir, "packages/cli/dist/index.js");
  let tmpDir: string;
  let daemon: DaemonHandle | null = null;

  beforeAll(async () => {
    // Build first
    execSync("npm run build", { cwd: rootDir, stdio: "pipe" });
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-recurring-cli-"));
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
      const result = execSync(`node ${cliPath} ${args}`, {
        cwd: rootDir,
        env: { ...process.env, TODUAI_DATA_DIR: tmpDir, TODUAI_NO_SYNC: "1" },
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return result;
    } catch (e: unknown) {
      const error = e as { stdout?: string; stderr?: string; status?: number };
      if (expectFail) {
        return (error.stderr || error.stdout || "").toString();
      }
      throw new Error(
        `Command failed: toduai ${args}\nstdout: ${error.stdout}\nstderr: ${error.stderr}`,
      );
    }
  }

  it("recurring create → list → show → upcoming → generate → pause → resume → delete flow", () => {
    // Create a project
    const projectJson = run('project create --name "RecurringTest" --format json');
    const project = JSON.parse(projectJson) as { id: string };

    // Create a recurring template
    const createOutput = run(
      'recurring create --title "Daily standup" --schedule "FREQ=DAILY" --project RecurringTest --timezone UTC --start-date 2026-02-01 --priority high --format json',
    );
    const created = JSON.parse(createOutput);
    expect(created.id).toMatch(/^rec-/);
    expect(created.title).toBe("Daily standup");
    expect(created.schedule).toBe("FREQ=DAILY");
    expect(created.priority).toBe("high");
    expect(created.paused).toBe(false);

    // List
    const listOutput = run("recurring list");
    expect(listOutput).toContain("Daily standup");
    expect(listOutput).toContain("Daily");

    // List JSON
    const listJson = JSON.parse(run("recurring list --format json"));
    expect(listJson).toHaveLength(1);
    expect(listJson[0].title).toBe("Daily standup");

    // Show
    const showOutput = run(`recurring show ${created.id}`);
    expect(showOutput).toContain("Daily standup");
    expect(showOutput).toContain("FREQ=DAILY");
    expect(showOutput).toContain("UTC");

    // Upcoming
    const upcomingOutput = run("recurring upcoming --days 7");
    expect(upcomingOutput).toContain("Daily standup");

    // Early materialization
    const genOutput = run(`recurring generate ${created.id} 2026-03-15 --format json`);
    const genTask = JSON.parse(genOutput);
    expect(genTask.id).toMatch(/^sched-/);
    expect(genTask.title).toBe("Daily standup");
    expect(genTask.scheduledDate).toBe("2026-03-15");
    expect(genTask.templateId).toBe(created.id);

    // Verify task appears in task list for the target project
    const taskList = JSON.parse(run(`task list --project "${project.id}" --format json`));
    const scheduledTask = taskList.find(
      (t: { scheduledDate?: string; title: string }) =>
        t.scheduledDate === "2026-03-15" && t.title === "Daily standup",
    );
    expect(scheduledTask).toBeDefined();

    // Update
    run(`recurring update ${created.id} --title "Morning sync" --priority medium`);
    const updated = JSON.parse(run(`recurring show ${created.id} --format json`));
    expect(updated.title).toBe("Morning sync");
    expect(updated.priority).toBe("medium");

    // Pause
    run(`recurring pause ${created.id}`);
    const paused = JSON.parse(run(`recurring show ${created.id} --format json`));
    expect(paused.paused).toBe(true);

    // List active only
    const activeOnly = JSON.parse(run("recurring list --active --format json"));
    expect(activeOnly).toHaveLength(0);

    // Resume
    run(`recurring resume ${created.id}`);
    const resumed = JSON.parse(run(`recurring show ${created.id} --format json`));
    expect(resumed.paused).toBe(false);

    // Delete
    run(`recurring delete ${created.id}`);
    const afterDelete = JSON.parse(run("recurring list --format json"));
    expect(afterDelete).toHaveLength(0);
  });

  it("handles errors gracefully", () => {
    const output = run("recurring show nonexistent-id", true);
    expect(output).toContain("not found");
  });
});
