import { type ReactNode, useCallback, useEffect, useState } from "react";
import type { AgentSettings } from "../types/window.js";

// ============================================================================
// Provider / Model options
// ============================================================================

interface ProviderOption {
  id: string;
  label: string;
  models: ModelOption[];
}

interface ModelOption {
  id: string;
  label: string;
}

const PROVIDERS: ProviderOption[] = [
  {
    id: "anthropic",
    label: "Anthropic",
    models: [
      { id: "claude-sonnet-4-20250514", label: "Claude Sonnet 4" },
      { id: "claude-opus-4-20250514", label: "Claude Opus 4" },
      { id: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku" },
    ],
  },
  {
    id: "openai",
    label: "OpenAI",
    models: [
      { id: "gpt-4o", label: "GPT-4o" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini" },
      { id: "o3-mini", label: "o3-mini" },
    ],
  },
  {
    id: "google",
    label: "Google",
    models: [
      { id: "gemini-2.5-flash-preview-05-20", label: "Gemini 2.5 Flash" },
      { id: "gemini-2.5-pro-preview-05-06", label: "Gemini 2.5 Pro" },
    ],
  },
];

// ============================================================================
// Component
// ============================================================================

export function SettingsView(): ReactNode {
  const [settings, setSettings] = useState<AgentSettings | null>(null);
  const [storedKeys, setStoredKeys] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // API key input state — one per provider
  const [keyInputs, setKeyInputs] = useState<Record<string, string>>({});

  // Load settings on mount
  useEffect(() => {
    Promise.all([window.todu.settings.get(), window.todu.settings.storedProviders()]).then(
      ([s, keys]) => {
        setSettings(s);
        setStoredKeys(keys);
      },
    );
  }, []);

  // Get models for current provider
  const currentProvider = PROVIDERS.find((p) => p.id === settings?.provider) ?? PROVIDERS[0];

  const handleProviderChange = useCallback(
    (providerId: string) => {
      const provider = PROVIDERS.find((p) => p.id === providerId);
      if (provider && settings) {
        const newSettings = {
          provider: providerId,
          modelId: provider.models[0]?.id ?? "",
        };
        setSettings(newSettings);
      }
    },
    [settings],
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

  if (!settings) {
    return <div className="loading-state">Loading settings...</div>;
  }

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
            {PROVIDERS.map((p) => (
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
            {currentProvider.models.map((m) => (
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

        {PROVIDERS.map((provider) => (
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
