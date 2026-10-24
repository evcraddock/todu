import type { Device } from "@todu/core/browser";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { DirectSyncRequests, DirectSyncSetup } from "../components/DirectSyncSetup.js";
import { Icon } from "../components/Icon.js";
import { ProviderConnectionDialog } from "../components/ProviderConnectionDialog.js";
import { TabBar } from "../components/TabBar.js";
import type { ThemePreference } from "../hooks/useTheme.js";
import type {
  AgentSettings,
  DaemonStatus,
  OAuthEvent,
  OAuthStatus,
  ProviderInfo,
  SyncJoinResult,
  SyncServerStatus,
  SyncStatus,
} from "../types/window.js";

// ============================================================================
// Helpers
// ============================================================================

function connectedModels(
  provider: ProviderInfo,
  providers: ProviderInfo[],
  storedKeys: Record<string, boolean>,
  statuses: OAuthStatus[],
) {
  const subscriptionConnected = (id: string) =>
    statuses.some((status) => status.id === id && status.connected);
  if (storedKeys[provider.id] || subscriptionConnected(provider.id)) return provider.models;
  const aliasModels = (provider.oauthAliases ?? [])
    .filter(subscriptionConnected)
    .flatMap((id) => providers.find((entry) => entry.id === id)?.models ?? []);
  return provider.models.filter((model) => aliasModels.some((alias) => alias.id === model.id));
}

// ============================================================================
// Component
// ============================================================================

