import type { PeerId, Repo } from "@automerge/automerge-repo/slim";

/** Refuse cloned live replica identities; this is not cryptographic authentication. */
export function assertNativePeerIdentity(options: {
  repo: Repo;
  localId?: string;
  peerId: PeerId;
  storageId: unknown;
}): void {
  if (typeof options.storageId !== "string") return;
  if (options.storageId === options.localId)
    throw new Error("Refusing a connection to this replica's own native storage identity");
  const live = new Set<string>();
  for (const adapter of options.repo.networkSubsystem.adapters) {
    if (
      "remotePeerId" in adapter &&
      typeof adapter.remotePeerId === "string" &&
      "socket" in adapter &&
      adapter.socket &&
      typeof adapter.socket === "object" &&
      "readyState" in adapter.socket &&
      adapter.socket.readyState === 1
    )
      live.add(adapter.remotePeerId);
    if ("sockets" in adapter && adapter.sockets && typeof adapter.sockets === "object")
      for (const [id, socket] of Object.entries(adapter.sockets))
        if (
          socket &&
          typeof socket === "object" &&
          "readyState" in socket &&
          socket.readyState === 1
        )
          live.add(id);
  }
  for (const id of live)
    if (
      id !== options.peerId &&
      options.repo.getStorageIdOfPeer(id as PeerId)?.slice(0) === options.storageId
    )
      throw new Error(
        "Duplicate live native replica identity: use distinct persistent storage for each daemon",
      );
}
