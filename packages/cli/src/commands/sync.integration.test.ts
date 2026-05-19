import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { type CatalogDocument, createEmptyCatalog } from "@todu/core";
import * as engine from "@todu/engine";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { invokeDaemonMethod } from "../daemon-transport.js";
import { type DaemonHandle, startDaemonForTests } from "../test-helpers/daemon-process.js";

describe("sync CLI commands", () => {
  let tmpDir: string;
  let alternateCatalogId: string;
  let daemon: DaemonHandle | null = null;
  const rootDir = path.resolve(__dirname, "../../../..");
  const cliPath = path.resolve(rootDir, "packages/cli/dist/index.js");

  beforeAll(() => {
    execSync("npm run build", { cwd: rootDir, stdio: "pipe", timeout: 30000 });
  });

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-cli-sync-test-"));
    alternateCatalogId = await createAlternateCatalogDocument(tmpDir);
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
      return execSync(`node ${cliPath} ${args}`, {
        cwd: rootDir,
        env: { ...process.env, TODU_DATA_DIR: tmpDir, TODU_CONFIG: "", TODUAI_NO_SYNC: "1" },
        encoding: "utf-8",
        timeout: 15000,
      }).trim();
    } catch (e: unknown) {
      if (!expectFail) {
        throw e;
      }

      const err = e as { stderr?: string; stdout?: string };
      return (err.stderr || err.stdout || "").trim();
    }
  }

  it("sync status shows standalone mode in text format", () => {
    const output = run("sync status");
    expect(output).toContain("standalone");
    expect(output).toContain("disconnected");
  });

  it("sync status shows standalone mode in JSON format", () => {
    const output = run("sync status --format json");
    const status = JSON.parse(output);
    expect(status.local.mode).toBe("standalone");
    expect(status.remote.state).toBe("disconnected");
  });

  it("sync start requests daemon sync.start and reports status", () => {
    const output = run("sync start");
    expect(output).toContain("Sync start: requested");
    expect(output).toContain("Remote Sync:  disconnected");
  });

  it("sync stop requests daemon sync.stop and reports status", () => {
    const output = run("sync stop");
    expect(output).toContain("Sync stop: requested");
    expect(output).toContain("Remote Sync:  disconnected");
  });

  it("sync restart requests daemon sync.stop and sync.start in JSON format", () => {
    const output = run("sync restart --format json");
    const result = JSON.parse(output);
    expect(result.action).toBe("restart");
    expect(result.status.local.mode).toBe("standalone");
    expect(result.status.remote.state).toBe("disconnected");
  });

  it("sync join --check validates target via daemon without switching catalog", async () => {
    const initialCatalogId = await readCatalogId(tmpDir);
    const targetCatalogId = alternateCatalogId;

    const output = run(`sync join ${targetCatalogId} --check --format json`);
    const result = JSON.parse(output);

    expect(result).toEqual({
      mode: "check",
      previousCatalogId: initialCatalogId,
      targetCatalogId,
      switched: false,
      rolledBack: false,
    });

    const afterCatalogId = await readCatalogId(tmpDir);
    expect(afterCatalogId).toBe(initialCatalogId);
  });

  it("sync join --yes switches catalog via daemon", async () => {
    const initialCatalogId = await readCatalogId(tmpDir);
    const targetCatalogId = alternateCatalogId;

    const output = run(`sync join ${targetCatalogId} --yes --format json`);
    const result = JSON.parse(output);

    expect(result).toEqual({
      mode: "join",
      previousCatalogId: initialCatalogId,
      targetCatalogId,
      switched: true,
      rolledBack: false,
    });

    const afterCatalogId = await readCatalogId(tmpDir);
    expect(afterCatalogId).toBe(targetCatalogId);
  });

  it("fails fast when daemon is unavailable", async () => {
    if (daemon) {
      await daemon.stop("unavailable-test");
      daemon = null;
    }

    const output = run("sync status", true);
    expect(output).toContain("local daemon is required but unavailable");
  });
});

async function readCatalogId(storagePath: string): Promise<string> {
  const socketPath = path.join(storagePath, "daemon.sock");

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await invokeDaemonMethod<string>({
      socketPath,
      method: "sync.catalogId",
    });

    if (response.ok) {
      return response.value;
    }

    if (response.error.message.includes("Daemon runtime is not ready")) {
      await sleep(100);
      continue;
    }

    throw new Error(`sync.catalogId failed: ${response.error.code} ${response.error.message}`);
  }

  throw new Error("sync.catalogId failed: daemon runtime did not become ready in time");
}

async function createAlternateCatalogDocument(storagePath: string): Promise<string> {
  const storage = await engine.initBootstrapStorage(storagePath);

  try {
    const alternateCatalog = storage.repo.create<CatalogDocument>();
    alternateCatalog.change((doc: CatalogDocument) => {
      const empty = createEmptyCatalog();
      doc.version = empty.version;
      doc.projects = empty.projects;
      doc.labels = empty.labels;
      doc.recurringTemplates = empty.recurringTemplates;
      doc.habits = empty.habits;
      doc.habitLogDocIds = empty.habitLogDocIds;
      doc.taskListDocIds = empty.taskListDocIds;
      doc.settings = empty.settings;
    });

    await storage.repo.flush();

    return alternateCatalog.documentId;
  } finally {
    await storage.close();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