export function SettingsView({
  themePreference,
  onThemeChange,
}: {
  themePreference: ThemePreference;
  onThemeChange: (pref: ThemePreference) => void;
}): ReactNode {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [managedProvider, setManagedProvider] = useState<string | null>(null);
  const [providerSearch, setProviderSearch] = useState("");
  const [credentialError, setCredentialError] = useState<string | null>(null);
  const [credentialSaving, setCredentialSaving] = useState(false);
  const [storedKeys, setStoredKeys] = useState<Record<string, boolean>>({});
  const [modelSaveError, setModelSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("general");
  const savedSettings = useRef<AgentSettings | null>(null);

  // API key input state — one per provider
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});

  const [devices, setDevices] = useState<Device[] | null>(null);
  const [devicesError, setDevicesError] = useState(false);
  const [serverStatus, setServerStatus] = useState<SyncServerStatus | null>(null);

  const [serverAddress, setServerAddress] = useState<string | null>(null);
  const [serverSetup, setServerSetup] = useState(false);
  const [serverSaving, setServerSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const [listenerSettings, setListenerSettings] = useState<{
    enabled?: boolean;
    bind?: string;
    port?: number;
  } | null>(null);
  const [listenerSaving, setListenerSaving] = useState(false);
  const [listenerError, setListenerError] = useState<string | null>(null);

  const [daemonRestarting, setDaemonRestarting] = useState(false);

  const [daemonStatus, setDaemonStatus] = useState<DaemonStatus | null>(null);
  const [daemonStatusError, setDaemonStatusError] = useState<string | null>(null);
  const [daemonRestartError, setDaemonRestartError] = useState<string | null>(null);

  // Sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [connectMethod, setConnectMethod] = useState("server");
  const [syncFlow, setSyncFlow] = useState<"share" | "connect" | null>(null);
  const connectionMethodsRef = useRef<HTMLDivElement>(null);
  const [catalogId, setCatalogId] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [validatingJoin, setValidatingJoin] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joinResult, setJoinResult] = useState<SyncJoinResult | null>(null);

  // OAuth state
  const [oauthStatuses, setOauthStatuses] = useState<OAuthStatus[]>([]);
  const [oauthLoggingIn, setOauthLoggingIn] = useState<string | null>(null);
  const [oauthPrompt, setOauthPrompt] = useState<{
    providerId: string;
    message: string;
    placeholder?: string;
    inputType?: "text" | "password";
  } | null>(null);
  const [oauthCode, setOauthCode] = useState("");
  const [oauthProgress, setOauthProgress] = useState<string | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);

  // Load settings, provider list, and OAuth status on mount.
  // Sync data is loaded separately so a sync IPC failure doesn't
  // prevent the rest of the settings page from rendering.
  useEffect(() => {
    Promise.all([
      window.todu.settings.get(),
      window.todu.settings.storedProviders(),
      window.todu.settings.providers(),
      window.todu.oauth.status(),
    ]).then(([s, keys, providerList, statuses]) => {
      setSettings(s);
      savedSettings.current = s;
      setStoredKeys(keys);
      setProviders(providerList);
      setOauthStatuses(statuses);
    });
  }, []);

  // Load sync status and catalog ID separately — isolated so a failure
  // here doesn't blank the whole settings page.
  useEffect(() => {
    Promise.all([window.todu.sync.status(), window.todu.sync.getCatalogId()])
      .then(([syncSt, catId]) => {
        setSyncStatus(syncSt);
        setCatalogId(catId);
      })
      .catch(() => {
        // Sync data unavailable — the Sync section simply won't render
      });
  }, []);

  useEffect(() => {
    if (activeTab !== "sync") return;
    let disposed = false;
    const refresh = () => {
      window.todu.sync
        .devices()
        .then((value) => {
          if (!disposed) {
            setDevices(value);
            setDevicesError(false);
          }
        })
        .catch(() => {
          if (!disposed) setDevicesError(true);
        });
      window.todu.sync
        .serverStatus()
        .then((value) => {
          if (!disposed) setServerStatus(value);
        })
        .catch(() => {
          if (!disposed) setServerStatus(null);
        });
    };
    window.todu.sync
      .listenerSettings()
      .then((value) => {
        if (!disposed) setListenerSettings(value);
      })
      .catch(() => {
        if (!disposed) setListenerError("Listener settings unavailable.");
      });
    refresh();
    const offSync = window.todu.on("todu:sync:status-changed", refresh);
    const offData = window.todu.on("todu:data:changed", refresh);
    return () => {
      disposed = true;
      offSync();
      offData();
    };
  }, [activeTab]);

  useEffect(() => {
    if ((activeTab !== "status" && activeTab !== "sync") || daemonRestarting) return;
    let disposed = false;
    let fetching = false;
    const refresh = async () => {
      if (fetching) return;
      fetching = true;
      try {
        const status = await window.todu.sync.daemonStatus();
        if (!disposed) {
          setDaemonStatus(status);
          setDaemonStatusError(null);
        }
      } catch (error) {
        if (!disposed) {
          setDaemonStatus(null);
          setDaemonStatusError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        fetching = false;
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 3000);
    return () => {
      disposed = true;
      clearInterval(interval);
    };
  }, [activeTab, daemonRestarting]);

  // Keep sync status live via push events
  useEffect(() => {
    const cleanup = window.todu.on("todu:sync:status-changed", (data) => {
      setSyncStatus(data as SyncStatus);
    });
    return cleanup;
  }, []);

  // Listen for OAuth events
  useEffect(() => {
    const cleanup = window.todu.on("todu:oauth:event", (data) => {
      const event = data as OAuthEvent;
      switch (event.type) {
        case "progress":
          setOauthProgress(event.message ?? null);
          break;
        case "prompt":
          setManagedProvider(event.providerId);
          setProviderSearch("");
          setOauthPrompt({
            providerId: event.providerId,
            message: event.message ?? "Paste authorization code:",
            placeholder: event.placeholder,
            inputType: event.inputType,
          });
          // Focus the code input after render
          setTimeout(() => codeInputRef.current?.focus(), 50);
          break;
        case "login-complete":
          setOauthProgress(null);
          setOauthLoggingIn(null);
          setOauthPrompt(null);
          setOauthCode("");
          setOauthError(null);
          // Refresh statuses
          window.todu.oauth.status().then(setOauthStatuses);
          break;
        case "login-error":
          setOauthProgress(null);
          setOauthLoggingIn(null);
          setOauthPrompt(null);
          setOauthCode("");
          setOauthError(event.message ?? "Login failed");
          break;
      }
    });
    return cleanup;
  }, []);

  // Get models for current provider
  const currentProvider = providers.find((p) => p.id === settings?.provider) ?? providers[0];

  const applyAssistantModel = useCallback(async (provider: string, modelId: string) => {
    if (!savedSettings.current || !modelId) return;
    const previous = savedSettings.current;
    const next = { ...previous, provider, modelId };
    setSaving(true);
    setModelSaveError(null);
    setSettings((current) => (current ? { ...current, provider, modelId } : current));
    let persisted = false;
    try {
      await window.todu.settings.save(next);
      persisted = true;
      await window.todu.agent.setModel(provider, modelId);
      savedSettings.current = next;
    } catch (error) {
      let restored = true;
      if (persisted) {
        try {
          await window.todu.settings.save(previous);
        } catch {
          restored = false;
          savedSettings.current = next;
        }
      }
      if (restored)
        setSettings((current) =>
          current
            ? { ...current, provider: previous.provider, modelId: previous.modelId }
            : current,
        );
      setModelSaveError(
        `${error instanceof Error ? error.message : String(error)}${restored ? "" : ". Saved settings could not be restored; retry selecting the model."}`,
      );
    } finally {
      setSaving(false);
    }
  }, []);

  const handleProviderChange = useCallback(
    (providerId: string) => {
      const provider = providers.find((entry) => entry.id === providerId);
      if (provider) {
        const modelId = connectedModels(provider, providers, storedKeys, oauthStatuses)[0]?.id;
        if (modelId) void applyAssistantModel(providerId, modelId);
      }
    },
    [providers, storedKeys, oauthStatuses, applyAssistantModel],
  );

  const handleModelChange = useCallback(
    (modelId: string) => {
      if (settings) void applyAssistantModel(settings.provider, modelId);
    },
    [settings, applyAssistantModel],
  );

  const handleSaveGeneral = useCallback(async () => {
    if (!settings || !savedSettings.current) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const timezone = settings.timezone.trim();
      new Intl.DateTimeFormat(undefined, { timeZone: timezone });
      const next = { ...savedSettings.current, timezone };
      await window.todu.settings.save(next);
      savedSettings.current = next;
      setSaveMessage("Settings saved");
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (error) {
      setSaveMessage(`Error: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const handleSetApiKey = useCallback(
    async (provider: string) => {
      const key = keyInputs[provider]?.trim();
      if (!key) return;

      setCredentialSaving(true);
      setCredentialError(null);
      try {
        await window.todu.settings.setApiKey(provider, key);
        setStoredKeys((prev) => ({ ...prev, [provider]: true }));
        setKeyInputs((prev) => ({ ...prev, [provider]: "" }));
      } catch (err) {
        setCredentialError(`Error saving key: ${err instanceof Error ? err.message : String(err)}`);
      } finally {
        setCredentialSaving(false);
      }
    },
    [keyInputs],
  );

  const handleRemoveApiKey = useCallback(async (provider: string) => {
    setCredentialSaving(true);
    setCredentialError(null);
    try {
      await window.todu.settings.removeApiKey(provider);
      setStoredKeys((prev) => ({ ...prev, [provider]: false }));
    } catch (err) {
      setCredentialError(`Error removing key: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCredentialSaving(false);
    }
  }, []);

  // ── OAuth handlers ───────────────────────────────────────────────

  const handleOAuthLogin = useCallback(async (providerId: string) => {
    setOauthProgress(null);
    setOauthLoggingIn(providerId);
    setOauthError(null);
    try {
      await window.todu.oauth.login(providerId);
    } catch {
      // Error is handled via the oauth:event listener
    }
  }, []);

  const handleOAuthSubmitCode = useCallback(async () => {
    const code = oauthCode.trim();
    if (!code) return;
    await window.todu.oauth.promptResponse(code);
    setOauthPrompt(null);
    setOauthCode("");
  }, [oauthCode]);

  const handleOAuthCancel = useCallback(async () => {
    await window.todu.oauth.cancel();
    setOauthProgress(null);
    setOauthLoggingIn(null);
    setOauthPrompt(null);
    setOauthCode("");
  }, []);

  const handleOAuthDisconnect = useCallback(async (providerId: string) => {
    setCredentialSaving(true);
    setOauthError(null);
    try {
      await window.todu.oauth.disconnect(providerId);
      setOauthStatuses((prev) =>
        prev.map((s) => (s.id === providerId ? { ...s, connected: false, expired: false } : s)),
      );
    } catch (error) {
      setOauthError(error instanceof Error ? error.message : String(error));
    } finally {
      setCredentialSaving(false);
    }
  }, []);

  // ── Sync handlers ────────────────────────────────────────────────

  const formatJoinErrorMessage = useCallback((error: unknown): string => {
    if (!(error instanceof Error)) {
      return String(error);
    }

    return error.message;
  }, []);

  const handleDirectConnected = useCallback(() => {
    window.todu.sync
      .getCatalogId()
      .then(setCatalogId)
      .catch(() => {});
    window.todu.sync
      .status()
      .then(setSyncStatus)
      .catch(() => {});
  }, []);

  const handleDaemonRestart = async () => {
    setDaemonRestarting(true);
    setDaemonRestartError(null);
    try {
      await window.todu.sync.restartDaemon();
      const [status, listener, daemon] = await Promise.all([
        window.todu.sync.status(),
        window.todu.sync.listenerSettings(),
        window.todu.sync.daemonStatus(),
      ]);
      setDaemonStatus(daemon);
      setDaemonStatusError(null);
      setSyncStatus(status);
      setListenerSettings(listener);
    } catch (error) {
      setDaemonRestartError(error instanceof Error ? error.message : String(error));
    } finally {
      setDaemonRestarting(false);
    }
  };

  const handleListenerToggle = async (enabled: boolean) => {
    setListenerSaving(true);
    setListenerError(null);
    try {
      setListenerSettings(await window.todu.sync.configureListener(enabled));
    } catch (error) {
      setListenerError(error instanceof Error ? error.message : String(error));
    } finally {
      setListenerSaving(false);
    }
  };

  const handleServerConfigure = async (input: { server?: string; enabled?: boolean }) => {
    setServerSaving(true);
    setServerError(null);
    try {
      const result = await window.todu.sync.configureServer(input);
      setServerStatus(result);
      setServerSetup(false);
      if (input.server !== undefined) setServerAddress(null);
    } catch (error) {
      setServerError(error instanceof Error ? error.message : String(error));
    } finally {
      setServerSaving(false);
    }
  };

  const handleServerToggle = (enabled: boolean) => {
    setServerError(null);
    if (enabled && !serverStatus?.server) {
      setServerSetup(true);
      return;
    }
    if (!enabled && serverSetup) {
      setServerSetup(false);
      return;
    }
    void handleServerConfigure({ enabled });
  };

  const handleCopyCatalogId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(catalogId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard access can fail (permission denied, insecure context, etc.)
      // Silently ignore — the user can still select and copy the text manually
    }
  }, [catalogId]);

  const handleValidateJoin = useCallback(async () => {
    const code = joinCode.trim();
    if (!code) return;

    setValidatingJoin(true);
    setJoinError(null);

    try {
      const result = await window.todu.sync.joinCheck(code);
      setJoinResult(result);
    } catch (err) {
      setJoinError(formatJoinErrorMessage(err));
    } finally {
      setValidatingJoin(false);
    }
  }, [formatJoinErrorMessage, joinCode]);

  const handleJoin = useCallback(async () => {
    const code = joinCode.trim();
    if (!code) return;

    setJoining(true);
    setJoinError(null);

    try {
      const result = await window.todu.sync.join(code);
      setJoinResult(result);
      setCatalogId(result.targetCatalogId);
      const refreshedStatus = await window.todu.sync.status();
      setSyncStatus(refreshedStatus);
    } catch (err) {
      setJoinError(formatJoinErrorMessage(err));
    } finally {
      setJoining(false);
    }
  }, [formatJoinErrorMessage, joinCode]);

  if (!settings || providers.length === 0) {
    return <div className="loading-state">Loading settings...</div>;
  }

  const connectionProviders = [
    ...providers,
    ...oauthStatuses
      .filter((status) => !providers.some((provider) => provider.id === status.id))
      .map((status) => ({ id: status.id, label: status.name, models: [], supportsApiKey: false })),
  ];
  const connectionStatus = (id: string) => {
    const subscription = oauthStatuses.find((status) => status.id === id);
    if (subscription?.connected)
      return subscription.expired ? "Subscription expired" : "Subscription connected";
    return storedKeys[id] ? "Key saved" : "Not connected";
  };
  const selectedConnectionProvider = oauthStatuses.some(
    (status) => status.id === settings.provider && status.connected,
  )
    ? settings.provider
    : ((currentProvider?.oauthAliases ?? []).find(
        (id) =>
          oauthStatuses.some((status) => status.id === id && status.connected) &&
          providers
            .find((provider) => provider.id === id)
            ?.models.some((model) => model.id === settings.modelId),
      ) ?? settings.provider);
  const hasConnection = (id: string) =>
    Boolean(storedKeys[id] || oauthStatuses.some((status) => status.id === id && status.connected));
  const connectedProviders = providers
    .map((provider) => ({
      ...provider,
      models: connectedModels(provider, providers, storedKeys, oauthStatuses),
    }))
    .filter((provider) => provider.models.length > 0);
  const assistantProvider = connectedProviders.find(
    (provider) => provider.id === settings.provider,
  );
  const visibleProviders = connectionProviders.filter((provider) =>
    provider.label.toLowerCase().includes(providerSearch.toLowerCase()),
  );

  const renderProviderTable = (entries: typeof connectionProviders, label: string): ReactNode => (
    <table className="settings-provider-table" aria-label={label}>
      <thead>
        <tr>
          <th>Provider</th>
          <th>Connection</th>
          <th>Status</th>
          <th>Actions</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((provider) => {
          const subscription = oauthStatuses.find((status) => status.id === provider.id);
          const configured = Boolean(subscription?.connected || storedKeys[provider.id]);
          const methods =
            [
              subscription ? "Subscription" : null,
              provider.supportsApiKey !== false ? "API key" : null,
            ]
              .filter(Boolean)
              .join(" / ") || "Provider credentials";
          return (
            <tr key={provider.id}>
              <td>{provider.label}</td>
              <td>{methods}</td>
              <td>{connectionStatus(provider.id)}</td>
              <td>
                <button
                  type="button"
                  className="btn btn-sm btn-with-icon"
                  aria-label={`${configured ? "Manage" : "Connect"} ${provider.label}`}
                  aria-haspopup="dialog"
                  disabled={oauthLoggingIn !== null || credentialSaving}
                  onClick={() => {
                    setManagedProvider(provider.id);
                    setCredentialError(null);
                    setOauthError(null);
                  }}
                >
                  <Icon name={configured ? "settings" : "connect"} />
                  {configured ? "Manage" : "Connect"}
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <div className="view-container">
      <h2 className="view-title">Settings</h2>

      <TabBar
        tabs={[
          { id: "general", label: "General" },
          { id: "ai", label: "AI" },
          { id: "sync", label: "Sync" },
          { id: "status", label: "Status" },
        ]}
        activeTab={activeTab}
        onTabChange={(tab) => {
          setActiveTab(tab);
          setSaveMessage(null);
        }}
      />
      <div className="settings-content" hidden={activeTab !== "general"}>
        {/* ── Appearance ──────────────────────────────────────────────── */}
        <div className="settings-section">
          <h3 className="section-title">Appearance</h3>
          <div className="form-field">
            <label className="form-label" htmlFor="theme-select">
              Theme
            </label>
            <select
              id="theme-select"
              className="input inline-select"
              value={themePreference}
              onChange={(e) => onThemeChange(e.target.value as ThemePreference)}
            >
              <option value="system">System</option>
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
        </div>
        <div className="settings-section">
          <h3 className="section-title">Journal</h3>
          <div className="form-field">
            <label className="form-label" htmlFor="journal-timezone-input">
              Journal timezone
            </label>
            <input
              id="journal-timezone-input"
              className="input"
              value={settings.timezone}
              onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
              placeholder="America/Chicago"
            />
            <span className="form-hint">Use a timezone like America/Chicago or UTC.</span>
          </div>
        </div>

        <div className="settings-actions">
          <button
            type="button"
            className="btn btn-primary btn-with-icon"
            onClick={() => void handleSaveGeneral()}
            disabled={saving}
          >
            <Icon name="save" />
            {saving ? "Saving..." : "Save"}
          </button>
          {saveMessage && (
            <span
              className={`settings-message ${saveMessage.startsWith("Error") ? "settings-message-error" : ""}`}
            >
              {saveMessage}
            </span>
          )}
        </div>
      </div>
      <div className="settings-content" hidden={activeTab !== "ai"}>
        {/* ── Model Selection ─────────────────────────────────────────── */}
        <div className="settings-section">
          <h3 className="section-title">Assistant model</h3>

          <div className="settings-model-fields">
            <div className="form-field">
              <label className="form-label" htmlFor="provider-select">
                Provider
              </label>
              <select
                id="provider-select"
                disabled={saving || connectedProviders.length === 0}
                className="input inline-select"
                value={assistantProvider ? settings.provider : ""}
                onChange={(e) => handleProviderChange(e.target.value)}
              >
                {!assistantProvider && (
                  <option value="" disabled>
                    {connectedProviders.length
                      ? "Choose a connected provider"
                      : "Connect a provider below"}
                  </option>
                )}
                {connectedProviders.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label className="form-label" htmlFor="model-select">
                Model
              </label>
              <select
                id="model-select"
                className="input inline-select"
                value={assistantProvider ? settings.modelId : ""}
                disabled={saving || !assistantProvider}
                onChange={(e) => handleModelChange(e.target.value)}
              >
                {assistantProvider &&
                  !assistantProvider.models.some((model) => model.id === settings.modelId) && (
                    <option value={settings.modelId} disabled>
                      {settings.modelId} (unavailable)
                    </option>
                  )}
                {!assistantProvider && <option value="">Choose a connected provider first</option>}
                {assistantProvider?.models.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="settings-key-header">
            <span className="settings-hint">
              {currentProvider?.label}: {connectionStatus(selectedConnectionProvider)}
            </span>
          </div>
          {modelSaveError && (
            <p className="settings-oauth-error" role="alert">
              {modelSaveError}
            </p>
          )}
        </div>

        <div className="settings-section">
          <h4 className="settings-provider-group-title">Connected providers</h4>
          {connectionProviders.some((provider) => hasConnection(provider.id)) ? (
            renderProviderTable(
              connectionProviders.filter((provider) => hasConnection(provider.id)),
              "Connected providers",
            )
          ) : (
            <p className="settings-hint">No connected providers.</p>
          )}
          <details className="settings-other-providers">
            <summary>Other providers</summary>
            <label className="form-label" htmlFor="provider-search">
              Filter providers
            </label>
            <input
              id="provider-search"
              className="input settings-provider-search"
              value={providerSearch}
              onChange={(event) => setProviderSearch(event.target.value)}
              placeholder="Find a provider"
              disabled={oauthLoggingIn !== null || credentialSaving}
            />
            {visibleProviders.some((provider) => !hasConnection(provider.id)) &&
              renderProviderTable(
                visibleProviders.filter((provider) => !hasConnection(provider.id)),
                "Other providers",
              )}
            {!visibleProviders.some((provider) => !hasConnection(provider.id)) && (
              <p className="settings-hint">No matching providers.</p>
            )}
          </details>
        </div>
      </div>
      {connectionProviders
        .filter((provider) => provider.id === managedProvider)
        .map((provider) => {
          const subscription = oauthStatuses.find((status) => status.id === provider.id);
          return (
            <ProviderConnectionDialog
              key={provider.id}
              title={`${provider.label} connection`}
              pending={oauthLoggingIn !== null || credentialSaving}
              onClose={() => setManagedProvider(null)}
            >
              <p className="settings-hint">
                Credentials are encrypted and stored locally.
                {subscription && provider.supportsApiKey !== false
                  ? " A saved subscription takes priority over an API key; expired subscriptions may need to be refreshed or reconnected."
                  : ""}
              </p>
              {oauthStatuses
                .filter((status) => status.id === provider.id)
                .map((status) => (
                  <div key={status.id} className="settings-key-row">
                    <h4>Subscription</h4>
                    <div className="settings-key-header">
                      <span className="settings-key-label">{status.name}</span>
                      <span
                        className={`settings-key-status ${
                          status.connected
                            ? status.expired
                              ? "settings-key-missing"
                              : "settings-key-stored"
                            : "settings-key-missing"
                        }`}
                      >
                        {status.connected ? (
                          status.expired ? (
                            <>
                              <Icon name="warning" /> Expired
                            </>
                          ) : (
                            <>
                              <Icon name="check" /> Connected
                            </>
                          )
                        ) : (
                          "Not connected"
                        )}
                      </span>
                    </div>

                    {oauthProgress && (
                      <p className="settings-hint" role="status">
                        {oauthProgress}
                      </p>
                    )}
                    {oauthPrompt && <p className="settings-hint">{oauthPrompt.message}</p>}
                    {oauthError && (
                      <div className="settings-oauth-error" role="alert">
                        {oauthError}
                      </div>
                    )}
                    <div className="settings-key-input-row">
                      {/* Show prompt input during login flow */}
                      {oauthPrompt?.providerId === status.id ? (
                        <>
                          <input
                            ref={codeInputRef}
                            type={oauthPrompt.inputType ?? "text"}
                            className="input settings-key-input"
                            placeholder={oauthPrompt.placeholder ?? "Paste authorization code"}
                            value={oauthCode}
                            onChange={(e) => setOauthCode(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") handleOAuthSubmitCode();
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-primary btn-sm btn-with-icon"
                            disabled={!oauthCode.trim()}
                            onClick={handleOAuthSubmitCode}
                          >
                            <Icon name="check" />
                            Submit
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm btn-with-icon"
                            onClick={handleOAuthCancel}
                          >
                            <Icon name="cancel" /> Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          {/* Login / Re-login button */}
                          {(!status.connected || status.expired) && (
                            <button
                              type="button"
                              className="btn btn-primary btn-sm btn-with-icon"
                              disabled={oauthLoggingIn !== null || credentialSaving}
                              onClick={() => handleOAuthLogin(status.id)}
                            >
                              <Icon name="connect" />
                              {oauthLoggingIn === status.id
                                ? "Opening browser..."
                                : status.expired
                                  ? "Re-login"
                                  : "Login"}
                            </button>
                          )}
                          {oauthLoggingIn === status.id && (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm btn-with-icon"
                              onClick={handleOAuthCancel}
                            >
                              <Icon name="cancel" /> Cancel
                            </button>
                          )}
                          {/* Disconnect button */}
                          {status.connected && (
                            <button
                              type="button"
                              className="btn btn-danger btn-sm btn-with-icon"
                              disabled={credentialSaving || oauthLoggingIn !== null}
                              onClick={() => handleOAuthDisconnect(status.id)}
                            >
                              <Icon name="disconnect" />
                              Disconnect
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
              {[provider]
                .filter((entry) => entry.supportsApiKey !== false)
                .map((provider) => (
                  <div key={provider.id} className="settings-key-row">
                    <h4>API key</h4>
                    <div className="settings-key-header">
                      <span className="settings-key-label">{provider.label}</span>
                      <span
                        className={`settings-key-status ${storedKeys[provider.id] ? "settings-key-stored" : "settings-key-missing"}`}
                      >
                        {storedKeys[provider.id] ? "Key saved" : "Not set"}
                      </span>
                    </div>
                    <div className="settings-key-input-row">
                      <input
                        type="password"
                        aria-label={`${provider.label} API key`}
                        disabled={credentialSaving || oauthLoggingIn !== null}
                        className="input settings-key-input"
                        placeholder={
                          storedKeys[provider.id] ? "Enter new key to replace" : "Enter API key"
                        }
                        value={keyInputs[provider.id] ?? ""}
                        onChange={(e) =>
                          setKeyInputs((prev) => ({
                            ...prev,
                            [provider.id]: e.target.value,
                          }))
                        }
                      />
                      <button
                        type="button"
                        className="btn btn-primary btn-sm btn-with-icon"
                        disabled={
                          credentialSaving ||
                          oauthLoggingIn !== null ||
                          !keyInputs[provider.id]?.trim()
                        }
                        onClick={() => handleSetApiKey(provider.id)}
                      >
                        <Icon name="save" /> Save key
                      </button>
                      {storedKeys[provider.id] && (
                        <button
                          type="button"
                          className="btn btn-danger btn-sm btn-with-icon"
                          disabled={credentialSaving || oauthLoggingIn !== null}
                          onClick={() => handleRemoveApiKey(provider.id)}
                        >
                          <Icon name="delete" />
                          Remove key
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              {credentialError && (
                <p className="settings-oauth-error" role="alert">
                  {credentialError}
                </p>
              )}
              {!subscription && provider.supportsApiKey === false && (
                <p className="settings-hint">
                  This provider uses credentials configured outside this app.
                </p>
              )}
            </ProviderConnectionDialog>
          );
        })}
      <div className="settings-content" hidden={activeTab !== "sync"}>
        {/* ── Sync ────────────────────────────────────────────────────── */}
        {syncStatus && (
          <>
            <div className="settings-section sync-overview">
              <h3 className="section-title">Sync this data with another computer</h3>
              <p className="settings-hint">
                Run Todu’s daemon on both computers and connect them to the same dataset using
                Direct Sync, a sync server, or both.
              </p>
              <div className="sync-computer-summary">
                <strong>This computer</strong>
                <div className="sync-summary-states">
                  <span>
                    {daemonStatus
                      ? daemonStatus.healthy && daemonStatus.state === "running"
                        ? "Daemon running"
                        : "Daemon not ready"
                      : "Daemon status unavailable"}
                  </span>
                  <span>
                    Direct Sync:{" "}
                    {syncStatus.listener?.state === "listening"
                      ? "listening"
                      : syncStatus.listener?.state === "error"
                        ? "error"
                        : "off"}
                  </span>
                  <span>
                    Sync Server:{" "}
                    {serverStatus?.enabled
                      ? serverStatus.state === "connected"
                        ? "connected"
                        : serverStatus.state === "syncing"
                          ? "syncing"
                          : "disconnected"
                      : serverStatus
                        ? "off"
                        : "unavailable"}
                  </span>
                </div>
                <div className="sync-dataset-id">
                  <span>Dataset</span>
                  <code>{catalogId || "Unavailable"}</code>
                  <button
                    type="button"
                    className="btn btn-sm btn-with-icon"
                    disabled={!catalogId}
                    onClick={handleCopyCatalogId}
                  >
                    <Icon name={copied ? "check" : "copy"} />
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
              <div className="sync-flow-actions">
                <button
                  type="button"
                  className={`btn-with-icon btn ${syncFlow === "share" ? "btn-primary" : ""}`}
                  aria-expanded={syncFlow === "share"}
                  onClick={() => setSyncFlow(syncFlow === "share" ? null : "share")}
                >
                  <Icon name="connect" />
                  Connect another computer to this data
                </button>
                <button
                  type="button"
                  className={`btn-with-icon btn ${syncFlow === "connect" ? "btn-primary" : ""}`}
                  aria-expanded={syncFlow === "connect"}
                  onClick={() => setSyncFlow(syncFlow === "connect" ? null : "connect")}
                >
                  <Icon name="connect" />
                  Connect this computer to existing data
                </button>
              </div>
              {syncFlow === "share" && (
                <div className="sync-flow-panel">
                  <h4>Connect another computer</h4>
                  <ol>
                    <li>Keep the daemon running on both computers.</li>
                    <li>
                      Enable a connection method below, then share the catalog ID above and the
                      address with the other computer.
                    </li>
                    <li>
                      On that computer, open Sync and choose “Connect this computer to existing
                      data.”
                    </li>
                  </ol>
                  {syncStatus.listener?.state === "listening" && (
                    <p>
                      <strong>Direct address:</strong>{" "}
                      {syncStatus.listener.publication?.endpoint ?? "Not published yet"}
                    </p>
                  )}
                  {serverStatus?.enabled && serverStatus.server && (
                    <p>
                      <strong>Sync server:</strong> {serverStatus.server} ({serverStatus.state})
                    </p>
                  )}
                  {syncStatus.listener?.state !== "listening" && !serverStatus?.enabled && (
                    <p className="settings-hint">
                      No connection method is enabled. Set one up below before connecting another
                      computer.
                    </p>
                  )}
                  <button
                    type="button"
                    className="btn btn-sm btn-with-icon"
                    onClick={() =>
                      connectionMethodsRef.current?.scrollIntoView({
                        behavior: "smooth",
                        block: "start",
                      })
                    }
                  >
                    <Icon name="settings" />
                    Set up a connection method
                  </button>
                  <p className="settings-hint">
                    For Direct Sync, choose “Direct connection” on the other computer and enter this
                    computer’s direct address. The catalog ID is shared automatically when you
                    approve its request below.
                  </p>
                  <DirectSyncRequests />
                </div>
              )}
              {syncFlow === "connect" && (
                <div className="sync-flow-panel">
                  <h4>Connect to existing data</h4>
                  <div className="sync-flow-actions" role="group" aria-label="Connection method">
                    <button
                      type="button"
                      className={`btn-with-icon btn btn-sm ${connectMethod === "direct" ? "btn-primary" : ""}`}
                      aria-pressed={connectMethod === "direct"}
                      onClick={() => setConnectMethod("direct")}
                    >
                      <Icon name="connect" />
                      Direct connection
                    </button>
                    <button
                      type="button"
                      className={`btn-with-icon btn btn-sm ${connectMethod === "server" ? "btn-primary" : ""}`}
                      aria-pressed={connectMethod === "server"}
                      onClick={() => setConnectMethod("server")}
                    >
                      <Icon name="server" />
                      Via sync server
                    </button>
                  </div>
                  {connectMethod === "direct" ? (
                    <DirectSyncSetup
                      listenerReady={syncStatus.listener?.state === "listening"}
                      onSetup={() =>
                        connectionMethodsRef.current?.scrollIntoView({
                          behavior: "smooth",
                          block: "start",
                        })
                      }
                      onConnected={handleDirectConnected}
                    />
                  ) : (
                    <>
                      <p className="settings-hint">
                        Keep the daemon running on both computers. Use the shared server address in
                        Connection methods below, or an established direct connection, to reach the
                        other dataset.
                      </p>
                      <p className="settings-hint">
                        Connection checks will explain if this computer’s existing dataset cannot be
                        switched. Your datasets will not be merged.
                      </p>
                      <div className="settings-key-row">
                        <div className="settings-key-header">
                          <label className="form-label" htmlFor="connect-catalog-id">
                            Dataset catalog ID
                          </label>
                        </div>
                        <p className="settings-hint">
                          Paste the catalog ID shared by the other computer. Check the connection
                          before connecting to its dataset.
                        </p>
                        <div className="settings-key-input-row">
                          <input
                            type="text"
                            className="input settings-key-input"
                            id="connect-catalog-id"
                            placeholder="Paste catalog ID here"
                            value={joinCode}
                            onChange={(e) => {
                              setJoinCode(e.target.value);
                              setJoinResult(null);
                              setJoinError(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") void handleValidateJoin();
                            }}
                          />
                          <button
                            type="button"
                            className="btn btn-primary btn-sm btn-with-icon"
                            disabled={!joinCode.trim() || validatingJoin || joining}
                            onClick={() => void handleValidateJoin()}
                          >
                            <Icon name="check" />
                            {validatingJoin ? "Checking..." : "Check connection"}
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm btn-with-icon"
                            disabled={
                              joining ||
                              validatingJoin ||
                              joinResult?.mode !== "check" ||
                              joinResult.targetCatalogId !== joinCode.trim()
                            }
                            onClick={() => void handleJoin()}
                          >
                            <Icon name="connect" />
                            {joining ? "Connecting..." : "Connect to dataset"}
                          </button>
                        </div>
                        {joinResult && (
                          <p className="settings-hint" role="status">
                            {joinResult.switched
                              ? "This computer is now using the shared dataset."
                              : joinResult.rolledBack
                                ? "The connection could not be completed. The previous dataset was restored."
                                : "Dataset is reachable. You can connect this computer to it."}
                          </p>
                        )}
                        {joinError && (
                          <div className="settings-oauth-error" role="alert">
                            {joinError}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            <div ref={connectionMethodsRef} className="sync-connection-methods">
              <h3 className="section-title">Connection methods</h3>
              <p className="settings-hint">
                Use one or both methods. The computers must share the same catalog ID.
              </p>
              <div className="settings-section">
                <h3 className="section-title">Direct Sync</h3>
                <p className="settings-hint">
                  Let other computers connect directly to this computer on your local network.
                </p>
                <div className="settings-key-header">
                  <label className="settings-toggle-label" htmlFor="direct-sync-toggle">
                    <input
                      id="direct-sync-toggle"
                      className="settings-switch"
                      type="checkbox"
                      role="switch"
                      checked={listenerSettings?.enabled ?? false}
                      disabled={!listenerSettings || listenerSaving || daemonRestarting}
                      onChange={(event) => void handleListenerToggle(event.target.checked)}
                    />
                    Allow direct sync
                  </label>
                  <span
                    className={`settings-key-status ${syncStatus.listener?.state === "listening" ? "settings-key-stored" : "settings-key-missing"}`}
                  >
                    {syncStatus.listener?.state === "listening"
                      ? "Listening"
                      : syncStatus.listener?.state === "disabled"
                        ? "Disabled"
                        : syncStatus.listener?.state === "error"
                          ? "Error"
                          : "Unavailable"}
                  </span>
                </div>
                {listenerSettings &&
                  Boolean(listenerSettings.enabled) !==
                    (syncStatus.listener?.state === "listening") && (
                    <p className="settings-hint" role="status">
                      Settings saved. Restart the daemon from the Status tab to apply.
                    </p>
                  )}
                {listenerSettings?.enabled && (
                  <p className="settings-hint">
                    Trusted local networks only. Direct sync is unencrypted and unauthenticated.
                  </p>
                )}
                {listenerError && (
                  <p className="settings-oauth-error" role="alert">
                    {listenerError}
                  </p>
                )}
                {syncStatus.listener?.bind && (
                  <p className="settings-hint">
                    {syncStatus.listener.bind}:{syncStatus.listener.port}
                  </p>
                )}
                {syncStatus.listener?.error && (
                  <p className="settings-oauth-error">{syncStatus.listener.error}</p>
                )}
                {syncStatus.listener?.publication?.endpoint && (
                  <p className="settings-hint">
                    Shared address: {syncStatus.listener.publication.endpoint}
                  </p>
                )}
              </div>
              <div className="settings-section">
                <h3 className="section-title">Sync Server</h3>
                <p className="settings-hint">
                  Connect through a sync server shared by your computers.
                </p>

                <div className="settings-key-header">
                  <label className="settings-toggle-label" htmlFor="sync-server-toggle">
                    <input
                      id="sync-server-toggle"
                      className="settings-switch"
                      type="checkbox"
                      role="switch"
                      checked={serverSetup || (serverStatus?.enabled ?? false)}
                      disabled={!serverStatus || serverSaving}
                      onChange={(event) => handleServerToggle(event.target.checked)}
                    />
                    Use sync server
                  </label>
                  <span
                    className={`settings-key-status ${serverStatus?.state === "connected" ? "settings-key-stored" : "settings-key-missing"}`}
                  >
                    {!serverStatus
                      ? "Status unavailable"
                      : serverStatus.state === "connected"
                        ? "Connected"
                        : serverStatus.state === "syncing"
                          ? "Syncing"
                          : "Disconnected"}
                  </span>
                </div>
                {(serverSetup || serverStatus?.enabled) && (
                  <form
                    className="settings-server-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleServerConfigure({
                        server: (serverAddress ?? serverStatus?.server ?? "").trim(),
                        enabled: true,
                      });
                    }}
                  >
                    <label className="form-label" htmlFor="sync-server-address">
                      Server address
                    </label>
                    <div className="settings-key-input-row">
                      <input
                        id="sync-server-address"
                        className="input settings-key-input"
                        type="url"
                        required
                        placeholder="wss://sync.example.com"
                        value={serverAddress ?? serverStatus?.server ?? ""}
                        disabled={serverSaving}
                        onChange={(event) => setServerAddress(event.target.value)}
                      />
                      <button
                        type="submit"
                        className="btn btn-primary btn-sm btn-with-icon"
                        disabled={
                          serverSaving || !(serverAddress ?? serverStatus?.server ?? "").trim()
                        }
                      >
                        <Icon name="save" />
                        {serverSaving ? "Saving..." : "Save address"}
                      </button>
                    </div>
                    {serverSetup && (
                      <p className="settings-hint">Enter and save an address to connect.</p>
                    )}
                  </form>
                )}
                {serverError && (
                  <p className="settings-oauth-error" role="alert">
                    {serverError}
                  </p>
                )}
              </div>
            </div>
            <div className="settings-section">
              <h3 className="section-title">Devices sharing this data</h3>
              <p className="settings-hint">
                Enrolled devices. This list does not indicate whether a device is online or fully
                synchronized.
              </p>
              {devicesError ? (
                <p role="status" className="settings-hint">
                  Devices unavailable.
                </p>
              ) : devices === null ? (
                <p className="settings-hint">Loading devices...</p>
              ) : devices.length === 0 ? (
                <p className="settings-hint">No enrolled devices.</p>
              ) : (
                <div className="settings-device-list">
                  {devices.map((device) => (
                    <div key={device.id} className="settings-device-row">
                      <div>
                        <strong>{device.name}</strong>
                        <div className="settings-device-id">{device.id}</div>
                      </div>
                      <span className="settings-hint">
                        {device.endpoint ?? "No direct sync address"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {!syncStatus && (
          <p className="settings-hint" role="status">
            Sync status unavailable.
          </p>
        )}
      </div>
      <div className="settings-content" hidden={activeTab !== "status"}>
        <div className="settings-section">
          <h3 className="section-title">Daemon</h3>
          {daemonRestarting ? (
            <p className="settings-hint">Restarting...</p>
          ) : daemonStatus ? (
            <dl className="settings-status-list">
              <dt>State</dt>
              <dd>{daemonStatus.state}</dd>
              <dt>Health</dt>
              <dd>{daemonStatus.healthy ? "Healthy" : "Unhealthy"}</dd>
              <dt>Role</dt>
              <dd>{daemonStatus.role}</dd>
              <dt>Started</dt>
              <dd>
                {daemonStatus.startedAt ? new Date(daemonStatus.startedAt).toLocaleString() : "—"}
              </dd>
              <dt>Socket</dt>
              <dd>{daemonStatus.transport?.path ?? "—"}</dd>
            </dl>
          ) : (
            <p className="settings-hint">
              {daemonStatusError ? "Daemon unavailable" : "Loading daemon status..."}
            </p>
          )}
          {daemonStatusError && !daemonRestarting && (
            <p className="settings-oauth-error" role="alert">
              {daemonStatusError}
            </p>
          )}
          <div className="settings-actions">
            <button
              type="button"
              className="btn btn-primary btn-sm btn-with-icon"
              disabled={daemonRestarting || listenerSaving || serverSaving || !daemonStatus}
              onClick={() => void handleDaemonRestart()}
            >
              <Icon name="recurring" />
              {daemonRestarting ? "Restarting daemon..." : "Restart daemon"}
            </button>
            {daemonRestarting && (
              <span className="settings-hint" role="status">
                Waiting for the daemon to reconnect...
              </span>
            )}
          </div>

          {daemonRestartError && (
            <p className="settings-oauth-error" role="alert">
              {daemonRestartError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
