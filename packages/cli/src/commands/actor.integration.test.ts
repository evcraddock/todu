import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type DaemonHandle, startDaemonForTests } from "../test-helpers/daemon-process.js";

describe("actor CLI commands", () => {
  let tmpDir: string;
  let daemon: DaemonHandle | null = null;
  const rootDir = path.resolve(__dirname, "../../../..");
  const cliPath = path.resolve(rootDir, "packages/cli/dist/index.js");

  beforeAll(() => {
    execSync("npm run build", { cwd: rootDir, stdio: "pipe", timeout: 30000 });
  });

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-actor-test-"));
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
    const socketPath = path.join(tmpDir, "daemon.sock");

    try {
      const result = execSync(`node ${cliPath} ${args}`, {
        cwd: rootDir,
        env: {
          ...process.env,
          TODU_DATA_DIR: tmpDir,
          TODU_DAEMON_SOCKET: socketPath,
          TODUAI_DAEMON_SOCKET: socketPath,
          TODUAI_NO_SYNC: "1",
        },
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

  it("actor list/create/rename/archive/unarchive flow", () => {
    const initialList = run("actor list");
    expect(initialList).toContain("actor-user");
    expect(initialList).toContain("active");

    const createOutput = run('actor create --id actor-reviewer --name "Reviewer"');
    expect(createOutput).toContain("Actor created:");
    expect(createOutput).toContain("actor-reviewer");
    expect(createOutput).toContain("Archived:    no");

    const listJson = run("--format json actor list");
    expect(JSON.parse(listJson)).toEqual(
      expect.arrayContaining([
        { id: "actor-user", displayName: "user", archived: false },
        { id: "actor-reviewer", displayName: "Reviewer", archived: false },
      ]),
    );

    const renameOutput = run('actor rename actor-reviewer --name "Lead Reviewer"');
    expect(renameOutput).toContain("Actor renamed:");
    expect(renameOutput).toContain("Lead Reviewer");

    const archiveOutput = run("actor archive actor-reviewer");
    expect(archiveOutput).toContain("Actor archived:");
    expect(archiveOutput).toContain("Archived:    yes");

    const archivedList = run("actor list");
    expect(archivedList).toContain("actor-reviewer");
    expect(archivedList).toContain("archived");

    const unarchiveJson = run("--format json actor unarchive actor-reviewer");
    expect(JSON.parse(unarchiveJson)).toEqual({
      id: "actor-reviewer",
      displayName: "Lead Reviewer",
      archived: false,
    });
  });

  it("shows daemon-backed actor errors", () => {
    const duplicateOutput = run('actor create --id actor-user --name "Duplicate"', true);
    expect(duplicateOutput).toContain("Actor ID already exists: actor-user");

    const missingOutput = run("actor archive actor-missing", true);
    expect(missingOutput).toContain("actor not found: actor-missing");
  });
});
