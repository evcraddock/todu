import fs from "node:fs";
import path from "node:path";
import type { OAuthCredentials } from "@earendil-works/pi-ai";
import { app, safeStorage } from "electron";

function getKeysPath(): string {
  return path.join(app.getPath("userData"), "agent-keys.json");
}

interface StoredCredentials {
  [providerId: string]: string; // base64-encoded encrypted JSON
}

// ============================================================================
// Credential Storage
// ============================================================================

function getCredentialsPath(): string {
  return path.join(app.getPath("userData"), "oauth-credentials.json");
}

function loadStoredCredentials(): StoredCredentials {
  try {
    const filePath = getCredentialsPath();
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as StoredCredentials;
    }
  } catch {
    // Corrupt file, start fresh
  }
  return {};
}

function saveStoredCredentials(stored: StoredCredentials): void {
  const filePath = getCredentialsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(stored, null, 2), "utf-8");
}

function encryptCredentials(creds: OAuthCredentials): string {
  const json = JSON.stringify(creds);
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(json).toString("base64");
  }
  return Buffer.from(`plain:${json}`).toString("base64");
}

function decryptCredentials(encoded: string): OAuthCredentials | null {
  try {
    const buf = Buffer.from(encoded, "base64");
    let json: string;
    if (safeStorage.isEncryptionAvailable()) {
      json = safeStorage.decryptString(buf);
    } else {
      const text = buf.toString("utf-8");
      if (text.startsWith("plain:")) {
        json = text.slice(6);
      } else {
        return null;
      }
    }
    return JSON.parse(json) as OAuthCredentials;
  } catch {
    return null;
  }
}

/** Save OAuth credentials for a provider. */
export function saveOAuthCredentials(providerId: string, creds: OAuthCredentials): void {
  const stored = loadStoredCredentials();
  stored[providerId] = encryptCredentials(creds);
  saveStoredCredentials(stored);
}

/** Load OAuth credentials for a provider (returns null if not stored or corrupt). */
export function loadOAuthCredentials(providerId: string): OAuthCredentials | null {
  const stored = loadStoredCredentials();
  const encoded = stored[providerId];
  if (!encoded) return null;
  return decryptCredentials(encoded);
}

/** Remove OAuth credentials for a provider. */
export function removeOAuthCredentials(providerId: string): void {
  const stored = loadStoredCredentials();
  delete stored[providerId];
  saveStoredCredentials(stored);
}

interface EncryptedKeys {
  [provider: string]: string; // base64-encoded encrypted value
}

function loadEncryptedKeys(): EncryptedKeys {
  try {
    const filePath = getKeysPath();
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, "utf-8")) as EncryptedKeys;
    }
  } catch {
    // Corrupt file, start fresh
  }
  return {};
}

function saveEncryptedKeys(keys: EncryptedKeys): void {
  const filePath = getKeysPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(keys, null, 2), "utf-8");
}

/**
 * Store an API key securely using Electron's safeStorage.
 * Falls back to plain text if safeStorage is unavailable (e.g., Linux without a keyring).
 */
export function setApiKey(provider: string, key: string): void {
  const keys = loadEncryptedKeys();
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(key);
    keys[provider] = encrypted.toString("base64");
  } else {
    // Fallback: base64-encode (not secure, but functional)
    keys[provider] = Buffer.from(`plain:${key}`).toString("base64");
  }
  saveEncryptedKeys(keys);
}

/**
 * Retrieve a stored API key.
 */
export function getApiKey(provider: string): string | undefined {
  const keys = loadEncryptedKeys();
  const stored = keys[provider];
  if (!stored) return undefined;

  try {
    const buf = Buffer.from(stored, "base64");
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(buf);
    }
    // Fallback: check for plain prefix
    const text = buf.toString("utf-8");
    if (text.startsWith("plain:")) {
      return text.slice(6);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Check which providers have API keys stored (without revealing the keys).
 */
export function getStoredProviders(): Record<string, boolean> {
  const keys = loadEncryptedKeys();
  const result: Record<string, boolean> = {};
  for (const p of Object.keys(keys)) {
    result[p] = !!getApiKey(p);
  }
  return result;
}

/**
 * Remove a stored API key.
 */
export function removeApiKey(provider: string): void {
  const keys = loadEncryptedKeys();
  delete keys[provider];
  saveEncryptedKeys(keys);
}

/** Enumerate stored credential IDs without decrypting secrets. */
export function getCredentialProviderIds(): { oauth: string[]; apiKey: string[] } {
  return {
    oauth: Object.keys(loadStoredCredentials()),
    apiKey: Object.keys(loadEncryptedKeys()),
  };
}
