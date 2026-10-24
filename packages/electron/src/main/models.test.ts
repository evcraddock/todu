import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Agent } from "@earendil-works/pi-agent-core";
import {
  AssistantMessageEventStream,
  createModels,
  fauxAssistantMessage,
  fauxProvider,
  fauxToolCall,
} from "@earendil-works/pi-ai";
import type { Todu } from "@todu/engine";
import type { BrowserWindow } from "electron";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildSystemPrompt,
  resetAgentConversation,
  setAgentSystemPrompt,
  setupAgent,
  teardownAgent,
} from "./agent.js";
import { getApiKey, loadOAuthCredentials, saveOAuthCredentials, setApiKey } from "./credentials.js";
import { createCredentialStore, models } from "./models.js";
import { loadSettings } from "./settings.js";
import { createToduTools } from "./tools.js";

const desktop = vi.hoisted(() => ({
  userData: "",
  encrypted: true,
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
}));
vi.mock("electron", () => ({
  app: { getPath: () => desktop.userData },
  ipcMain: {
    handle: (channel: string, callback: (...args: unknown[]) => unknown) =>
      desktop.handlers.set(channel, callback),
    removeHandler: (channel: string) => desktop.handlers.delete(channel),
  },
  safeStorage: {
    isEncryptionAvailable: () => desktop.encrypted,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`),
    decryptString: (value: Buffer) => value.toString().slice("encrypted:".length),
  },
}));

beforeEach(() => {
  desktop.userData = fs.mkdtempSync(path.join(os.tmpdir(), "todu-pi-"));
  desktop.encrypted = true;
});
afterEach(() => {
  teardownAgent();
  fs.rmSync(desktop.userData, { recursive: true, force: true });
});

describe("desktop Pi credentials", () => {
  it.each([true, false])(
    "reads pre-upgrade OAuth and API-key files with encryption=%s",
    async (encrypted) => {
      desktop.encrypted = encrypted;
      const encode = (value: string): string =>
        Buffer.from(`${encrypted ? "encrypted:" : "plain:"}${value}`).toString("base64");
      const oldCredential = {
        refresh: "refresh",
        access: "access",
        expires: Date.now() + 3600000,
        accountId: "account",
      };
      fs.writeFileSync(
        path.join(desktop.userData, "oauth-credentials.json"),
        JSON.stringify({ anthropic: encode(JSON.stringify(oldCredential)) }),
      );
      fs.writeFileSync(
        path.join(desktop.userData, "agent-keys.json"),
        JSON.stringify({ anthropic: encode("manual-key"), google: encode("google-key") }),
      );
      const store = createCredentialStore();
      expect(await store.read("anthropic")).toEqual({ ...oldCredential, type: "oauth" });
      expect(await store.read("google")).toEqual({ type: "api_key", key: "google-key" });
      await store.delete("anthropic");
      expect(await store.read("anthropic")).toEqual({ type: "api_key", key: "manual-key" });
    },
  );

  it("keeps saved provider, model, and timezone selections", () => {
    const settings = { provider: "openai", modelId: "gpt-5.1", timezone: "America/Chicago" };
    fs.writeFileSync(path.join(desktop.userData, "agent-settings.json"), JSON.stringify(settings));
    expect(loadSettings()).toEqual(settings);
  });

  it("uses an available default and migrates the retired default without changing timezone", () => {
    const defaults = loadSettings();
    expect(models.getModel(defaults.provider, defaults.modelId)).toBeDefined();
    fs.writeFileSync(
      path.join(desktop.userData, "agent-settings.json"),
      JSON.stringify({
        provider: "anthropic",
        modelId: "claude-sonnet-4-20250514",
        timezone: "America/Chicago",
      }),
    );
    expect(loadSettings()).toEqual({
      provider: "anthropic",
      modelId: "claude-sonnet-4-6",
      timezone: "America/Chicago",
    });
  });

  it("refreshes a rotating token only once for concurrent requests and preserves provider auth", async () => {
    const store = createCredentialStore();
    const collection = createModels({ credentials: store });
    const faux = fauxProvider({ provider: "test-oauth" });
    saveOAuthCredentials("test-oauth", {
      refresh: "old-refresh",
      access: "expired",
      expires: 0,
      accountId: "account",
    });
    const refresh = vi.fn(async () => ({
      type: "oauth" as const,
      refresh: "new-refresh",
      access: "fresh",
      expires: Date.now() + 3600000,
      accountId: "account",
    }));
    collection.setProvider({
      ...faux.provider,
      auth: {
        oauth: {
          name: "Test subscription",
          login: vi.fn(),
          refresh,
          toAuth: async (credential) => ({
            apiKey: credential.access,
            baseUrl: "https://account.example.com",
            headers: { "X-Account": String(credential.accountId) },
          }),
        },
      },
    });
    const results = await Promise.all([
      collection.getAuth("test-oauth"),
      collection.getAuth("test-oauth"),
    ]);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(results[0]?.auth).toEqual({
      apiKey: "fresh",
      baseUrl: "https://account.example.com",
      headers: { "X-Account": "account" },
    });
    expect(results[1]).toEqual(results[0]);
    expect(loadOAuthCredentials("test-oauth")?.refresh).toBe("new-refresh");
  });

  it("preserves failed refresh credentials without falling back to a manual key", async () => {
    const collection = createModels({ credentials: createCredentialStore() });
    const faux = fauxProvider({ provider: "test-oauth" });
    setApiKey("test-oauth", "manual-key");
    saveOAuthCredentials("test-oauth", { refresh: "retry-me", access: "expired", expires: 0 });
    collection.setProvider({
      ...faux.provider,
      auth: {
        oauth: {
          name: "Test subscription",
          login: vi.fn(),
          refresh: async () => {
            throw new Error("offline");
          },
          toAuth: vi.fn(),
        },
      },
    });
    await expect(collection.getAuth("test-oauth")).rejects.toThrow("OAuth refresh failed");
    expect(loadOAuthCredentials("test-oauth")?.refresh).toBe("retry-me");
    expect(getApiKey("test-oauth")).toBe("manual-key");
  });
});

describe("Pi agent runtime", () => {
  it("notifies the renderer after Clear finishes resetting the conversation", async () => {
    const send = vi.fn();
    const mainWindow = {
      isDestroyed: () => false,
      webContents: { send },
    } as unknown as BrowserWindow;
    setupAgent({} as Todu, mainWindow);
    await desktop.handlers.get("todu:agent:clear")?.(null);
    expect(send).toHaveBeenLastCalledWith("todu:agent:event", { type: "messages_cleared" });
  });

  it("aborts and settles a streaming response before clearing the conversation", async () => {
    const faux = fauxProvider();
    const started = vi.fn();
    const agent = new Agent({
      initialState: { model: faux.getModel(), systemPrompt: "Keep this context" },
      streamFn: (_model, _context, options) => {
        const stream = new AssistantMessageEventStream();
        options?.signal?.addEventListener(
          "abort",
          () => {
            stream.push({
              type: "error",
              reason: "aborted",
              error: fauxAssistantMessage("", { stopReason: "aborted", errorMessage: "Aborted" }),
            });
          },
          { once: true },
        );
        started();
        return stream;
      },
    });
    const response = agent.prompt("Start a response");
    await vi.waitFor(() => expect(started).toHaveBeenCalled());
    expect(agent.state.isStreaming).toBe(true);
    await resetAgentConversation(agent);
    await response;
    expect(agent.state.isStreaming).toBe(false);
    expect(agent.state.messages.map((message) => message.role)).toEqual(["system"]);
    expect(agent.state.systemPrompt).toBe("Keep this context");
  });

  it("executes a schema-validated Todu tool, forwards lifecycle events, and retains tools across context changes and reset", async () => {
    const list = vi.fn(async () => ({ ok: true as const, value: [] }));
    const todu = { task: { list } } as unknown as Todu;
    const faux = fauxProvider({ tokensPerSecond: Infinity });
    const collection = createModels();
    collection.setProvider(faux.provider);
    const tools = createToduTools(todu);
    const agent = new Agent({
      initialState: { model: faux.getModel(), tools, systemPrompt: "Base instructions" },
      streamFn: (model, context, options) => collection.streamSimple(model, context, options),
    });
    const events: string[] = [];
    agent.subscribe((event) => {
      events.push(event.type);
    });
    setAgentSystemPrompt(
      agent,
      buildSystemPrompt({ entityType: "task", entityId: "task-test" }, "Focused task"),
    );
    faux.setResponses([
      fauxAssistantMessage(fauxToolCall("list_tasks", { status: ["inprogress"] }), {
        stopReason: "toolUse",
      }),
      fauxAssistantMessage("No matching tasks"),
    ]);
    await agent.prompt("Show inprogress tasks");
    expect(list).toHaveBeenCalledWith({ status: ["inprogress"] }, undefined);
    expect(events).toEqual(
      expect.arrayContaining([
        "agent_start",
        "message_update",
        "tool_execution_start",
        "tool_execution_end",
        "agent_end",
      ]),
    );
    expect(agent.state.errorMessage).toBeUndefined();
    expect(agent.state.messages.some((message) => message.role === "toolResult")).toBe(true);
    setAgentSystemPrompt(agent, "Base instructions");
    expect(agent.state.systemPrompt).toBe("Base instructions");
    expect(agent.state.messages.some((message) => message.role === "toolResult")).toBe(true);
    agent.reset();
    expect(agent.state.messages.map((message) => message.role)).toEqual(["system"]);
    expect(agent.state.tools).toHaveLength(19);
    expect(agent.state.systemPrompt).toBe("Base instructions");
  });
});
