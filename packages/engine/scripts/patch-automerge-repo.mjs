import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function applyPatch(filePath, before, after, description) {
  const source = fs.readFileSync(filePath, "utf8");

  if (source.includes(after)) {
    console.log(`${description} already applied`);
    return;
  }

  if (!source.includes(before)) {
    throw new Error(`Unable to apply ${description}: expected block not found in ${filePath}`);
  }

  fs.writeFileSync(filePath, source.replace(before, after));
  console.log(`applied ${description}`);
}

const automergeRepoSlimEntrypoint = require.resolve("@automerge/automerge-repo/slim", {
  paths: [packageRoot],
});
const automergeRepoRoot = path.resolve(automergeRepoSlimEntrypoint, "..", "..", "..");

applyPatch(
  path.join(automergeRepoRoot, "dist", "synchronizer", "DocSynchronizer.js"),
  `                this.#setSyncState(message.senderId, newSyncState);
                // respond to just this peer (as required)
                this.#sendSyncMessage(message.senderId, doc);
                return newDoc;`,
  `                this.#setSyncState(message.senderId, newSyncState);
                // respond to just this peer (as required)
                this.#sendSyncMessage(message.senderId, newDoc);
                return newDoc;`,
  "automerge-repo sync response patch",
);

applyPatch(
  path.join(automergeRepoRoot, "dist", "network", "NetworkSubsystem.js"),
  `        this.peerMetadata
            .then(peerMetadata => {
            networkAdapter.connect(this.peerId, peerMetadata);
        })`,
  `        this.peerMetadata
            .then(peerMetadata => {
            if (this.adapters.includes(networkAdapter)) {
                networkAdapter.connect(this.peerId, peerMetadata);
            }
        })`,
  "automerge-repo removed-adapter connection guard",
);

applyPatch(
  path.join(automergeRepoRoot, "dist", "network", "NetworkSubsystem.js"),
  `    removeNetworkAdapter(networkAdapter) {
        this.adapters = this.adapters.filter(a => a !== networkAdapter);
        networkAdapter.disconnect();
    }`,
  `    removeNetworkAdapter(networkAdapter) {
        this.adapters = this.adapters.filter(a => a !== networkAdapter);
        networkAdapter.disconnect();
        networkAdapter.removeAllListeners();
    }`,
  "automerge-repo adapter listener cleanup",
);

const websocketEntrypoint = require.resolve("@automerge/automerge-repo-network-websocket", {
  paths: [packageRoot],
});
const websocketAdapterPath = path.join(path.dirname(websocketEntrypoint), "WebSocketClientAdapter.js");

applyPatch(
  websocketAdapterPath,
  `    #retryIntervalId;
    #log = debug("automerge-repo:websocket:browser");`,
  `    #retryIntervalId;
    #retryTimeoutId;
    #forceReadyTimeoutId;
    #disconnected = false;
    #log = debug("automerge-repo:websocket:browser");`,
  "websocket adapter timer tracking fields",
);

applyPatch(
  websocketAdapterPath,
  `    connect(peerId, peerMetadata) {
        if (!this.socket || !this.peerId) {`,
  `    connect(peerId, peerMetadata) {
        this.#disconnected = false;
        if (!this.socket || !this.peerId) {`,
  "websocket adapter reconnect state reset",
);

applyPatch(
  websocketAdapterPath,
  `        if (!this.#retryIntervalId)
            this.#retryIntervalId = setInterval(() => {`,
  `        if (this.retryInterval > 0 && !this.#retryIntervalId)
            this.#retryIntervalId = setInterval(() => {`,
  "websocket adapter disabled-retry guard",
);

applyPatch(
  websocketAdapterPath,
  `        setTimeout(() => this.#forceReady(), 1000);`,
  `        clearTimeout(this.#forceReadyTimeoutId);
        this.#forceReadyTimeoutId = setTimeout(() => {
            this.#forceReadyTimeoutId = undefined;
            this.#forceReady();
        }, 1000);`,
  "websocket adapter readiness timer tracking",
);

applyPatch(
  websocketAdapterPath,
  `        if (this.retryInterval > 0 && !this.#retryIntervalId)
            // try to reconnect
            setTimeout(() => {
                assert(this.peerId);
                return this.connect(this.peerId, this.peerMetadata);
            }, this.retryInterval);`,
  `        if (this.retryInterval > 0 && !this.#retryIntervalId && !this.#retryTimeoutId && !this.#disconnected)
            // try to reconnect
            this.#retryTimeoutId = setTimeout(() => {
                this.#retryTimeoutId = undefined;
                if (!this.#disconnected) {
                    assert(this.peerId);
                    this.connect(this.peerId, this.peerMetadata);
                }
            }, this.retryInterval);`,
  "websocket adapter reconnect timer tracking",
);

applyPatch(
  websocketAdapterPath,
  `    disconnect() {
        assert(this.peerId);
        assert(this.socket);
        const socket = this.socket;
        if (socket) {
            socket.removeEventListener("open", this.onOpen);
            socket.removeEventListener("close", this.onClose);
            socket.removeEventListener("message", this.onMessage);
            socket.removeEventListener("error", this.onError);
            socket.close();
        }
        clearInterval(this.#retryIntervalId);
        if (this.remotePeerId)
            this.emit("peer-disconnected", { peerId: this.remotePeerId });
        this.socket = undefined;
    }`,
  `    disconnect() {
        this.#disconnected = true;
        const socket = this.socket;
        if (socket) {
            socket.removeEventListener("open", this.onOpen);
            socket.removeEventListener("close", this.onClose);
            socket.removeEventListener("message", this.onMessage);
            socket.removeEventListener("error", this.onError);
            socket.close();
        }
        clearInterval(this.#retryIntervalId);
        clearTimeout(this.#retryTimeoutId);
        clearTimeout(this.#forceReadyTimeoutId);
        this.#retryIntervalId = undefined;
        this.#retryTimeoutId = undefined;
        this.#forceReadyTimeoutId = undefined;
        if (this.remotePeerId)
            this.emit("peer-disconnected", { peerId: this.remotePeerId });
        this.remotePeerId = undefined;
        this.socket = undefined;
    }`,
  "websocket adapter deterministic disconnect",
);
