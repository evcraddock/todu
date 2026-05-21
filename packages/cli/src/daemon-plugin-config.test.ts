import { describe, expect, it } from "vitest";
import {
  resolveDaemonPluginConfig,
  TODU_DAEMON_PLUGIN_CONFIG_ENV,
} from "./daemon-plugin-config.js";

describe("resolveDaemonPluginConfig", () => {
  it("uses TODU_DAEMON_PLUGIN_CONFIG over config file plugin config", () => {
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
      },
    );

    expect(resolved).toEqual({
      value: '{"github":{"intervalSeconds":60}}',
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
    expect(resolveDaemonPluginConfig({}, {})).toEqual({
      value: undefined,
      source: "unset",
    });
  });
});
