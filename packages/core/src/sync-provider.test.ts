import { describe, expect, it } from "vitest";
import {
  isSyncProviderApiVersionCompatible,
  SYNC_PROVIDER_API_VERSION,
  type SyncProviderRegistration,
  validateSyncProviderRegistration,
} from "./sync-provider.js";

describe("isSyncProviderApiVersionCompatible", () => {
  it("accepts matching API version", () => {
    expect(isSyncProviderApiVersionCompatible(SYNC_PROVIDER_API_VERSION)).toBe(true);
  });

  it("rejects mismatched API version", () => {
    expect(isSyncProviderApiVersionCompatible(SYNC_PROVIDER_API_VERSION + 1)).toBe(false);
  });
});

describe("validateSyncProviderRegistration", () => {
  it("accepts a valid provider registration", () => {
    const registration = createValidRegistration();

    const result = validateSyncProviderRegistration(registration);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected valid sync provider registration");
    }

    expect(result.value.manifest).toEqual({
      name: "github",
      version: "1.2.3",
      apiVersion: SYNC_PROVIDER_API_VERSION,
    });
  });

  it("rejects provider with incompatible API version", () => {
    const registration = createValidRegistration();
    registration.manifest.apiVersion = SYNC_PROVIDER_API_VERSION + 1;

    const result = validateSyncProviderRegistration(registration);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected registration to fail for incompatible API version");
    }

    expect(result.error).toMatchObject({
      code: "API_VERSION_MISMATCH",
      details: {
        providerApiVersion: SYNC_PROVIDER_API_VERSION + 1,
        supportedApiVersion: SYNC_PROVIDER_API_VERSION,
      },
    });
  });

  it("rejects provider missing required lifecycle methods", () => {
    const registration = createValidRegistration();
    registration.provider.shutdown = undefined as unknown as () => Promise<void>;

    const result = validateSyncProviderRegistration(registration);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected registration to fail for missing provider method");
    }

    expect(result.error).toMatchObject({
      code: "INVALID_PROVIDER",
      details: {
        method: "shutdown",
      },
    });
  });

  it("rejects provider/manifest identity mismatch", () => {
    const registration = createValidRegistration();
    registration.provider.version = "9.9.9";

    const result = validateSyncProviderRegistration(registration);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected registration to fail for provider identity mismatch");
    }

    expect(result.error).toMatchObject({
      code: "IDENTITY_MISMATCH",
      details: {
        manifestVersion: "1.2.3",
        providerVersion: "9.9.9",
      },
    });
  });

  it("rejects invalid manifest apiVersion values", () => {
    const registration = createValidRegistration();
    registration.manifest.apiVersion = 0;

    const result = validateSyncProviderRegistration(registration);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected registration to fail for invalid apiVersion");
    }

    expect(result.error).toMatchObject({
      code: "INVALID_MANIFEST",
      details: {
        field: "apiVersion",
        apiVersion: 0,
      },
    });
  });

  it("rejects non-string manifest name without throwing", () => {
    const registration = createValidRegistration();
    (registration.manifest as unknown as Record<string, unknown>).name = 42;

    const result = validateSyncProviderRegistration(registration);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected registration to fail for non-string manifest name");
    }

    expect(result.error).toMatchObject({
      code: "INVALID_MANIFEST",
      details: {
        field: "name",
      },
    });
  });
});

function createValidRegistration(): SyncProviderRegistration {
  return {
    manifest: {
      name: "github",
      version: "1.2.3",
      apiVersion: SYNC_PROVIDER_API_VERSION,
    },
    provider: {
      name: "github",
      version: "1.2.3",
      async initialize() {},
      async shutdown() {},
      async pull() {
        return {
          tasks: [],
        };
      },
      async push() {},
      mapToTask() {
        return {
          id: "task-1" as never,
          title: "Example",
          status: "active",
          priority: "medium",
          projectId: "project-1" as never,
          labels: [],
          createdAt: new Date(0).toISOString(),
          updatedAt: new Date(0).toISOString(),
        };
      },
      mapFromTask() {
        return {
          externalId: "ext-1",
          title: "Example",
        };
      },
    },
  };
}
