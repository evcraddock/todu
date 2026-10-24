import { describe, expect, it } from "vitest";
import { models } from "./models.js";
import { OAUTH_PROVIDER_ALIASES } from "./oauth.js";

// ============================================================================
// OAuth provider registry (from pi-ai)
// ============================================================================

describe("OAuth provider registry", () => {
  it("returns available providers", () => {
    const providers = models.getProviders().filter((provider) => provider.auth.oauth);
    expect(providers.length).toBeGreaterThan(0);
  });

  it("includes anthropic provider", () => {
    const provider = models.getProvider("anthropic");
    expect(provider).toBeDefined();
    expect(provider!.id).toBe("anthropic");
    expect(provider!.auth.oauth!.name).toBe("Anthropic (Claude Pro/Max)");
  });

  it("anthropic provider has required methods", () => {
    const provider = models.getProvider("anthropic");
    expect(provider).toBeDefined();
    expect(typeof provider!.auth.oauth!.login).toBe("function");
    expect(typeof provider!.auth.oauth!.refresh).toBe("function");
    expect(typeof provider!.auth.oauth!.toAuth).toBe("function");
  });

  it("derives request auth from an existing access token", async () => {
    const provider = models.getProvider("anthropic");
    expect(provider).toBeDefined();
    const auth = await provider!.auth.oauth!.toAuth({
      type: "oauth",
      refresh: "refresh-token",
      access: "access-token-123",
      expires: Date.now() + 3600000,
    });
    expect(auth.apiKey).toBe("access-token-123");
  });

  it("returns undefined for unknown provider", () => {
    const provider = models.getProvider("nonexistent-provider");
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
        const provider = models.getProvider(alias);
        expect(provider, `${alias} should be a valid OAuth provider`).toBeDefined();
      }
    }
  });
});
