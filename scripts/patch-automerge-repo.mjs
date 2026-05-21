import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const automergeRepoSlimEntrypoint = require.resolve("@automerge/automerge-repo/slim", {
  paths: [path.resolve("packages/engine")],
});
const automergeRepoRoot = path.resolve(automergeRepoSlimEntrypoint, "..", "..", "..");
const synchronizerPath = path.join(
  automergeRepoRoot,
  "dist",
  "synchronizer",
  "DocSynchronizer.js",
);

const before = `                this.#setSyncState(message.senderId, newSyncState);
                // respond to just this peer (as required)
                this.#sendSyncMessage(message.senderId, doc);
                return newDoc;`;

const after = `                this.#setSyncState(message.senderId, newSyncState);
                // respond to just this peer (as required)
                this.#sendSyncMessage(message.senderId, newDoc);
                return newDoc;`;

const source = fs.readFileSync(synchronizerPath, "utf8");

if (source.includes(after)) {
  console.log("automerge-repo patch already applied");
  process.exit(0);
}

if (!source.includes(before)) {
  throw new Error(
    `Unable to apply automerge-repo patch: expected sync response block not found in ${synchronizerPath}`,
  );
}

fs.writeFileSync(synchronizerPath, source.replace(before, after));
console.log("applied automerge-repo sync response patch");
