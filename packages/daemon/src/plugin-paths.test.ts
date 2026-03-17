import { describe, expect, it } from "vitest";
import {
  parseDaemonPluginPathsFromEnv,
  TODU_DAEMON_PLUGIN_PATHS_ENV,
  TODUAI_DAEMON_PLUGIN_PATHS_ENV,
} from "./plugin-paths.js";

describe("parseDaemonPluginPathsFromEnv", () => {
  it("returns undefined module paths when env vars are not set", () => {
    const parsed = parseDaemonPluginPathsFromEnv({});

    expect(parsed).toEqual({
      modulePaths: undefined,
      duplicateModulePaths: [],
      ignoredEntries: [],
    });
  });

  it("prefers TODU_DAEMON_PLUGIN_PATHS over the legacy env var", () => {
    const parsed = parseDaemonPluginPathsFromEnv({
      [TODU_DAEMON_PLUGIN_PATHS_ENV]: " /plugins/current.js ",
      [TODUAI_DAEMON_PLUGIN_PATHS_ENV]: " /plugins/legacy.js ",
    });

    expect(parsed).toEqual({
      modulePaths: ["/plugins/current.js"],
      duplicateModulePaths: [],
      ignoredEntries: [],
    });
  });

  it("falls back to the legacy env var", () => {
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
      [TODU_DAEMON_PLUGIN_PATHS_ENV]: "/plugins/github.js,,/plugins/github.js, ",
    });

    expect(parsed).toEqual({
      modulePaths: ["/plugins/github.js"],
      duplicateModulePaths: ["/plugins/github.js"],
      ignoredEntries: ["", " "],
    });
  });

  it("supports explicit empty module path list", () => {
    const parsed = parseDaemonPluginPathsFromEnv({
      [TODU_DAEMON_PLUGIN_PATHS_ENV]: "",
    });

    expect(parsed).toEqual({
      modulePaths: [],
      duplicateModulePaths: [],
      ignoredEntries: [],
    });
  });
});
