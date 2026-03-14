/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./SettingsView.js";

describe("SettingsView app version", () => {
  const settingsGet = vi.fn();
  const settingsStoredProviders = vi.fn();
  const settingsProviders = vi.fn();
  const settingsVersion = vi.fn();
  const oauthStatus = vi.fn();
  const syncStatus = vi.fn();
  const syncCatalogId = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    settingsGet.mockResolvedValue({
      provider: "anthropic",
      modelId: "claude-sonnet-4-20250514",
    });
    settingsStoredProviders.mockResolvedValue({});
    settingsProviders.mockResolvedValue([
      {
        id: "anthropic",
        label: "Anthropic",
        models: [{ id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" }],
      },
    ]);
    settingsVersion.mockResolvedValue("0.7.7");
    oauthStatus.mockResolvedValue([]);
    syncStatus.mockResolvedValue({
      local: { mode: "local" },
      remote: { state: "disconnected" },
    });
    syncCatalogId.mockResolvedValue("");

    Object.defineProperty(window, "todu", {
      configurable: true,
      value: {
        settings: {
          get: settingsGet,
          save: vi.fn().mockResolvedValue(undefined),
          setApiKey: vi.fn().mockResolvedValue(undefined),
          removeApiKey: vi.fn().mockResolvedValue(undefined),
          storedProviders: settingsStoredProviders,
          providers: settingsProviders,
          version: settingsVersion,
        },
        agent: {
          setModel: vi.fn().mockResolvedValue(undefined),
        },
        oauth: {
          status: oauthStatus,
          login: vi.fn().mockResolvedValue(undefined),
          promptResponse: vi.fn().mockResolvedValue(undefined),
          cancel: vi.fn().mockResolvedValue(undefined),
          disconnect: vi.fn().mockResolvedValue(undefined),
        },
        sync: {
          status: syncStatus,
          getCatalogId: syncCatalogId,
          joinCheck: vi.fn().mockResolvedValue(undefined),
          join: vi.fn().mockResolvedValue(undefined),
          start: vi.fn().mockResolvedValue(undefined),
          stop: vi.fn().mockResolvedValue(undefined),
        },
        on: vi.fn(() => () => {}),
      } as unknown as Window["todu"],
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the app version in the settings view", async () => {
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);

    expect(await screen.findByText("App")).toBeDefined();
    expect(await screen.findByText("v0.7.7")).toBeDefined();
    expect(settingsVersion).toHaveBeenCalledTimes(1);
  });

  it("shows an unavailable fallback when version lookup fails", async () => {
    settingsVersion.mockRejectedValueOnce(new Error("version unavailable"));

    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);

    await waitFor(() => {
      expect(screen.getByText("Unavailable")).toBeDefined();
    });
  });
});
