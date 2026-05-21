import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createActorId, createIntegrationBindingId } from "@todu/core";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createTodu } from "../../../engine/src/index.js";
import { type DaemonHandle, startDaemonForTests } from "../test-helpers/daemon-process.js";

describe("approval CLI commands", () => {
  let tmpDir: string;
  let daemon: DaemonHandle | null = null;
  let taskId = "";
  let noteId = "";
  const rootDir = path.resolve(__dirname, "../../../..");
  const cliPath = path.resolve(rootDir, "packages/cli/dist/index.js");

  beforeAll(() => {
    execSync("npm run build", { cwd: rootDir, stdio: "pipe", timeout: 30000 });
  });

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-approval-test-"));

    const seeded = await createTodu({ storagePath: tmpDir });
    const project = await seeded.project.create({ name: "Approval CLI Project" });
    if (!project.ok) throw new Error("project create failed");

    const task = await seeded.task.create({
      title: "Imported task",
      projectId: project.value.id,
      description: "Imported task description",
      descriptionApproval: {
        state: "pendingApproval",
        sourceBindingId: createIntegrationBindingId("ibind-cli"),
        sourceActorId: createActorId("actor-user"),
      },
    });
    if (!task.ok) throw new Error("task create failed");
    taskId = task.value.id;

    const note = await seeded.note.create({
      content: "Imported note content",
      entityType: "task",
      entityId: taskId,
      contentApproval: {
        state: "pendingApproval",
        sourceBindingId: createIntegrationBindingId("ibind-cli"),
        sourceActorId: createActorId("actor-user"),
      },
    });
    if (!note.ok) throw new Error("note create failed");
    noteId = note.value.id;

    await seeded.close();
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
      const result = execSync(`node ${cliPath} ${args}`, {
        cwd: rootDir,
        env: {
          ...process.env,
          TODU_DATA_DIR: tmpDir,
          TODU_DAEMON_SOCKET: path.join(tmpDir, "daemon.sock"),
          TODU_NO_SYNC: "1",
        },
        encoding: "utf-8",
        timeout: 15000,
      });
      return result.trim();
    } catch (error: unknown) {
      if (expectFail) {
        const err = error as { stderr?: string; stdout?: string };
        return (err.stderr || err.stdout || "").trim();
      }
      throw error;
    }
  }

  it("lists and approves pending task and note content", { timeout: 30000 }, () => {
    const listOutput = run("approval list");
    expect(listOutput).toContain("task description");
    expect(listOutput).toContain("note content");
    expect(listOutput).toContain(taskId);
    expect(listOutput).toContain(noteId);

    const taskOnly = JSON.parse(run("--format json approval list --kind task"));
    expect(taskOnly).toHaveLength(1);
    expect(taskOnly[0]).toMatchObject({
      kind: "taskDescription",
      taskId,
      state: "pendingApproval",
    });

    const approveTask = run(`approval approve task-description ${taskId}`);
    expect(approveTask).toContain("Approval updated:");
    expect(approveTask).toContain("State:       approved");

    const taskJson = JSON.parse(run(`--format json task show ${taskId}`));
    expect(taskJson.descriptionApproval).toMatchObject({ state: "approved" });

    const approveNote = JSON.parse(run(`--format json approval approve note-content ${noteId}`));
    expect(approveNote).toMatchObject({ kind: "noteContent", noteId, state: "approved" });

    const noteList = JSON.parse(run(`--format json note list --task ${taskId}`));
    expect(noteList[0].contentApproval).toMatchObject({ state: "approved" });

    const remaining = JSON.parse(run("--format json approval list"));
    expect(remaining).toEqual([]);
  });

  it("fails clearly for invalid approval actions", { timeout: 30000 }, () => {
    run(`--format json approval approve task-description ${taskId}`);

    const alreadyApproved = run(`approval approve task-description ${taskId}`, true);
    expect(alreadyApproved).toContain("already approved");

    const missing = run("approval approve note-content note-missing", true);
    expect(missing).toContain("note not found");
  });
});
