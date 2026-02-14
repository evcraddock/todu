import type { Api, Model } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import { resolveModel } from "./agent.js";

// ============================================================================
// Test helpers
// ============================================================================

function fakeModel(provider: string, modelId: string): Model<Api> {
  return {
    id: modelId,
    name: modelId,
    api: `${provider}-api` as Api,
    provider,
    baseUrl: `https://${provider}.example.com`,
  } as Model<Api>;
}

const FAKE_MODELS: Record<string, Record<string, Model<Api>>> = {
  openai: {
    "gpt-5.1": fakeModel("openai", "gpt-5.1"),
    "gpt-4o": fakeModel("openai", "gpt-4o"),
  },
  "openai-codex": {
    "gpt-5.1": fakeModel("openai-codex", "gpt-5.1"),
  },
  anthropic: {
    "claude-sonnet-4": fakeModel("anthropic", "claude-sonnet-4"),
  },
};

function fakeGetModel(provider: string, modelId: string): Model<Api> | undefined {
  return FAKE_MODELS[provider]?.[modelId];
}

const ALIASES: Record<string, string[]> = {
  openai: ["openai-codex"],
  google: ["google-gemini-cli"],
};

// ============================================================================
// resolveModel
// ============================================================================

describe("resolveModel", () => {
  it("returns the direct model when no aliases exist", () => {
    const model = resolveModel("anthropic", "claude-sonnet-4", {
      aliases: ALIASES,
      hasOAuthCreds: () => false,
      getModelFn: fakeGetModel,
    });
    expect(model?.provider).toBe("anthropic");
    expect(model?.id).toBe("claude-sonnet-4");
  });

  it("returns the direct model when alias has no OAuth creds", () => {
    const model = resolveModel("openai", "gpt-5.1", {
      aliases: ALIASES,
      hasOAuthCreds: () => false,
      getModelFn: fakeGetModel,
    });
    expect(model?.provider).toBe("openai");
    expect(model?.baseUrl).toBe("https://openai.example.com");
  });

  it("prefers the alias model when alias has OAuth creds", () => {
    const model = resolveModel("openai", "gpt-5.1", {
      aliases: ALIASES,
      hasOAuthCreds: (id) => id === "openai-codex",
      getModelFn: fakeGetModel,
    });
    expect(model?.provider).toBe("openai-codex");
    expect(model?.baseUrl).toBe("https://openai-codex.example.com");
  });

  it("falls back to direct model when alias has creds but model not found there", () => {
    const model = resolveModel("openai", "gpt-4o", {
      aliases: ALIASES,
      hasOAuthCreds: (id) => id === "openai-codex",
      getModelFn: fakeGetModel,
    });
    // gpt-4o only exists in openai, not openai-codex
    expect(model?.provider).toBe("openai");
    expect(model?.id).toBe("gpt-4o");
  });

  it("returns undefined when model not found anywhere", () => {
    const model = resolveModel("openai", "nonexistent", {
      aliases: ALIASES,
      hasOAuthCreds: () => false,
      getModelFn: fakeGetModel,
    });
    expect(model).toBeUndefined();
  });

  it("works for provider with no aliases defined", () => {
    const model = resolveModel("anthropic", "claude-sonnet-4", {
      aliases: {},
      hasOAuthCreds: () => true,
      getModelFn: fakeGetModel,
    });
    expect(model?.provider).toBe("anthropic");
  });
});
