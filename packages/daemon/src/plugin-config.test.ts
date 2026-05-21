import { describe, expect, it } from "vitest";
import { parseDaemonPluginConfigFromEnv, TODU_DAEMON_PLUGIN_CONFIG_ENV } from "./plugin-config.js";

describe("parseDaemonPluginConfigFromEnv", () => {
  it("returns undefined when env var is not set", () => {
    expect(parseDaemonPluginConfigFromEnv({})).toEqual({
      pluginConfigs: undefined,
      ignoredEntries: [],
    });
  });

  it("parses TODU_DAEMON_PLUGIN_CONFIG", () => {
    expect(
      parseDaemonPluginConfigFromEnv({
        [TODU_DAEMON_PLUGIN_CONFIG_ENV]: '{"github":{"projectId":"proj-current"}}',
      }),
    ).toEqual({
      pluginConfigs: {
        github: {
          projectId: "proj-current",
        },
      },
      ignoredEntries: [],
    });
  });

  it("reports invalid JSON as parse error", () => {
    const parsed = parseDaemonPluginConfigFromEnv({ [TODU_DAEMON_PLUGIN_CONFIG_ENV]: "{bad" });
    expect(parsed.pluginConfigs).toEqual({});
    expect(parsed.parseError).toContain("invalid JSON");
  });

  it("ignores non-object plugin entries", () => {
    expect(
      parseDaemonPluginConfigFromEnv({
        [TODU_DAEMON_PLUGIN_CONFIG_ENV]: '{"github":true,"ok":{"enabled":true}}',
      }),
    ).toEqual({
      pluginConfigs: {
        ok: {
          enabled: true,
        },
      },
      ignoredEntries: ["github"],
    });
  });

  it("supports explicit empty plugin config object", () => {
    expect(parseDaemonPluginConfigFromEnv({ [TODU_DAEMON_PLUGIN_CONFIG_ENV]: "" })).toEqual({
      pluginConfigs: {},
      ignoredEntries: [],
    });
  });
});
