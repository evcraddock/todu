import { describe, expect, it } from "vitest";
import {
  resolveDaemonPluginConfig,
  TODU_DAEMON_PLUGIN_CONFIG_ENV,
  TODUAI_DAEMON_PLUGIN_CONFIG_ENV,
} from "./daemon-plugin-config.js";

describe("resolveDaemonPluginConfig", () => {
  it("prefers TODU_DAEMON_PLUGIN_CONFIG over legacy env var and config file plugin config", () => {
    const resolved = resolveDaemonPluginConfig(
      {
        daemon: {
          plugins: {
            config: {
              github: {
                intervalSeconds: 300,
              },
            },
          },
        },
      },
      {
        [TODU_DAEMON_PLUGIN_CONFIG_ENV]: '{"github":{"intervalSeconds":60}}',
        [TODUAI_DAEMON_PLUGIN_CONFIG_ENV]: '{"github":{"intervalSeconds":30}}',
      },
    );

    expect(resolved).toEqual({
      value: '{"github":{"intervalSeconds":60}}',
      source: "env",
    });
  });

  it("falls back to legacy env override", () => {
    const resolved = resolveDaemonPluginConfig(
      {
        daemon: {
          plugins: {
            config: {
              github: {
                intervalSeconds: 300,
              },
            },
          },
        },
      },
      {
        [TODUAI_DAEMON_PLUGIN_CONFIG_ENV]: '{"github":{"intervalSeconds":30}}',
      },
    );

    expect(resolved).toEqual({
      value: '{"github":{"intervalSeconds":30}}',
      source: "env",
    });
  });

  it("serializes config file plugin config as JSON", () => {
    const resolved = resolveDaemonPluginConfig(
      {
        daemon: {
          plugins: {
            config: {
              github: {
                projectId: "proj-1",
                strategy: "pull",
              },
            },
          },
        },
      },
      {},
    );

    expect(resolved).toEqual({
      value: '{"github":{"projectId":"proj-1","strategy":"pull"}}',
      source: "file",
    });
  });

  it("returns unset when plugin config is not present", () => {
    const resolved = resolveDaemonPluginConfig({}, {});

    expect(resolved).toEqual({
      value: undefined,
      source: "unset",
    });
  });
});
