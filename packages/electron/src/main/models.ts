import type { Credential, CredentialStore } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import {
  getApiKey,
  getCredentialProviderIds,
  loadOAuthCredentials,
  removeOAuthCredentials,
  saveOAuthCredentials,
  setApiKey,
} from "./credentials.js";

/** Adapt the existing encrypted desktop files to Pi's serialized credential store. */
export function createCredentialStore(): CredentialStore {
  const pending = new Map<string, Promise<unknown>>();
  const read = async (providerId: string): Promise<Credential | undefined> => {
    const oauth = loadOAuthCredentials(providerId);
    if (oauth) return { ...oauth, type: "oauth" };
    const key = getApiKey(providerId);
    return key ? { type: "api_key", key } : undefined;
  };
  const serialize = async <T>(providerId: string, action: () => Promise<T>): Promise<T> => {
    const previous = pending.get(providerId) ?? Promise.resolve();
    const current = previous.catch(() => {}).then(action);
    pending.set(providerId, current);
    try {
      return await current;
    } finally {
      if (pending.get(providerId) === current) pending.delete(providerId);
    }
  };
  return {
    read,
    async list() {
      const ids = getCredentialProviderIds();
      return [
        ...ids.oauth.map((providerId) => ({ providerId, type: "oauth" as const })),
        ...ids.apiKey
          .filter((id) => !ids.oauth.includes(id))
          .map((providerId) => ({ providerId, type: "api_key" as const })),
      ];
    },
    modify(providerId, update, options) {
      return serialize(providerId, async () => {
        options?.signal?.throwIfAborted();
        const next = await update(await read(providerId));
        if (next?.type === "oauth") saveOAuthCredentials(providerId, next);
        if (next?.type === "api_key" && next.key) {
          setApiKey(providerId, next.key);
          removeOAuthCredentials(providerId);
        }
        return read(providerId);
      });
    },
    delete(providerId, options) {
      return serialize(providerId, async () => {
        options?.signal?.throwIfAborted();
        // Disconnecting OAuth preserves any separately configured manual API key.
        removeOAuthCredentials(providerId);
      });
    },
  };
}

export const models = builtinModels({ credentials: createCredentialStore() });
