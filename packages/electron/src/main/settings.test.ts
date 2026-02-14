import { describe, expect, it } from "vitest";
import { formatProviderLabel, listProviders } from "./settings.js";

// ============================================================================
// formatProviderLabel
// ============================================================================

describe("formatProviderLabel", () => {
  it("capitalises a single-word provider", () => {
    expect(formatProviderLabel("anthropic")).toBe("Anthropic");
  });

  it("capitalises each segment of a hyphenated provider", () => {
    expect(formatProviderLabel("amazon-bedrock")).toBe("Amazon Bedrock");
  });

  it("uses brand casing for OpenAI", () => {
    expect(formatProviderLabel("openai")).toBe("OpenAI");
  });

  it("uses brand casing for OpenAI in compound IDs", () => {
    expect(formatProviderLabel("openai-codex")).toBe("OpenAI Codex");
    expect(formatProviderLabel("azure-openai-responses")).toBe("Azure OpenAI Responses");
  });

  it("uses brand casing for GitHub", () => {
    expect(formatProviderLabel("github-copilot")).toBe("GitHub Copilot");
  });

  it("uses brand casing for xAI", () => {
    expect(formatProviderLabel("xai")).toBe("xAI");
  });

  it("handles google multi-segment IDs", () => {
    expect(formatProviderLabel("google-gemini-cli")).toBe("Google Gemini Cli");
    expect(formatProviderLabel("google-vertex")).toBe("Google Vertex");
  });

  it("uses brand casing for AI segment", () => {
    expect(formatProviderLabel("vercel-ai-gateway")).toBe("Vercel AI Gateway");
  });
});

// ============================================================================
// listProviders
// ============================================================================

describe("listProviders", () => {
  it("returns a non-empty array", () => {
    const providers = listProviders();
    expect(providers.length).toBeGreaterThan(0);
  });

  it("each entry has id, label, and models array", () => {
    const providers = listProviders();
    for (const p of providers) {
      expect(typeof p.id).toBe("string");
      expect(typeof p.label).toBe("string");
      expect(Array.isArray(p.models)).toBe(true);
    }
  });

  it("includes known providers", () => {
    const providers = listProviders();
    const ids = providers.map((p) => p.id);
    expect(ids).toContain("anthropic");
    expect(ids).toContain("openai");
    expect(ids).toContain("google");
  });

  it("anthropic has models with id and label", () => {
    const providers = listProviders();
    const anthropic = providers.find((p) => p.id === "anthropic");
    expect(anthropic).toBeDefined();
    expect(anthropic!.models.length).toBeGreaterThan(0);

    for (const m of anthropic!.models) {
      expect(typeof m.id).toBe("string");
      expect(typeof m.label).toBe("string");
      expect(m.id.length).toBeGreaterThan(0);
      expect(m.label.length).toBeGreaterThan(0);
    }
  });

  it("labels use brand casing", () => {
    const providers = listProviders();
    const openai = providers.find((p) => p.id === "openai");
    expect(openai?.label).toBe("OpenAI");

    const copilot = providers.find((p) => p.id === "github-copilot");
    expect(copilot?.label).toBe("GitHub Copilot");
  });
});
