import { describe, expect, it } from "vitest";
import {
  isSyncProviderApiVersionCompatible,
  isSyncProviderRegistrationV3,
  isSyncProviderRegistrationV4,
  SYNC_PROVIDER_API_VERSION,
  SYNC_PROVIDER_API_VERSION_V3,
  SYNC_PROVIDER_API_VERSION_V4,
  type SyncProviderRegistrationV3,
  type SyncProviderRegistrationV4,
  validateSyncProviderRegistration,
} from "./sync-provider.js";

describe("isSyncProviderApiVersionCompatible", () => {
  it.each([3, 4])("accepts supported v%s API version", (apiVersion) => {
    expect(isSyncProviderApiVersionCompatible(apiVersion)).toBe(true);
  });

  it("advertises v4 as the latest API", () => {
    expect(SYNC_PROVIDER_API_VERSION).toBe(SYNC_PROVIDER_API_VERSION_V4);
  });

  it("rejects unsupported API version", () => {
    expect(isSyncProviderApiVersionCompatible(SYNC_PROVIDER_API_VERSION_V4 + 1)).toBe(false);
  });

  it("supports explicit supported version lists", () => {
    expect(isSyncProviderApiVersionCompatible(SYNC_PROVIDER_API_VERSION_V3, [3])).toBe(true);
    expect(isSyncProviderApiVersionCompatible(SYNC_PROVIDER_API_VERSION_V3, [4])).toBe(false);
  });
});

describe("validateSyncProviderRegistration", () => {
  it("accepts v4 providers with a pull acknowledgment callback", () => {
    const registration = createValidV4Registration();
    const result = validateSyncProviderRegistration(registration);
    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("Expected valid v4 registration");
    expect(isSyncProviderRegistrationV4(result.value)).toBe(true);
    expect(isSyncProviderRegistrationV3(result.value)).toBe(false);
    expect(result.value.provider).toBe(registration.provider);
  });

  it("rejects v4 providers without a pull acknowledgment callback", () => {
    const registration = createValidV4Registration();
    registration.provider.acknowledgePull = undefined as never;
    const result = validateSyncProviderRegistration(registration);
    expect(result).toMatchObject({
      ok: false,
      error: { code: "INVALID_PROVIDER", details: { method: "acknowledgePull", apiVersion: 4 } },
    });
  });

  it("rejects v4 when the host explicitly supports only v3", () => {
    const result = validateSyncProviderRegistration(createValidV4Registration(), {
      supportedApiVersions: [3],
    });
    expect(result).toMatchObject({ ok: false, error: { code: "API_VERSION_MISMATCH" } });
  });

  it("accepts a valid v3 provider registration", () => {
    const registration = createValidV3Registration();

    const result = validateSyncProviderRegistration(registration);

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error("Expected valid v3 sync provider registration");
    }

    expect(isSyncProviderRegistrationV3(result.value)).toBe(true);
    expect(result.value.manifest).toEqual({
      name: "github",
      version: "1.2.3",
      apiVersion: SYNC_PROVIDER_API_VERSION_V3,
    });
  });

  it("rejects provider with unsupported API version", () => {
    const registration = createValidV3Registration();
    registration.manifest.apiVersion = (SYNC_PROVIDER_API_VERSION_V4 + 1) as never;

    const result = validateSyncProviderRegistration(registration);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected registration to fail for incompatible API version");
    }

    expect(result.error).toMatchObject({
      code: "API_VERSION_MISMATCH",
      details: {
        providerApiVersion: SYNC_PROVIDER_API_VERSION_V4 + 1,
        supportedApiVersions: [SYNC_PROVIDER_API_VERSION_V3, SYNC_PROVIDER_API_VERSION_V4],
      },
    });
  });

  it("supports explicit single-version host policy overrides", () => {
    const registration = createValidV3Registration();

    const result = validateSyncProviderRegistration(registration, {
      supportedApiVersion: 4,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected registration to fail when host disallows v3");
    }

    expect(result.error).toMatchObject({
      code: "API_VERSION_MISMATCH",
      details: {
        providerApiVersion: SYNC_PROVIDER_API_VERSION_V3,
        supportedApiVersion: 4,
        supportedApiVersions: [4],
      },
    });
  });

  it("rejects provider missing required lifecycle methods", () => {
    const registration = createValidV3Registration();
    registration.provider.pull = undefined as unknown as typeof registration.provider.pull;

    const result = validateSyncProviderRegistration(registration);

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("Expected v3 registration to fail for missing provider method");
    }

    expect(result.error).toMatchObject({
      code: "INVALID_PROVIDER",
      details: {
        method: "pull",
        apiVersion: SYNC_PROVIDER_API_VERSION_V3,
      },
    });
  });

  it("rejects provider/manifest identity mismatch", () => {
    const registration = createValidV3Registration();
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
    const registration = createValidV3Registration();
    registration.manifest.apiVersion = 0 as never;

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
    const registration = createValidV3Registration();
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

function createValidV4Registration(): SyncProviderRegistrationV4 {
  return {
    manifest: { name: "github", version: "1.2.3", apiVersion: 4 },
    provider: {
      ...createValidV3Registration().provider,
      async pull() {
        return { tasks: [], checkpoint: { cursor: "opaque" } };
      },
      async acknowledgePull() {},
    },
  };
}

function createValidV3Registration(): SyncProviderRegistrationV3 {
  return {
    manifest: {
      name: "github",
      version: "1.2.3",
      apiVersion: SYNC_PROVIDER_API_VERSION_V3,
    },
    provider: {
      name: "github",
      version: "1.2.3",
      async initialize() {},
      async shutdown() {},
      async pull() {
        return {
          tasks: [],
          comments: [],
        };
      },
      async push() {
        return {
          commentLinks: [],
          taskLinks: [],
        };
      },
    },
  };
}
