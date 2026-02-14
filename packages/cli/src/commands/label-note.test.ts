import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

describe("label + note CLI commands", () => {
  let tmpDir: string;
  const rootDir = path.resolve(__dirname, "../../../..");
  const cliPath = path.resolve(rootDir, "packages/cli/dist/index.js");

  beforeAll(() => {
    execSync("npm run build", { cwd: rootDir, stdio: "pipe", timeout: 30000 });
  });

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-ln-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function run(args: string, expectFail = false): string {
    try {
      const result = execSync(`node ${cliPath} ${args}`, {
        cwd: rootDir,
        env: { ...process.env, TODU_DATA_DIR: tmpDir, TODU_NO_SYNC: "1" },
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

  describe("labels", () => {
    it("label create → list → update → delete flow", { timeout: 30000 }, () => {
      // Create
      const createOutput = run('label create --name "bug" --color "#FF0000"');
      expect(createOutput).toContain("Label created:");
      expect(createOutput).toContain("bug");

      // Create JSON
      const createJson = run('--format json label create --name "feature"');
      const label = JSON.parse(createJson);
      expect(label.name).toBe("feature");
      expect(label.id).toMatch(/^lbl-/);

      // List
      const listOutput = run("label list");
      expect(listOutput).toContain("bug");
      expect(listOutput).toContain("feature");

      // Update
      const updateOutput = run(`label update "${label.id}" --name "enhancement"`);
      expect(updateOutput).toContain("Label updated:");
      expect(updateOutput).toContain("enhancement");

      // Delete
      const deleteOutput = run('label delete "bug"');
      expect(deleteOutput).toContain("Deleted label:");

      // Verify
      const afterDelete = run("--format json label list");
      const remaining = JSON.parse(afterDelete);
      expect(remaining).toHaveLength(1);
      expect(remaining[0].name).toBe("enhancement");
    });

    it("rejects duplicate label names", () => {
      run('label create --name "bug"');
      const err = run('label create --name "bug"', true);
      expect(err).toContain("already exists");
    });
  });

  describe("notes", () => {
    it("note add (journal + attached) → list → delete flow", { timeout: 30000 }, () => {
      // Create project and task for attachment
      const projJson = run('--format json project create --name "My App"');
      const proj = JSON.parse(projJson);
      const taskJson = run(`--format json task create --title "Fix bug" --project "${proj.id}"`);
      const task = JSON.parse(taskJson);

      // Standalone journal entry
      const journalOutput = run('note add "Today was productive" --tag journal --tag daily');
      expect(journalOutput).toContain("Note added:");
      expect(journalOutput).toContain("Today was productive");

      // Note attached to task
      const taskNoteJson = run(
        `--format json note add "Making progress on this" --task "${task.id}"`,
      );
      const taskNote = JSON.parse(taskNoteJson);
      expect(taskNote.entityType).toBe("task");
      expect(taskNote.entityId).toBe(task.id);

      // Note attached to project (by name)
      run('note add "Project kickoff" --project "My App"');

      // List all notes
      const listJson = run("--format json note list");
      const allNotes = JSON.parse(listJson);
      expect(allNotes).toHaveLength(3);

      // List by tag
      const taggedJson = run("--format json note list --tag journal");
      const tagged = JSON.parse(taggedJson);
      expect(tagged).toHaveLength(1);
      expect(tagged[0].content).toBe("Today was productive");

      // List by task
      const taskNotesJson = run(`--format json note list --task "${task.id}"`);
      const taskNotes = JSON.parse(taskNotesJson);
      expect(taskNotes).toHaveLength(1);

      // Delete
      const deleteOutput = run(`note delete "${taskNote.id}"`);
      expect(deleteOutput).toContain("Deleted note:");

      // Verify
      const afterDelete = run("--format json note list");
      expect(JSON.parse(afterDelete)).toHaveLength(2);
    });

    it("shows 'No notes.' when empty", () => {
      const output = run("note list");
      expect(output).toBe("No notes.");
    });
  });
});
