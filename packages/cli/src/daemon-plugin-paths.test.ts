import { describe, expect, it } from "vitest";
import { resolveDaemonPluginPaths, TODU_DAEMON_PLUGIN_PATHS_ENV } from "./daemon-plugin-paths.js";

describe("resolveDaemonPluginPaths", () => {
  it("uses TODU_DAEMON_PLUGIN_PATHS over config file plugin paths", () => {
    const resolved = resolveDaemonPluginPaths(
      "/tmp/config.yaml",
      {
        daemon: {
          plugins: {
            paths: ["./plugins/github.js"],
          },
        },
      },
      {
        [TODU_DAEMON_PLUGIN_PATHS_ENV]: "/opt/plugins/current-github.js",
      },
    );

    expect(resolved).toEqual({
      value: "/opt/plugins/current-github.js",
      source: "env",
    });
  });

  it("resolves config file plugin paths relative to config location", () => {
    const resolved = resolveDaemonPluginPaths(
      "/workspace/.todu/config.yaml",
      {
        daemon: {
          plugins: {
            paths: [" ./plugins/github.js ", "../shared/forgejo.js"],
          },
        },
      },
      {},
    );

    expect(resolved).toEqual({
      value: "/workspace/.todu/plugins/github.js,/workspace/shared/forgejo.js",
      source: "file",
    });
  });

  it("keeps explicit empty plugin path list from config", () => {
    const resolved = resolveDaemonPluginPaths(
      "/workspace/.todu/config.yaml",
      { daemon: { plugins: { paths: [] } } },
      {},
    );

    expect(resolved).toEqual({
      value: "",
      source: "file",
    });
  });

  it("ignores empty plugin path entries from config file", () => {
    const resolved = resolveDaemonPluginPaths(
      "/workspace/.todu/config.yaml",
      { daemon: { plugins: { paths: [" ", "./plugins/github.js", ""] } } },
      {},
    );

    expect(resolved).toEqual({
      value: "/workspace/.todu/plugins/github.js",
      source: "file",
    });
  });

  it("returns unset when neither env nor config plugin paths are present", () => {
    expect(resolveDaemonPluginPaths("/tmp/config.yaml", {}, {})).toEqual({
      value: undefined,
      source: "unset",
    });
  });
});
