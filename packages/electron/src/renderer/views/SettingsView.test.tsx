/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
          enrollmentRequests: vi.fn().mockResolvedValue([]),
          enrollmentStatus: vi.fn().mockResolvedValue({ stage: "idle" }),
          daemonStatus: vi.fn().mockResolvedValue({
            state: "running",
            healthy: true,
            role: "node",
            startedAt: "2026-10-24T17:00:00Z",
            transport: { kind: "uds", path: "/tmp/todu-dev.sock", mode: 384 },
            catalog: { id: "catalog-current" },
          }),
          restartDaemon: vi.fn().mockResolvedValue(undefined),
          listenerSettings: vi.fn().mockResolvedValue({ enabled: false }),
          configureListener: vi.fn().mockImplementation(async (enabled: boolean) => ({ enabled })),
          configureServer: vi.fn(),
          devices: vi.fn().mockResolvedValue([{ id: "device-local", name: "My laptop" }]),
          serverStatus: vi
            .fn()
            .mockResolvedValue({ enabled: false, running: false, state: "disconnected" }),
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

  it("shows OAuth device-code progress and allows cancellation before a prompt", async () => {
    oauthStatus.mockResolvedValue([
      { id: "github-copilot", name: "GitHub Copilot", connected: false, expired: false },
    ]);
    let onOAuthEvent: ((data: unknown) => void) | undefined;
    vi.mocked(window.todu.on).mockImplementation((channel, callback) => {
      if (channel === "todu:oauth:event") onOAuthEvent = callback;
      return () => {};
    });
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "AI", exact: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Connect GitHub Copilot" }));
    fireEvent.click(await screen.findByRole("button", { name: "Login" }));
    act(() =>
      onOAuthEvent?.({
        type: "progress",
        providerId: "github-copilot",
        message: "Enter code ABCD at https://example.com/activate",
      }),
    );
    expect(screen.getByRole("status").textContent).toContain("Enter code ABCD");
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(window.todu.oauth.cancel).toHaveBeenCalledOnce();
  });

  it("shows provider prompt instructions and masks secret responses", async () => {
    oauthStatus.mockResolvedValue([
      { id: "anthropic", name: "Anthropic", connected: false, expired: false },
    ]);
    let onOAuthEvent: ((data: unknown) => void) | undefined;
    vi.mocked(window.todu.on).mockImplementation((channel, callback) => {
      if (channel === "todu:oauth:event") onOAuthEvent = callback;
      return () => {};
    });
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "AI", exact: true }));
    fireEvent.click(await screen.findByRole("button", { name: "Connect Anthropic" }));
    await screen.findByRole("button", { name: "Login" });
    act(() =>
      onOAuthEvent?.({
        type: "prompt",
        providerId: "anthropic",
        message: "Enter your secret",
        placeholder: "Secret",
        inputType: "password",
      }),
    );
    expect(screen.getByText("Enter your secret")).toBeDefined();
    expect(screen.getByPlaceholderText("Secret").getAttribute("type")).toBe("password");
  });

  it("shows an unavailable saved model instead of displaying a different model", async () => {
    settingsStoredProviders.mockResolvedValue({ anthropic: true });
    settingsGet.mockResolvedValue({
      provider: "anthropic",
      modelId: "retired-model",
      timezone: "America/Chicago",
    });
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "AI", exact: true }));
    const model = await screen.findByRole("combobox", { name: "Model" });
    expect((model as HTMLSelectElement).value).toBe("retired-model");
    expect(screen.getByRole("option", { name: "retired-model (unavailable)" })).toBeDefined();
  });

  it("defaults to General and groups settings into tabs without About", async () => {
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    expect(await screen.findByRole("combobox", { name: "Theme" })).toBeDefined();
    expect(screen.queryByRole("combobox", { name: "Model" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "AI", exact: true }));
    expect(screen.getByRole("combobox", { name: "Model" })).toBeDefined();
    expect(screen.queryByRole("combobox", { name: "Theme" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Sync", exact: true }));
    expect(screen.getByRole("switch", { name: "Use sync server" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "About" })).toBeNull();
    expect(settingsVersion).not.toHaveBeenCalled();
  });

  it("renders and saves the journal timezone setting", async () => {
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);

    const timezoneInput = await screen.findByLabelText("Journal timezone");
    expect((timezoneInput as HTMLInputElement).value).toBe("America/Chicago");

    fireEvent.change(timezoneInput, { target: { value: "America/New_York" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(settingsSave).toHaveBeenCalledWith({
        provider: "anthropic",
        modelId: "claude-sonnet-4-20250514",
        timezone: "America/New_York",
      });
    });
    expect(setModel).not.toHaveBeenCalled();
  });

  it("saves AI without saving a pending timezone edit and preserves edits across tabs", async () => {
    settingsStoredProviders.mockResolvedValue({ anthropic: true });
    settingsProviders.mockResolvedValue([
      {
        id: "anthropic",
        label: "Anthropic",
        models: [
          { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
          { id: "claude-next", label: "Claude Next" },
        ],
      },
    ]);
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    const timezone = await screen.findByLabelText("Journal timezone");
    fireEvent.change(timezone, { target: { value: "UTC" } });
    fireEvent.click(screen.getByRole("button", { name: "AI", exact: true }));
    fireEvent.change(screen.getByRole("combobox", { name: "Model" }), {
      target: { value: "claude-next" },
    });
    await waitFor(() => expect(setModel).toHaveBeenCalledWith("anthropic", "claude-next"));
    expect(settingsSave).toHaveBeenCalledWith(
      expect.objectContaining({ timezone: "America/Chicago" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "General", exact: true }));
    expect((screen.getByLabelText("Journal timezone") as HTMLInputElement).value).toBe("UTC");
  });

  it("guides dataset connection and requires a successful check before connecting", async () => {
    syncCatalogId.mockResolvedValue("catalog-current");
    syncStatus.mockResolvedValue({
      listener: { state: "listening", bind: "192.168.1.10", port: 24377 },
      local: { mode: "standalone" },
      remote: { state: "syncing", server: "ws://localhost:3030" },
    });
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sync", exact: true }));
    expect(await screen.findByText("My laptop")).toBeDefined();
    for (const name of ["Devices sharing this data", "Direct Sync", "Sync Server"]) {
      expect(screen.getByRole("heading", { name, exact: true })).toBeDefined();
    }
    expect(screen.getByText("Listening")).toBeDefined();
    expect(screen.queryByRole("button", { name: "Check connection" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Connect this computer to existing data" }));
    expect(
      (screen.getByRole("button", { name: "Connect to dataset" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("Paste catalog ID here"), {
      target: { value: "catalog-other" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
    await waitFor(() => expect(window.todu.sync.joinCheck).toHaveBeenCalledWith("catalog-other"));
    expect(window.todu.sync.join).not.toHaveBeenCalled();
  });

  it("shows sharing guidance when no connection methods are enabled", async () => {
    syncCatalogId.mockResolvedValue("catalog-current");
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sync", exact: true }));
    await screen.findByText("My laptop");
    fireEvent.click(screen.getByRole("button", { name: "Connect another computer to this data" }));
    expect(
      await screen.findByText(
        "No connection method is enabled. Set one up below before connecting another computer.",
      ),
    ).toBeDefined();
    expect(screen.getByText("catalog-current", { selector: "code" })).toBeDefined();
    expect(screen.queryByText("Advanced", { selector: "summary" })).toBeNull();
  });

  it("enables connection after validation and invalidates the check when the catalog changes", async () => {
    vi.mocked(window.todu.sync.joinCheck).mockResolvedValue({
      mode: "check",
      previousCatalogId: "catalog-local",
      targetCatalogId: "catalog-other",
      switched: false,
      rolledBack: false,
    });
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sync", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Connect this computer to existing data" }));
    const input = screen.getByPlaceholderText("Paste catalog ID here");
    fireEvent.change(input, { target: { value: "catalog-other" } });
    fireEvent.click(screen.getByRole("button", { name: "Check connection" }));
    const connect = screen.getByRole("button", { name: "Connect to dataset" }) as HTMLButtonElement;
    await waitFor(() => expect(connect.disabled).toBe(false));
    fireEvent.change(input, { target: { value: "another-catalog" } });
    expect(connect.disabled).toBe(true);
    expect(window.todu.sync.join).not.toHaveBeenCalled();
  });

  it("keeps other sync sections available when the device list fails", async () => {
    vi.mocked(window.todu.sync.devices).mockRejectedValue(new Error("offline"));
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sync", exact: true }));
    expect(await screen.findByText("Devices unavailable.")).toBeDefined();
    expect(screen.getByRole("heading", { name: "Sync Server", exact: true })).toBeDefined();
  });

  it("toggles the saved server and only shows an editable address while enabled", async () => {
    const server = {
      server: "ws://localhost:3030",
      enabled: false,
      running: false,
      state: "disconnected" as const,
    };
    vi.mocked(window.todu.sync.serverStatus).mockResolvedValue(server);
    vi.mocked(window.todu.sync.configureServer).mockImplementation(async (input) => ({
      ...server,
      ...input,
    }));
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sync", exact: true }));
    const toggle = screen.getByRole("switch", { name: "Use sync server" });
    await waitFor(() => expect((toggle as HTMLInputElement).disabled).toBe(false));
    expect(screen.queryByLabelText("Server address")).toBeNull();
    fireEvent.click(toggle);
    expect(await screen.findByLabelText("Server address")).toBeDefined();
    expect(window.todu.sync.configureServer).toHaveBeenCalledWith({ enabled: true });
    fireEvent.change(screen.getByLabelText("Server address"), {
      target: { value: "wss://sync.example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save address" }));
    await waitFor(() =>
      expect(window.todu.sync.configureServer).toHaveBeenCalledWith({
        server: "wss://sync.example.com",
        enabled: true,
      }),
    );
    await waitFor(() => expect((toggle as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(toggle);
    await waitFor(() => expect(screen.queryByLabelText("Server address")).toBeNull());
    expect(window.todu.sync.configureServer).toHaveBeenLastCalledWith({ enabled: false });
  });

  it("requests an address before enabling an unconfigured server", async () => {
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sync", exact: true }));
    const toggle = screen.getByRole("switch", { name: "Use sync server" });
    await waitFor(() => expect((toggle as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(toggle);
    expect(screen.getByLabelText("Server address")).toBeDefined();
    expect(window.todu.sync.configureServer).not.toHaveBeenCalled();
  });

  it("retains the enabled state and address when disabling fails", async () => {
    vi.mocked(window.todu.sync.serverStatus).mockResolvedValue({
      server: "ws://localhost:3030",
      enabled: true,
      running: true,
      state: "disconnected",
    });
    vi.mocked(window.todu.sync.configureServer).mockRejectedValue(
      new Error("Could not save config"),
    );
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sync", exact: true }));
    await screen.findByLabelText("Server address");
    fireEvent.click(screen.getByRole("switch", { name: "Use sync server" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Could not save config");
    expect(
      (screen.getByRole("switch", { name: "Use sync server" }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(screen.getByLabelText("Server address")).toBeDefined();
  });

  it("saves direct listener enablement and shows the restart requirement", async () => {
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sync", exact: true }));
    const toggle = screen.getByRole("switch", { name: "Allow direct sync" });
    await waitFor(() => expect((toggle as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(toggle);
    await waitFor(() => expect((toggle as HTMLInputElement).checked).toBe(true));
    expect(window.todu.sync.configureListener).toHaveBeenCalledWith(true);
    expect(
      screen.getByText("Settings saved. Restart the daemon from the Status tab to apply."),
    ).toBeDefined();
    expect(window.todu.sync.configureServer).not.toHaveBeenCalled();
    fireEvent.click(toggle);
    await waitFor(() => expect((toggle as HTMLInputElement).checked).toBe(false));
    expect(window.todu.sync.configureListener).toHaveBeenLastCalledWith(false);
  });

  it("keeps the direct listener toggle unchanged when saving fails", async () => {
    vi.mocked(window.todu.sync.configureListener).mockRejectedValue(
      new Error("Cannot save listener"),
    );
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sync", exact: true }));
    const toggle = screen.getByRole("switch", { name: "Allow direct sync" });
    await waitFor(() => expect((toggle as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(toggle);
    expect((await screen.findByRole("alert")).textContent).toBe("Cannot save listener");
    expect((toggle as HTMLInputElement).checked).toBe(false);
  });

  it("restarts the daemon and refreshes listener status after reconnection", async () => {
    let finishRestart!: () => void;
    vi.mocked(window.todu.sync.restartDaemon).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishRestart = resolve;
        }),
    );
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Status", exact: true }));
    const restart = screen.getByRole("button", { name: "Restart daemon" });
    await waitFor(() => expect((restart as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(restart);
    expect(screen.getByRole("button", { name: "Restarting daemon..." })).toBeDefined();
    expect(
      (screen.getByRole("button", { name: "Restarting daemon..." }) as HTMLButtonElement).disabled,
    ).toBe(true);
    syncStatus.mockResolvedValue({
      listener: { state: "listening" },
      local: { mode: "standalone" },
      remote: { state: "disconnected" },
    });
    await act(async () => finishRestart());
    expect(await screen.findByText("Healthy")).toBeDefined();
    expect(window.todu.sync.restartDaemon).toHaveBeenCalledOnce();
  });

  it("shows restart failures and lets the user retry", async () => {
    vi.mocked(window.todu.sync.restartDaemon).mockRejectedValue(new Error("Restart failed"));
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Status", exact: true }));
    const restart = screen.getByRole("button", { name: "Restart daemon" });
    await waitFor(() => expect((restart as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(restart);
    expect((await screen.findByRole("alert")).textContent).toBe("Restart failed");
    expect(
      (screen.getByRole("button", { name: "Restart daemon" }) as HTMLButtonElement).disabled,
    ).toBe(false);
  });

  it("shows daemon details in Status and keeps restart out of Sync", async () => {
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Sync", exact: true }));
    expect(screen.queryByRole("button", { name: "Restart daemon" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Status", exact: true }));
    expect(await screen.findByText("Healthy")).toBeDefined();
    expect(screen.getByText("/tmp/todu-dev.sock")).toBeDefined();
    expect(screen.getByText("running", { selector: "dd" })).toBeDefined();
    expect(screen.getByRole("button", { name: "Restart daemon" })).toBeDefined();
  });

  it("shows an unavailable daemon without leaving stale healthy details", async () => {
    vi.mocked(window.todu.sync.daemonStatus).mockRejectedValue(
      new Error("Daemon socket unavailable"),
    );
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "Status", exact: true }));
    expect(await screen.findByText("Daemon unavailable")).toBeDefined();
    expect(screen.getByRole("alert").textContent).toBe("Daemon socket unavailable");
    expect(screen.queryByText("Healthy")).toBeNull();
  });

  it("groups subscriptions and API keys in one provider panel", async () => {
    oauthStatus.mockResolvedValue([
      { id: "anthropic", name: "Anthropic subscription", connected: true, expired: false },
    ]);
    settingsStoredProviders.mockResolvedValue({ anthropic: true });
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "AI", exact: true }));
    expect(screen.getByRole("heading", { name: "Assistant model" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Manage Anthropic" }));
    const panel = screen.getByRole("dialog", { name: "Anthropic connection" });
    expect(within(panel).getByRole("heading", { name: "Subscription" })).toBeDefined();
    expect(within(panel).getByRole("heading", { name: "API key" })).toBeDefined();
    expect(within(panel).getByText(/subscription takes priority/)).toBeDefined();
    expect(within(panel).getByRole("button", { name: "Disconnect" })).toBeDefined();
    expect(within(panel).getByRole("button", { name: "Remove key" })).toBeDefined();
  });

  it("saves a key inside the panel without claiming the credential is verified", async () => {
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "AI", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Connect Anthropic" }));
    const input = screen.getByLabelText("Anthropic API key") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "test-api-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));
    await waitFor(() => expect(input.value).toBe(""));
    expect(window.todu.settings.setApiKey).toHaveBeenCalledWith("anthropic", "test-api-key");
    expect(screen.getByText("Anthropic: Key saved")).toBeDefined();
    expect(screen.queryByText("Subscription connected")).toBeNull();
  });

  it("shows key errors beside the provider controls and retains the input for retry", async () => {
    vi.mocked(window.todu.settings.setApiKey).mockRejectedValue(new Error("Could not encrypt key"));
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "AI", exact: true }));
    fireEvent.click(screen.getByRole("button", { name: "Connect Anthropic" }));
    fireEvent.change(screen.getByLabelText("Anthropic API key"), { target: { value: "test-key" } });
    fireEvent.click(screen.getByRole("button", { name: "Save key" }));
    const panel = screen.getByRole("dialog", { name: "Anthropic connection" });
    expect((await within(panel).findByRole("alert")).textContent).toContain(
      "Could not encrypt key",
    );
    expect((screen.getByLabelText("Anthropic API key") as HTMLInputElement).value).toBe("test-key");
  });

  it("filters provider rows and omits unsupported API key controls", async () => {
    settingsProviders.mockResolvedValue([
      { id: "copilot", label: "Copilot", models: [], supportsApiKey: false },
      { id: "anthropic", label: "Anthropic", models: [] },
    ]);
    oauthStatus.mockResolvedValue([
      { id: "copilot", name: "Copilot", connected: false, expired: false },
    ]);
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "AI", exact: true }));
    fireEvent.change(screen.getByLabelText("Filter providers"), { target: { value: "copilot" } });
    expect(screen.queryByRole("button", { name: "Connect Anthropic" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Connect Copilot" }));
    expect(screen.getByRole("button", { name: "Login" })).toBeDefined();
    expect(screen.queryByRole("button", { name: "Save key" })).toBeNull();
  });

  it("opens provider controls in a dialog and restores focus when dismissed", async () => {
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "AI", exact: true }));
    const trigger = screen.getByRole("button", { name: "Connect Anthropic" });
    trigger.focus();
    const rows = screen.getAllByRole("row").length;
    fireEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Anthropic connection" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(screen.getAllByRole("row").length).toBe(rows);
    expect(document.activeElement).toBe(within(dialog).getByRole("button", { name: "Close" }));
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(window.todu.settings.setApiKey).not.toHaveBeenCalled();
  });

  it("offers only connected providers for the assistant and keeps disconnected choices in connections", async () => {
    settingsProviders.mockResolvedValue([
      {
        id: "anthropic",
        label: "Anthropic",
        models: [{ id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" }],
      },
      { id: "openai", label: "OpenAI", models: [{ id: "gpt-test", label: "GPT Test" }] },
    ]);
    oauthStatus.mockResolvedValue([
      { id: "openai", name: "OpenAI", connected: true, expired: false },
    ]);
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "AI", exact: true }));
    const picker = screen.getByRole("combobox", { name: "Provider" });
    expect(within(picker).queryByRole("option", { name: "Anthropic", exact: true })).toBeNull();
    expect(within(picker).getByRole("option", { name: "OpenAI", exact: true })).toBeDefined();
    expect(
      within(screen.getByRole("table", { name: "Connected providers" })).getByRole("button", {
        name: "Manage OpenAI",
      }),
    ).toBeDefined();
    expect(
      within(screen.getByRole("table", { name: "Other providers" })).getByRole("button", {
        name: "Connect Anthropic",
      }),
    ).toBeDefined();
    expect(screen.queryByRole("button", { name: "Save AI" })).toBeNull();
    fireEvent.change(picker, { target: { value: "openai" } });
    expect((screen.getByRole("combobox", { name: "Model" }) as HTMLSelectElement).value).toBe(
      "gpt-test",
    );
    await waitFor(() => expect(setModel).toHaveBeenCalledWith("openai", "gpt-test"));
    expect(settingsSave).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "openai", modelId: "gpt-test" }),
    );
  });

  it("does not offer models unsupported by a connected subscription alias", async () => {
    settingsGet.mockResolvedValue({ provider: "openai", modelId: "shared-model", timezone: "UTC" });
    settingsProviders.mockResolvedValue([
      {
        id: "openai",
        label: "OpenAI",
        oauthAliases: ["openai-codex"],
        models: [
          { id: "shared-model", label: "Shared" },
          { id: "api-only", label: "API Only" },
        ],
      },
      {
        id: "openai-codex",
        label: "OpenAI Codex",
        models: [{ id: "shared-model", label: "Shared" }],
      },
    ]);
    oauthStatus.mockResolvedValue([
      { id: "openai-codex", name: "Codex", connected: true, expired: false },
    ]);
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "AI", exact: true }));
    const models = screen.getByRole("combobox", { name: "Model" });
    expect(within(models).getByRole("option", { name: "Shared" })).toBeDefined();
    expect(within(models).queryByRole("option", { name: "API Only" })).toBeNull();
  });

  it("restores the prior selection and saved settings when applying a model fails", async () => {
    settingsStoredProviders.mockResolvedValue({ anthropic: true });
    settingsProviders.mockResolvedValue([
      {
        id: "anthropic",
        label: "Anthropic",
        models: [
          { id: "claude-sonnet-4-20250514", label: "Current model" },
          { id: "claude-next", label: "Next model" },
        ],
      },
    ]);
    setModel.mockRejectedValueOnce(new Error("Model switch failed"));
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "AI", exact: true }));
    fireEvent.change(screen.getByRole("combobox", { name: "Model" }), {
      target: { value: "claude-next" },
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Model switch failed");
    expect((screen.getByRole("combobox", { name: "Model" }) as HTMLSelectElement).value).toBe(
      "claude-sonnet-4-20250514",
    );
    expect(settingsSave).toHaveBeenLastCalledWith(
      expect.objectContaining({ modelId: "claude-sonnet-4-20250514" }),
    );
  });

  it("does not change the active model if saving the selection fails", async () => {
    settingsStoredProviders.mockResolvedValue({ anthropic: true });
    settingsProviders.mockResolvedValue([
      {
        id: "anthropic",
        label: "Anthropic",
        models: [
          { id: "claude-sonnet-4-20250514", label: "Current model" },
          { id: "claude-next", label: "Next model" },
        ],
      },
    ]);
    settingsSave.mockRejectedValueOnce(new Error("Settings file unavailable"));
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    fireEvent.click(await screen.findByRole("button", { name: "AI", exact: true }));
    fireEvent.change(screen.getByRole("combobox", { name: "Model" }), {
      target: { value: "claude-next" },
    });
    expect((await screen.findByRole("alert")).textContent).toContain("Settings file unavailable");
    expect(setModel).not.toHaveBeenCalled();
    expect((screen.getByRole("combobox", { name: "Model" }) as HTMLSelectElement).value).toBe(
      "claude-sonnet-4-20250514",
    );
  });

  it("keeps people management out of Settings", async () => {
    render(<SettingsView themePreference="system" onThemeChange={() => {}} />);
    expect(await screen.findByText("Settings")).toBeDefined();
    expect(screen.queryByText("Actors")).toBeNull();
    expect(actorList).not.toHaveBeenCalled();
  });
});
