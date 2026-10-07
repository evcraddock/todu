import type { PeerId, Repo } from "@automerge/automerge-repo/slim";
import { describe, expect, it } from "vitest";
import { assertNativePeerIdentity } from "./peer-identity.js";

function check(adapters: unknown[], peerId = "new", storageId: unknown = "remote") {
  assertNativePeerIdentity({
    repo: {
      networkSubsystem: { adapters },
      getStorageIdOfPeer: () => "remote",
    } as unknown as Repo,
    localId: "local",
    peerId: peerId as PeerId,
    storageId,
  });
}
describe("native replica identity boundary", () => {
  it("refuses self without using an address as identity", () => {
    expect(() => check([], "new", "local")).toThrow("own native storage identity");
  });
  it("refuses a different live native peer announcing the same persistent ID", () => {
    expect(() => check([{ remotePeerId: "old", socket: { readyState: 1 } }])).toThrow(
      "Duplicate live",
    );
    expect(() => check([{ sockets: { old: { readyState: 1 } } }])).toThrow("Duplicate live");
  });
  it("allows the same native peer across channels and ignores disconnected historical metadata", () => {
    expect(() => check([{ remotePeerId: "new", socket: { readyState: 1 } }])).not.toThrow();
    expect(() => check([{ remotePeerId: "old", socket: { readyState: 3 } }])).not.toThrow();
  });
  it("does not turn membership into an authorization requirement for native ephemeral clients", () => {
    expect(() =>
      assertNativePeerIdentity({
        repo: { networkSubsystem: { adapters: [] } } as unknown as Repo,
        localId: "local",
        peerId: "ephemeral" as PeerId,
        storageId: undefined,
      }),
    ).not.toThrow();
  });
});
