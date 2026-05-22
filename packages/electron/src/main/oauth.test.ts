import { getOAuthProvider, getOAuthProviders } from "@earendil-works/pi-ai/oauth";
import { describe, expect, it } from "vitest";
import { OAUTH_PROVIDER_ALIASES } from "./oauth.js";

// ============================================================================
// OAuth provider registry (from pi-ai)
// ============================================================================

describe("OAuth provider registry", () => {
  it("returns available providers", () => {
    const providers = getOAuthProviders();
    expect(providers.length).toBeGreaterThan(0);
  });

  it("includes anthropic provider", () => {
    const provider = getOAuthProvider("anthropic");
    expect(provider).toBeDefined();
    expect(provider!.id).toBe("anthropic");
    expect(provider!.name).toBe("Anthropic (Claude Pro/Max)");
  });

  it("anthropic provider has required methods", () => {
    const provider = getOAuthProvider("anthropic");
    expect(provider).toBeDefined();
    expect(typeof provider!.login).toBe("function");
    expect(typeof provider!.refreshToken).toBe("function");
    expect(typeof provider!.getApiKey).toBe("function");
  });

  it("anthropic uses callback server", () => {
    const provider = getOAuthProvider("anthropic");
    expect(provider).toBeDefined();
    expect(provider!.usesCallbackServer).toBe(true);
  });

  it("getApiKey returns the access token", () => {
    const provider = getOAuthProvider("anthropic");
    expect(provider).toBeDefined();
    const key = provider!.getApiKey({
      refresh: "refresh-token",
      access: "access-token-123",
      expires: Date.now() + 3600000,
    });
    expect(key).toBe("access-token-123");
  });

  it("returns undefined for unknown provider", () => {
    const provider = getOAuthProvider("nonexistent-provider");
    expect(provider).toBeUndefined();
  });
});

// ============================================================================
// OAuth provider alias mapping
// ============================================================================

describe("OAUTH_PROVIDER_ALIASES", () => {
  it("maps openai to openai-codex", () => {
    expect(OAUTH_PROVIDER_ALIASES.openai).toContain("openai-codex");
  });

  it("only maps providers with supported OAuth aliases", () => {
    expect(OAUTH_PROVIDER_ALIASES.google).toBeUndefined();
  });

  it("all alias targets are valid OAuth providers", () => {
    for (const [, aliases] of Object.entries(OAUTH_PROVIDER_ALIASES)) {
      for (const alias of aliases) {
        const provider = getOAuthProvider(alias);
        expect(provider, `${alias} should be a valid OAuth provider`).toBeDefined();
      }
    }
  });
});
