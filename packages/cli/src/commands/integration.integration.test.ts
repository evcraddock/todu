import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { type DaemonHandle, startDaemonForTests } from "../test-helpers/daemon-process.js";

describe("integration CLI commands", { timeout: 30000 }, () => {
  let tmpDir: string;
  let daemon: DaemonHandle | null = null;

  const rootDir = path.resolve(import.meta.dirname, "../../../..");
  const cliPath = path.resolve(rootDir, "packages/cli/dist/index.js");

  beforeAll(() => {
    execSync("npm run build", { cwd: rootDir, stdio: "pipe", timeout: 30000 });
  });

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-integration-test-"));
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
        env: { ...process.env, TODU_DATA_DIR: tmpDir, TODUAI_NO_SYNC: "1" },
        encoding: "utf-8",
        timeout: 15000,
      });
      return result.trim();
    } catch (error: unknown) {
      if (!expectFail) {
        throw error;
      }

      const typedError = error as { stderr?: string; stdout?: string };
      return (typedError.stderr || typedError.stdout || "").trim();
    }
  }

  it("integration add → list → status → update → set-strategy → enable/disable → remove flow", () => {
    const project = JSON.parse(
      run('--format json project create --name "Integration Project"'),
    ) as {
      id: string;
      name: string;
    };
    const plainProject = JSON.parse(run('--format json project create --name "Plain Project"')) as {
      id: string;
      name: string;
    };

    const createOutput = run(
      '--format json integration add --provider github --project "Integration Project" --target-kind repository --target owner/repo',
    );
    const created = JSON.parse(createOutput) as {
      id: string;
      provider: string;
      projectId: string;
      targetKind: string;
      targetRef: string;
      strategy: string;
      enabled: boolean;
    };

    expect(created.id).toMatch(/^ibind-/);
    expect(created).toMatchObject({
      provider: "github",
      projectId: project.id,
      targetKind: "repository",
      targetRef: "owner/repo",
      strategy: "bidirectional",
      enabled: true,
    });

    const listOutput = run("integration list");
    expect(listOutput).toContain("github");
    expect(listOutput).toContain("Integration Project");
    expect(listOutput).toContain("owner/repo");

    const listJson = JSON.parse(
      run('--format json integration list --provider github --project "Integration Project"'),
    ) as Array<{ id: string; projectId: string; provider: string }>;
    expect(listJson).toHaveLength(1);
    expect(listJson[0]).toMatchObject({
      id: created.id,
      projectId: project.id,
      provider: "github",
    });

    const statusJson = JSON.parse(run(`--format json integration status ${created.id}`)) as {
      binding: { id: string; targetRef: string };
      status: { bindingId: string; state: string };
    };
    expect(statusJson).toEqual({
      binding: expect.objectContaining({ id: created.id, targetRef: "owner/repo" }),
      status: expect.objectContaining({ bindingId: created.id, state: "idle" }),
    });

    const allStatusJson = JSON.parse(run("--format json integration status")) as Array<{
      binding: { id: string };
      status: { bindingId: string; state: string };
    }>;
    expect(allStatusJson).toEqual([
      expect.objectContaining({
        binding: expect.objectContaining({ id: created.id }),
        status: expect.objectContaining({ bindingId: created.id, state: "idle" }),
      }),
    ]);

    const updated = JSON.parse(
      run(
        `--format json integration update ${created.id} --project "${plainProject.id}" --provider forgejo --target-kind project --target team/repo`,
      ),
    ) as {
      projectId: string;
      provider: string;
      targetKind: string;
      targetRef: string;
    };
    expect(updated).toMatchObject({
      projectId: plainProject.id,
      provider: "forgejo",
      targetKind: "project",
      targetRef: "team/repo",
    });

    const strategyUpdated = JSON.parse(
      run(`--format json integration set-strategy ${created.id} --strategy pull`),
    ) as { strategy: string };
    expect(strategyUpdated.strategy).toBe("pull");

    const disabled = JSON.parse(run(`--format json integration disable ${created.id}`)) as {
      enabled: boolean;
    };
    expect(disabled.enabled).toBe(false);

    const enabledList = JSON.parse(
      run("--format json integration list --enabled"),
    ) as Array<unknown>;
    expect(enabledList).toHaveLength(0);

    const disabledList = JSON.parse(run("--format json integration list --disabled")) as Array<{
      id: string;
      enabled: boolean;
    }>;
    expect(disabledList).toEqual([expect.objectContaining({ id: created.id, enabled: false })]);

    const enabled = JSON.parse(run(`--format json integration enable ${created.id}`)) as {
      enabled: boolean;
    };
    expect(enabled.enabled).toBe(true);

    const plainTask = JSON.parse(
      run(`--format json task create --title "Plain Task" --project "${plainProject.name}"`),
    ) as { id: string; projectId: string; title: string };
    expect(plainTask).toMatchObject({
      projectId: plainProject.id,
      title: "Plain Task",
    });

    const removeOutput = run(`integration remove ${created.id}`);
    expect(removeOutput).toContain("Removed integration binding:");
    expect(removeOutput).toContain(created.id);

    const afterRemove = JSON.parse(run("--format json integration list")) as Array<unknown>;
    expect(afterRemove).toEqual([]);
  });

  it("surfaces validation and local argument errors", () => {
    const project = JSON.parse(run('--format json project create --name "Validation Project"')) as {
      id: string;
    };
    const created = JSON.parse(
      run(
        `--format json integration add --provider github --project ${project.id} --target-kind repository --target owner/repo`,
      ),
    ) as { id: string };

    const duplicateCreate = run(
      `integration add --provider forgejo --project ${project.id} --target-kind repository --target owner/other`,
      true,
    );
    expect(duplicateCreate).toContain("Project already has an integration binding");

    const invalidStrategy = run(`integration set-strategy ${created.id} --strategy invalid`, true);
    expect(invalidStrategy).toContain("invalid strategy: invalid");

    const emptyUpdate = run(`integration update ${created.id}`, true);
    expect(emptyUpdate).toContain("at least one update field is required");

    const conflictingListFlags = run("integration list --enabled --disabled", true);
    expect(conflictingListFlags).toContain("--enabled and --disabled cannot be used together");
  });

  it("shows no results when no integration bindings exist", () => {
    const output = run("integration list");
    expect(output).toBe("No results.");
  });
});
