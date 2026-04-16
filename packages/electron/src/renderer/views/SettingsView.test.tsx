/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Actor } from "@todu/core/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsView } from "./SettingsView.js";

describe("SettingsView", () => {
  const settingsGet = vi.fn();
  const settingsStoredProviders = vi.fn();
  const settingsProviders = vi.fn();
  const settingsSave = vi.fn();
  const settingsVersion = vi.fn();
  const oauthStatus = vi.fn();
  const syncStatus = vi.fn();
  const syncCatalogId = vi.fn();
  const setModel = vi.fn();
  const actorList = vi.fn();
  const actorCreate = vi.fn();
  const actorRename = vi.fn();
  const actorArchive = vi.fn();
  const actorUnarchive = vi.fn();

  let actorState: Actor[];

  beforeEach(() => {
    vi.clearAllMocks();

    actorState = [
      { id: "actor-user", displayName: "user" },
      { id: "actor-reviewer", displayName: "Reviewer" },
    ];

    settingsGet.mockResolvedValue({
      provider: "anthropic",
      modelId: "claude-sonnet-4-20250514",
      timezone: "America/Chicago",
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

    actorList.mockImplementation(async () => ({ ok: true, value: [...actorState] }));
    actorCreate.mockImplementation(async (input: { id: string; displayName: string }) => {
      const actor = { id: input.id, displayName: input.displayName.trim() };
      actorState = [...actorState, actor];
      return { ok: true, value: actor };
    });
    actorRename.mockImplementation(async (id: string, displayName: string) => {
      actorState = actorState.map((actor) =>
        actor.id === id ? { ...actor, displayName: displayName.trim() } : actor,
      );
      const actor = actorState.find((entry) => entry.id === id);
      return { ok: true, value: actor };
    });
    actorArchive.mockImplementation(async (id: string) => {
      actorState = actorState.map((actor) =>
        actor.id === id ? { ...actor, archived: true } : actor,
      );
      const actor = actorState.find((entry) => entry.id === id);
      return { ok: true, value: actor };
    });
    actorUnarchive.mockImplementation(async (id: string) => {
      actorState = actorState.map((actor) =>
        actor.id === id ? { id: actor.id, displayName: actor.displayName } : actor,
      );
      const actor = actorState.find((entry) => entry.id === id);
      return { ok: true, value: actor };
    });

    Object.defineProperty(window, "todu", {
      configurable: true,
      value: {
        actor: {
          list: actorList,
          create: actorCreate,
          rename: actorRename,
          archive: actorArchive,
          unarchive: actorUnarchive,
        },
        settings: {
          get: settingsGet,
          save: settingsSave.mockResolvedValue(undefined),
          setApiKey: vi.fn().mockResolvedValue(undefined),
          removeApiKey: vi.fn().mockResolvedValue(undefined),
          storedProviders: settingsStoredProviders,
          providers: settingsProviders,
          version: settingsVersion,
        },
        agent: {
          setModel: setModel.mockResolvedValue(undefined),
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

  it("renders and saves the journal timezone setting", async () => {
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);

    const timezoneInput = await screen.findByLabelText("Journal timezone");
    expect((timezoneInput as HTMLInputElement).value).toBe("America/Chicago");

    fireEvent.change(timezoneInput, { target: { value: "America/New_York" } });
    fireEvent.click(screen.getAllByText("Save")[0]);

    await waitFor(() => {
      expect(settingsSave).toHaveBeenCalledWith({
        provider: "anthropic",
        modelId: "claude-sonnet-4-20250514",
        timezone: "America/New_York",
      });
    });
    expect(setModel).toHaveBeenCalledWith("anthropic", "claude-sonnet-4-20250514");
  });

  it("manages actors from settings", async () => {
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);

    expect(await screen.findByText("Actors")).toBeDefined();
    expect(screen.getByText("Reviewer")).toBeDefined();
    expect(screen.getByText("ID: actor-reviewer")).toBeDefined();

    fireEvent.change(screen.getByLabelText("New actor ID"), {
      target: { value: "actor-bot" },
    });
    fireEvent.change(screen.getByLabelText("New actor display name"), {
      target: { value: "Automation Bot" },
    });
    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => {
      expect(actorCreate).toHaveBeenCalledWith({
        id: "actor-bot",
        displayName: "Automation Bot",
      });
    });
    await waitFor(() => {
      expect(screen.getByText("Automation Bot")).toBeDefined();
    });

    fireEvent.change(screen.getByLabelText("Actor name actor-reviewer"), {
      target: { value: "Lead Reviewer" },
    });
    fireEvent.click(screen.getAllByText("Rename")[1]);

    await waitFor(() => {
      expect(actorRename).toHaveBeenCalledWith("actor-reviewer", "Lead Reviewer");
    });
    await waitFor(() => {
      expect(screen.getByText("Lead Reviewer")).toBeDefined();
    });

    fireEvent.click(screen.getAllByText("Archive")[1]);
    await waitFor(() => {
      expect(actorArchive).toHaveBeenCalledWith("actor-reviewer");
    });
    await waitFor(() => {
      expect(screen.getByText("Archived")).toBeDefined();
    });

    fireEvent.click(screen.getByText("Unarchive"));
    await waitFor(() => {
      expect(actorUnarchive).toHaveBeenCalledWith("actor-reviewer");
    });
    await waitFor(() => {
      expect(screen.queryByText("Archived")).toBeNull();
    });
  });
});
