import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

const url = process.argv[2];
const installedDirectory = process.argv[3];
assert.equal(new URL(url).hostname, "127.0.0.1");
const helper = installedDirectory
  ? pathToFileURL(path.join(installedDirectory, "node_modules/@todu/engine/dist/sync-client.js"))
  : new URL("../../packages/engine/src/sync-client.ts", import.meta.url);
const require = createRequire(helper);
const repoEntry = require.resolve("@automerge/automerge-repo");
if (installedDirectory) {
  const installedModules = fs.realpathSync(path.join(installedDirectory, "node_modules")) + path.sep;
  for (const entry of [fileURLToPath(helper), repoEntry]) {
    assert(fs.realpathSync(entry).startsWith(installedModules), "Packed probe must not resolve workspace modules");
  }
}
const { Repo } = await import(pathToFileURL(repoEntry).href);
const { addRemoteSyncAdapter, disposeRemoteSyncAdapter } = await import(helper.href);
const repo = new Repo({ network: [] });
const adapter = addRemoteSyncAdapter(repo, url, 60);
const stop = new Promise((resolve) => process.once("message", resolve));
const deadline = Date.now() + 5_000;
while (adapter.socket?.readyState !== 1) {
  assert(Date.now() < deadline, "Fixture client did not connect");
  await sleep(5);
}
process.send({ phase: "connected", installed: Boolean(installedDirectory), helper: helper.href });
assert.equal(await stop, "stop");
disposeRemoteSyncAdapter(repo, adapter);
await repo.shutdown();
assert.equal(adapter.socket, undefined);
process.send({ phase: "shutdown-returned" }, () => process.disconnect());
// Natural exit is the assertion: no process.exit(), unref(), or peer shutdown here.
