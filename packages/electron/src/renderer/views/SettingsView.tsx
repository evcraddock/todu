import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { AgentSettings, ProviderInfo } from "../types/window.js";

// ============================================================================
// Component
// ============================================================================

export function SettingsView(): ReactNode {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [storedKeys, setStoredKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // API key input state — one per provider
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});

  // Load settings and provider list on mount
  useEffect(() => {
    Promise.all([
      window.todu.settings.get(),
      window.todu.settings.storedProviders(),
      window.todu.settings.providers(),
    ]).then(([s, keys, providerList]) => {
      setSettings(s);
      setStoredKeys(keys);
      setProviders(providerList);
    });
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

  if (!settings || providers.length === 0) {
    return <div className="loading-state">Loading settings...</div>;
  }

  // Providers that have a stored key or are currently selected
  const keyProviders = providers.filter((p) => storedKeys[p.id] || p.id === settings.provider);

  return (
    <div className="view-container">
      <h2 className="view-title">Settings</h2>

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

      {/* ── API Keys ────────────────────────────────────────────────── */}
      <div className="settings-section">
        <h3 className="section-title">API Keys</h3>
        <p className="settings-hint">
          Keys are encrypted and stored locally. They are never sent anywhere except to the
          provider&apos;s API.
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
