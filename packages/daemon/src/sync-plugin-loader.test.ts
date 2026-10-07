import { describe, expect, it } from "vitest";
import { loadConfiguredPlugins } from "./sync-plugin-loader.js";

function createModule(apiVersion: number, acknowledge = true) {
  return {
    syncProvider: {
      manifest: { name: "test", version: "1.0.0", apiVersion },
      provider: {
        name: "test",
        version: "1.0.0",
        async initialize() {},
        async shutdown() {},
        async pull() {
          return { tasks: [], taskUpdates: [], checkpoint: "opaque" };
        },
        async push() {
          return { taskLinks: [], commentLinks: [] };
        },
        ...(acknowledge ? { async acknowledgePull() {} } : {}),
      },
    },
  };
}

describe("sync provider loading", () => {
  it.each([
    3, 4, 5,
  ])("loads supported API v%s and preserves its declared version", async (apiVersion) => {
    const module = createModule(apiVersion, apiVersion >= 4);
    const result = await loadConfiguredPlugins({
      modulePaths: ["/plugins/test.mjs"],
      importModule: async () => module,
    });
    expect(result.failures).toEqual([]);
    expect(result.loadedPlugins).toHaveLength(1);
    expect(result.loadedPlugins[0]).toMatchObject({
      kind: "sync-provider",
      manifest: { apiVersion },
      provider: module.syncProvider.provider,
    });
  });

  it("rejects unsupported v6 before worker registration", async () => {
    const result = await loadConfiguredPlugins({
      modulePaths: ["/plugins/test.mjs"],
      importModule: async () => createModule(6),
    });
    expect(result.loadedPlugins).toEqual([]);
    expect(result.failures).toMatchObject([
      { code: "INVALID_PROVIDER", details: { validationError: { code: "API_VERSION_MISMATCH" } } },
    ]);
  });

  it("rejects a v4 provider without acknowledgment before worker registration", async () => {
    const result = await loadConfiguredPlugins({
      modulePaths: ["/plugins/test.mjs"],
      importModule: async () => createModule(4, false),
    });
    expect(result.loadedPlugins).toEqual([]);
    expect(result.failures).toEqual([expect.objectContaining({ code: "INVALID_PROVIDER" })]);
  });
});
