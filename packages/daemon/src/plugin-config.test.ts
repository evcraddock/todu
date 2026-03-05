import { describe, expect, it } from "vitest";
import {
  parseDaemonPluginConfigFromEnv,
  TODUAI_DAEMON_PLUGIN_CONFIG_ENV,
} from "./plugin-config.js";

describe("parseDaemonPluginConfigFromEnv", () => {
  it("returns undefined when env var is not set", () => {
    const parsed = parseDaemonPluginConfigFromEnv({});

    expect(parsed).toEqual({
      pluginConfigs: undefined,
      ignoredEntries: [],
    });
  });

  it("parses plugin config object from JSON", () => {
    const parsed = parseDaemonPluginConfigFromEnv({
      [TODUAI_DAEMON_PLUGIN_CONFIG_ENV]:
        '{"github":{"projectId":"proj-1","intervalSeconds":60},"forgejo":{"enabled":false}}',
    });

    expect(parsed).toEqual({
      pluginConfigs: {
        github: {
          projectId: "proj-1",
          intervalSeconds: 60,
        },
        forgejo: {
          enabled: false,
        },
      },
      ignoredEntries: [],
    });
  });

  it("reports invalid JSON as parse error", () => {
    const parsed = parseDaemonPluginConfigFromEnv({
      [TODUAI_DAEMON_PLUGIN_CONFIG_ENV]: "{bad",
    });

    expect(parsed.pluginConfigs).toEqual({});
    expect(parsed.parseError).toContain("invalid JSON");
  });

  it("ignores non-object plugin entries", () => {
    const parsed = parseDaemonPluginConfigFromEnv({
      [TODUAI_DAEMON_PLUGIN_CONFIG_ENV]: '{"github":true,"ok":{"enabled":true}}',
    });

    expect(parsed).toEqual({
      pluginConfigs: {
        ok: {
          enabled: true,
        },
      },
      ignoredEntries: ["github"],
    });
  });

  it("supports explicit empty plugin config object", () => {
    const parsed = parseDaemonPluginConfigFromEnv({
      [TODUAI_DAEMON_PLUGIN_CONFIG_ENV]: "",
    });

    expect(parsed).toEqual({
      pluginConfigs: {},
      ignoredEntries: [],
    });
  });
});
