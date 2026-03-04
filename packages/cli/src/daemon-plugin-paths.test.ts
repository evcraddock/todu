import { describe, expect, it } from "vitest";
import { resolveDaemonPluginPaths, TODUAI_DAEMON_PLUGIN_PATHS_ENV } from "./daemon-plugin-paths.js";

describe("resolveDaemonPluginPaths", () => {
  it("prefers env override over config file plugin paths", () => {
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
        [TODUAI_DAEMON_PLUGIN_PATHS_ENV]: "/opt/plugins/github.js",
      },
    );

    expect(resolved).toEqual({
      value: "/opt/plugins/github.js",
      source: "env",
    });
  });

  it("resolves config file plugin paths relative to config location", () => {
    const resolved = resolveDaemonPluginPaths(
      "/workspace/.toduai/config.yaml",
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
      value: "/workspace/.toduai/plugins/github.js,/workspace/shared/forgejo.js",
      source: "file",
    });
  });

  it("keeps explicit empty plugin path list from config", () => {
    const resolved = resolveDaemonPluginPaths(
      "/workspace/.toduai/config.yaml",
      {
        daemon: {
          plugins: {
            paths: [],
          },
        },
      },
      {},
    );

    expect(resolved).toEqual({
      value: "",
      source: "file",
    });
  });

  it("ignores empty plugin path entries from config file", () => {
    const resolved = resolveDaemonPluginPaths(
      "/workspace/.toduai/config.yaml",
      {
        daemon: {
          plugins: {
            paths: [" ", "./plugins/github.js", ""],
          },
        },
      },
      {},
    );

    expect(resolved).toEqual({
      value: "/workspace/.toduai/plugins/github.js",
      source: "file",
    });
  });

  it("returns unset when neither env nor config plugin paths are present", () => {
    const resolved = resolveDaemonPluginPaths("/tmp/config.yaml", {}, {});

    expect(resolved).toEqual({
      value: undefined,
      source: "unset",
    });
  });
});
