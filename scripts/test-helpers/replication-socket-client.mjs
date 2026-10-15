import assert from "node:assert/strict";
import { setTimeout as sleep } from "node:timers/promises";
import { Repo } from "@automerge/automerge-repo";
import {
  addRemoteSyncAdapter,
  disposeRemoteSyncAdapter,
} from "../../packages/engine/src/sync-client.ts";

const url = process.argv[2];
assert.equal(new URL(url).hostname, "127.0.0.1");
const repo = new Repo({ network: [] });
const adapter = addRemoteSyncAdapter(repo, url, 60);
const stop = new Promise((resolve) => process.once("message", resolve));
const deadline = Date.now() + 5_000;
while (adapter.socket?.readyState !== 1) {
  assert(Date.now() < deadline, "Fixture client did not connect");
  await sleep(5);
}
process.send({ phase: "connected" });
assert.equal(await stop, "stop");
disposeRemoteSyncAdapter(repo, adapter);
await repo.shutdown();
assert.equal(adapter.socket, undefined);
process.send({ phase: "shutdown-returned" }, () => process.disconnect());
// Natural exit is the assertion: no process.exit(), unref(), or peer shutdown here.
