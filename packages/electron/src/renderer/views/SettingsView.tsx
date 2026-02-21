import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import type { ThemePreference } from "../hooks/useTheme.js";
import type {
  AgentSettings,
  OAuthEvent,
  OAuthStatus,
  ProviderInfo,
  SyncStatus,
} from "../types/window.js";

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
  const [storedKeys, setStoredKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // API key input state — one per provider
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});

  // Sync state
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [catalogId, setCatalogId] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  // OAuth state
  const [oauthStatuses, setOauthStatuses] = useState<OAuthStatus[]>([]);
  const [oauthLoggingIn, setOauthLoggingIn] = useState<string | null>(null);
  const [oauthPrompt, setOauthPrompt] = useState<{
    providerId: string;
    message: string;
    placeholder?: string;
  } | null>(null);
  const [oauthCode, setOauthCode] = useState("");
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
        case "prompt":
          setOauthPrompt({
            providerId: event.providerId,
            message: event.message ?? "Paste authorization code:",
            placeholder: event.placeholder,
          });
          // Focus the code input after render
          setTimeout(() => codeInputRef.current?.focus(), 50);
          break;
        case "login-complete":
          setOauthLoggingIn(null);
          setOauthPrompt(null);
          setOauthCode("");
          setOauthError(null);
          // Refresh statuses
          window.todu.oauth.status().then(setOauthStatuses);
          break;
        case "login-error":
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

  const handleProviderChange = useCallback(
    (providerId: string) => {
      const provider = providers.find((p) => p.id === providerId);
      if (provider && settings) {
        const newSettings = {
          provider: providerId,
          modelId: provider.models[0]?.id ?? "",
        };
        setSettings(newSettings);
      }
    },
    [providers, settings],
  );

  const handleModelChange = useCallback(
    (modelId: string) => {
      if (settings) {
        setSettings({ ...settings, modelId });
      }
    },
    [settings],
  );

  const handleSave = useCallback(async () => {
    if (!settings) return;
    setSaving(true);
    setSaveMessage(null);

    try {
      await window.todu.settings.save(settings);
      await window.todu.agent.setModel(settings.provider, settings.modelId);
      setSaveMessage("Settings saved");
      setTimeout(() => setSaveMessage(null), 2000);
    } catch (err) {
      setSaveMessage(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  }, [settings]);

  const handleSetApiKey = useCallback(
    async (provider: string) => {
      const key = keyInputs[provider]?.trim();
      if (!key) return;

      try {
        await window.todu.settings.setApiKey(provider, key);
        setStoredKeys((prev) => ({ ...prev, [provider]: true }));
        setKeyInputs((prev) => ({ ...prev, [provider]: "" }));
      } catch (err) {
        setSaveMessage(`Error saving key: ${err instanceof Error ? err.message : String(err)}`);
      }
    },
    [keyInputs],
  );

  const handleRemoveApiKey = useCallback(async (provider: string) => {
    try {
      await window.todu.settings.removeApiKey(provider);
      setStoredKeys((prev) => ({ ...prev, [provider]: false }));
    } catch (err) {
      setSaveMessage(`Error removing key: ${err instanceof Error ? err.message : String(err)}`);
    }
  }, []);

  // ── OAuth handlers ───────────────────────────────────────────────

  const handleOAuthLogin = useCallback(async (providerId: string) => {
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
    setOauthLoggingIn(null);
    setOauthPrompt(null);
    setOauthCode("");
  }, []);

  const handleOAuthDisconnect = useCallback(async (providerId: string) => {
    await window.todu.oauth.disconnect(providerId);
    setOauthStatuses((prev) =>
      prev.map((s) => (s.id === providerId ? { ...s, connected: false, expired: false } : s)),
    );
  }, []);

  // ── Sync handlers ────────────────────────────────────────────────

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

  const handleJoin = useCallback(async () => {
    const code = joinCode.trim();
    if (!code) return;
    setJoining(true);
    setJoinError(null);
    try {
      await window.todu.sync.join(code);
      // App will restart — no further state update needed
    } catch (err) {
      setJoinError(err instanceof Error ? err.message : String(err));
      setJoining(false);
    }
  }, [joinCode]);

  if (!settings || providers.length === 0) {
    return <div className="loading-state">Loading settings...</div>;
  }

  // Providers that have a stored key or are currently selected
  const keyProviders = providers.filter((p) => storedKeys[p.id] || p.id === settings.provider);

  return (
    <div className="view-container">
      <h2 className="view-title">Settings</h2>

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

      {/* ── Model Selection ─────────────────────────────────────────── */}
      <div className="settings-section">
        <h3 className="section-title">Model</h3>

        <div className="form-field">
          <label className="form-label" htmlFor="provider-select">
            Provider
          </label>
          <select
            id="provider-select"
            className="input inline-select"
            value={settings.provider}
            onChange={(e) => handleProviderChange(e.target.value)}
          >
            {providers.map((p) => (
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
            value={settings.modelId}
            onChange={(e) => handleModelChange(e.target.value)}
          >
            {currentProvider?.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div className="settings-actions">
          <button type="button" className="btn btn-primary" onClick={handleSave} disabled={saving}>
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

      {/* ── Subscriptions ───────────────────────────────────────────── */}
      <div className="settings-section">
        <h3 className="section-title">Subscriptions</h3>
        <p className="settings-hint">
          Log in with your existing AI subscription. OAuth credentials are encrypted and stored
          locally. When connected, subscriptions take priority over API keys.
        </p>

        {oauthError && <div className="settings-oauth-error">{oauthError}</div>}

        {oauthStatuses.map((status) => (
          <div key={status.id} className="settings-key-row">
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
                {status.connected
                  ? status.expired
                    ? "⚠ Expired"
                    : "✓ Connected"
                  : "Not connected"}
              </span>
            </div>

            <div className="settings-key-input-row">
              {/* Show prompt input during login flow */}
              {oauthPrompt?.providerId === status.id ? (
                <>
                  <input
                    ref={codeInputRef}
                    type="text"
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
                    className="btn btn-primary btn-sm"
                    disabled={!oauthCode.trim()}
                    onClick={handleOAuthSubmitCode}
                  >
                    Submit
                  </button>
                  <button
                    type="button"
                    className="btn btn-danger btn-sm"
                    onClick={handleOAuthCancel}
                  >
                    Cancel
                  </button>
                </>
              ) : (
                <>
                  {/* Login / Re-login button */}
                  {(!status.connected || status.expired) && (
                    <button
                      type="button"
                      className="btn btn-primary btn-sm"
                      disabled={oauthLoggingIn !== null}
                      onClick={() => handleOAuthLogin(status.id)}
                    >
                      {oauthLoggingIn === status.id
                        ? "Opening browser..."
                        : status.expired
                          ? "Re-login"
                          : "Login"}
                    </button>
                  )}
                  {/* Disconnect button */}
                  {status.connected && (
                    <button
                      type="button"
                      className="btn btn-danger btn-sm"
                      onClick={() => handleOAuthDisconnect(status.id)}
                    >
                      Disconnect
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Sync ────────────────────────────────────────────────────── */}
      {syncStatus && (
        <div className="settings-section">
          <h3 className="section-title">Sync</h3>

          {/* Remote server & connection status */}
          <div className="settings-key-row">
            <div className="settings-key-header">
              <span className="settings-key-label">
                {syncStatus.remote.server
                  ? syncStatus.remote.server
                  : "No remote server configured"}
              </span>
              <span
                className={`settings-key-status ${
                  syncStatus.remote.state === "connected"
                    ? "settings-key-stored"
                    : "settings-key-missing"
                }`}
              >
                {syncStatus.remote.state === "connected" ? "● Connected" : "● Disconnected"}
              </span>
            </div>
            {!syncStatus.remote.server && (
              <p className="settings-hint">
                Add a <code>sync.remote.server</code> URL to <code>config.yaml</code> to enable
                multi-device sync.
              </p>
            )}
          </div>

          {/* Join code — Device A shares this, Device B enters it */}
          {catalogId && (
            <>
              <div className="settings-key-row">
                <div className="settings-key-header">
                  <span className="settings-key-label">Your join code</span>
                </div>
                <p className="settings-hint">
                  Share this code with another device to let it sync your data.
                </p>
                <div className="settings-key-input-row">
                  <input
                    type="text"
                    className="input settings-key-input"
                    readOnly
                    value={catalogId}
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleCopyCatalogId}
                  >
                    {copied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>

              <div className="settings-key-row">
                <div className="settings-key-header">
                  <span className="settings-key-label">Join another device</span>
                </div>
                <p className="settings-hint">
                  Enter a join code from another device. The app will restart and replace your local
                  data with that device&apos;s data.
                </p>
                <div className="settings-key-input-row">
                  <input
                    type="text"
                    className="input settings-key-input"
                    placeholder="Paste join code here"
                    value={joinCode}
                    onChange={(e) => setJoinCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void handleJoin();
                    }}
                  />
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    disabled={!joinCode.trim() || joining}
                    onClick={() => void handleJoin()}
                  >
                    {joining ? "Joining..." : "Join"}
                  </button>
                </div>
                {joinError && <div className="settings-oauth-error">{joinError}</div>}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── API Keys ────────────────────────────────────────────────── */}
      <div className="settings-section">
        <h3 className="section-title">API Keys</h3>
        <p className="settings-hint">
          Keys are encrypted and stored locally. They are never sent anywhere except to the
          provider&apos;s API. Subscriptions above take priority when connected.
        </p>

        {keyProviders.map((provider) => (
          <div key={provider.id} className="settings-key-row">
            <div className="settings-key-header">
              <span className="settings-key-label">{provider.label}</span>
              <span
                className={`settings-key-status ${storedKeys[provider.id] ? "settings-key-stored" : "settings-key-missing"}`}
              >
                {storedKeys[provider.id] ? "✓ Stored" : "Not set"}
              </span>
            </div>
            <div className="settings-key-input-row">
              <input
                type="password"
                className="input settings-key-input"
                placeholder={storedKeys[provider.id] ? "Enter new key to replace" : "Enter API key"}
                value={keyInputs[provider.id] ?? ""}
                onChange={(e) =>
                  setKeyInputs((prev) => ({ ...prev, [provider.id]: e.target.value }))
                }
              />
              <button
                type="button"
                className="btn btn-primary btn-sm"
                disabled={!keyInputs[provider.id]?.trim()}
                onClick={() => handleSetApiKey(provider.id)}
              >
                Save
              </button>
              {storedKeys[provider.id] && (
                <button
                  type="button"
                  className="btn btn-danger btn-sm"
                  onClick={() => handleRemoveApiKey(provider.id)}
                >
                  Remove
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
