import { describe, expect, it } from "vitest";
import { parseDaemonPluginPathsFromEnv, TODUAI_DAEMON_PLUGIN_PATHS_ENV } from "./plugin-paths.js";

describe("parseDaemonPluginPathsFromEnv", () => {
  it("returns undefined module paths when env var is not set", () => {
    const parsed = parseDaemonPluginPathsFromEnv({});

    expect(parsed).toEqual({
      modulePaths: undefined,
      duplicateModulePaths: [],
      ignoredEntries: [],
    });
  });

  it("parses module paths from comma-separated env value", () => {
    const parsed = parseDaemonPluginPathsFromEnv({
      [TODUAI_DAEMON_PLUGIN_PATHS_ENV]: " /plugins/github.js,/plugins/forgejo.js ",
    });

    expect(parsed).toEqual({
      modulePaths: ["/plugins/github.js", "/plugins/forgejo.js"],
      duplicateModulePaths: [],
      ignoredEntries: [],
    });
  });

  it("reports duplicates and ignored empty entries", () => {
    const parsed = parseDaemonPluginPathsFromEnv({
      [TODUAI_DAEMON_PLUGIN_PATHS_ENV]: "/plugins/github.js,,/plugins/github.js, ",
    });

    expect(parsed).toEqual({
      modulePaths: ["/plugins/github.js"],
      duplicateModulePaths: ["/plugins/github.js"],
      ignoredEntries: ["", " "],
    });
  });

  it("supports explicit empty module path list", () => {
    const parsed = parseDaemonPluginPathsFromEnv({
      [TODUAI_DAEMON_PLUGIN_PATHS_ENV]: "",
    });

    expect(parsed).toEqual({
      modulePaths: [],
      duplicateModulePaths: [],
      ignoredEntries: [],
    });
  });
});
