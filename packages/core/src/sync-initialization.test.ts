import { describe, expect, it, vi } from "vitest";
import { validateSyncTaskFieldGroupUpdate } from "./sync-field-groups.js";
import { validateSyncTaskFieldGroupUpdateV7 } from "./sync-initialization-validation.js";
import {
  SYNC_PROVIDER_API_VERSION_V7,
  type SyncProviderRegistrationV7,
  validateSyncProviderRegistration,
} from "./sync-provider.js";

function update(base: unknown = { state: "unknown" }): unknown {
  return {
    externalId: "remote-1",
    observationToken: "fresh-token",
    groups: { assignment: { base, remote: { assignees: [] } } },
  };
}

describe("explicit safe initialization contract", () => {
  it("requires v7 negotiation and the durable recovery gate", () => {
    const registration: SyncProviderRegistrationV7 = {
      manifest: { name: "fixture", version: "1.0.0", apiVersion: SYNC_PROVIDER_API_VERSION_V7 },
      provider: {
        name: "fixture",
        version: "1.0.0",
        initialize: vi.fn(),
        shutdown: vi.fn(),
        recoveryState: vi.fn(),
        pull: vi.fn(),
        acknowledgePull: vi.fn(),
        push: vi.fn(),
      },
    };
    expect(validateSyncProviderRegistration(registration).ok).toBe(true);
    expect(
      validateSyncProviderRegistration(registration, { supportedApiVersions: [3, 4, 5, 6] }),
    ).toMatchObject({ ok: false, error: { code: "API_VERSION_MISMATCH" } });
    const invalid = {
      ...registration,
      provider: { ...registration.provider, recoveryState: undefined },
    };
    expect(
      validateSyncProviderRegistration(invalid as unknown as SyncProviderRegistrationV7),
    ).toMatchObject({
      ok: false,
      error: { code: "INVALID_PROVIDER", details: { method: "recoveryState" } },
    });
  });

  it("distinguishes an unknown assignment baseline from a proven empty set", () => {
    expect(validateSyncTaskFieldGroupUpdateV7(update()).ok).toBe(true);
    expect(
      validateSyncTaskFieldGroupUpdateV7(update({ state: "known", value: { assignees: [] } })).ok,
    ).toBe(true);
    expect(
      validateSyncTaskFieldGroupUpdateV7(update({ state: "unknown", value: { assignees: [] } })).ok,
    ).toBe(false);
    expect(validateSyncTaskFieldGroupUpdateV7(update({ state: "known" })).ok).toBe(false);
    expect(validateSyncTaskFieldGroupUpdateV7(update({ assignees: [] })).ok).toBe(false);
    expect(validateSyncTaskFieldGroupUpdate(update()).ok).toBe(false);
  });

  it("rejects unscoped tokens, malformed remote values, unknown groups and operator intent", () => {
    for (const invalid of [
      { ...(update() as object), observationToken: "" },
      {
        ...(update() as object),
        groups: { workflow: { base: { state: "unknown" }, remote: { status: "deleted" } } },
      },
      {
        ...(update() as object),
        groups: { unexpected: { base: { state: "unknown" }, remote: {} } },
      },
      { ...(update() as object), operatorIntent: { cancel: true } },
    ])
      expect(validateSyncTaskFieldGroupUpdateV7(invalid).ok).toBe(false);
  });
});
