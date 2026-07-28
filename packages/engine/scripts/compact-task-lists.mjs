#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { Repo } from "@automerge/automerge-repo/slim";
import { NodeFSStorageAdapter } from "@automerge/automerge-repo-storage-nodefs";
import { compactTaskListDocument } from "../dist/maintenance.js";
import { ensureAutomergeWasmInitialized } from "../dist/automerge-init.js";

function fail(message) {
  throw new Error(message);
}

function parseArguments(arguments_) {
  const options = { apply: false };

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--apply") {
      options.apply = true;
    } else if (argument === "--storage-path") {
      options.storagePath = arguments_[index + 1];
      index += 1;
    } else if (argument === "--backup-path") {
      options.backupPath = arguments_[index + 1];
      index += 1;
    } else {
      fail(`Unknown argument: ${argument}`);
    }
  }

  if (!options.apply) fail("Refusing to modify data without --apply");
  if (!options.storagePath) fail("Missing required --storage-path");
  if (!options.backupPath) fail("Missing required --backup-path");
  return options;
}

function assertSafePaths(storagePath, backupPath) {
  if (!fs.statSync(storagePath, { throwIfNoEntry: false })?.isDirectory()) {
    fail(`Storage directory does not exist: ${storagePath}`);
  }
  if (!fs.existsSync(path.join(storagePath, "todu-catalog.id"))) {
    fail(`Todu catalog marker not found in ${storagePath}`);
  }
  if (fs.existsSync(path.join(storagePath, "daemon.pid"))) {
    fail(`Daemon PID file exists in ${storagePath}; stop the daemon before compaction`);
  }
  if (fs.existsSync(path.join(storagePath, "daemon.sock"))) {
    fail(`Daemon socket exists in ${storagePath}; stop the daemon before compaction`);
  }
  if (fs.existsSync(backupPath)) {
    fail(`Backup path already exists: ${backupPath}`);
  }

  const relativeBackupPath = path.relative(storagePath, backupPath);
  if (relativeBackupPath === "" || (!relativeBackupPath.startsWith("..") && !path.isAbsolute(relativeBackupPath))) {
    fail("Backup path must be outside the storage directory");
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const storagePath = path.resolve(options.storagePath);
  const backupPath = path.resolve(options.backupPath);
  assertSafePaths(storagePath, backupPath);

  console.log(`Creating backup: ${backupPath}`);
  fs.cpSync(storagePath, backupPath, { recursive: true, errorOnExist: true, force: false });

  await ensureAutomergeWasmInitialized();
  const catalogId = fs.readFileSync(path.join(storagePath, "todu-catalog.id"), "utf8").trim();
  const repo = new Repo({ storage: new NodeFSStorageAdapter(storagePath) });
  const catalog = await repo.find(catalogId);
  await catalog.whenReady();
  const projects = (catalog.doc()?.projects ?? []).filter(
    (project) => catalog.doc()?.taskListDocIds[project.id] !== undefined,
  );

  console.log(`Compacting ${projects.length} task-list documents`);
  for (const [index, project] of projects.entries()) {
    const result = await compactTaskListDocument(repo, catalog, project.id);
    await repo.removeFromCache(result.oldDocumentId);
    console.log(
      JSON.stringify({
        progress: `${index + 1}/${projects.length}`,
        projectId: project.id,
        projectName: project.name,
        taskCount: result.taskCount,
        oldDocumentId: result.oldDocumentId,
        newDocumentId: result.newDocumentId,
        operationCount: result.operationCount,
        rssMiB: Math.round(process.memoryUsage().rss / 1024 / 1024),
      }),
    );
  }

  await repo.flush([catalog.documentId]);
  console.log("Compaction complete. Keep the backup until all upgraded replicas are verified.");
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error instanceof Error ? error.message : String(error));
    console.error("Compaction failed. Keep all daemons stopped and restore the backup before retrying.");
    process.exit(1);
  },
);
