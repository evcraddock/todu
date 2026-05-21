import { describe, expect, it } from "vitest";
import { parseDaemonPluginPathsFromEnv, TODU_DAEMON_PLUGIN_PATHS_ENV } from "./plugin-paths.js";

describe("parseDaemonPluginPathsFromEnv", () => {
  it("returns undefined module paths when env var is not set", () => {
    expect(parseDaemonPluginPathsFromEnv({})).toEqual({
      modulePaths: undefined,
      duplicateModulePaths: [],
      ignoredEntries: [],
    });
  });

  it("parses TODU_DAEMON_PLUGIN_PATHS", () => {
    expect(
      parseDaemonPluginPathsFromEnv({ [TODU_DAEMON_PLUGIN_PATHS_ENV]: " /plugins/current.js " }),
    ).toEqual({
      modulePaths: ["/plugins/current.js"],
      duplicateModulePaths: [],
      ignoredEntries: [],
    });
  });

  it("reports duplicates and ignored empty entries", () => {
    expect(
      parseDaemonPluginPathsFromEnv({
        [TODU_DAEMON_PLUGIN_PATHS_ENV]: "/plugins/github.js,,/plugins/github.js, ",
      }),
    ).toEqual({
      modulePaths: ["/plugins/github.js"],
      duplicateModulePaths: ["/plugins/github.js"],
      ignoredEntries: ["", " "],
    });
  });

  it("supports explicit empty module path list", () => {
    expect(parseDaemonPluginPathsFromEnv({ [TODU_DAEMON_PLUGIN_PATHS_ENV]: "" })).toEqual({
      modulePaths: [],
      duplicateModulePaths: [],
      ignoredEntries: [],
    });
  });
});
