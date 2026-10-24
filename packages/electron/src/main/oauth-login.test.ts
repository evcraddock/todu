import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fauxProvider } from "@earendil-works/pi-ai";
import type { BrowserWindow } from "electron";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { loadOAuthCredentials } from "./credentials.js";
import { models } from "./models.js";
import { getOAuthStatus, registerOAuthIpc, unregisterOAuthIpc } from "./oauth.js";

const desktop = vi.hoisted(() => ({
  userData: "",
  handlers: new Map<string, (...args: unknown[]) => unknown>(),
  openExternal: vi.fn(async () => {}),
}));
vi.mock("electron", () => ({
  app: { getPath: () => desktop.userData },
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      desktop.handlers.set(channel, handler),
    removeHandler: (channel: string) => desktop.handlers.delete(channel),
  },
  shell: { openExternal: desktop.openExternal },
  safeStorage: {
    isEncryptionAvailable: () => false,
  },
}));
const send = vi.fn();
const mainWindow = { isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow;
const credential = {
  type: "oauth" as const,
  refresh: "refresh",
  access: "access",
  expires: Date.now() + 3600000,
};
function invoke(channel: string, ...args: unknown[]): unknown {
  const handler = desktop.handlers.get(channel);
  if (!handler) throw new Error(`Missing handler: ${channel}`);
  return handler(null, ...args);
}
beforeEach(() => {
  desktop.userData = fs.mkdtempSync(path.join(os.tmpdir(), "todu-oauth-"));
  vi.clearAllMocks();
  registerOAuthIpc(mainWindow);
});
afterEach(() => {
  unregisterOAuthIpc();
  models.deleteProvider("test-login");
  fs.rmSync(desktop.userData, { recursive: true, force: true });
});

it("bridges provider auth notifications and prompts, then persists successful login", async () => {
  const faux = fauxProvider({ provider: "test-login" });
  models.setProvider({
    ...faux.provider,
    auth: {
      oauth: {
        name: "Test subscription",
        isSubscription: true,
        login: async (interaction) => {
          interaction.notify({
            type: "device_code",
            userCode: "ABCD",
            verificationUri: "https://example.com/activate",
          });
          const answer = await interaction.prompt({
            type: "select",
            message: "Choose account",
            options: [{ id: "work", label: "Work account" }],
          });
          expect(answer).toBe("work");
          return credential;
        },
        refresh: vi.fn(),
        toAuth: vi.fn(),
      },
    },
  });
  const login = invoke("todu:oauth:login", "test-login");
  await vi.waitFor(() =>
    expect(send).toHaveBeenCalledWith(
      "todu:oauth:event",
      expect.objectContaining({ type: "prompt", message: "Choose account\nwork: Work account" }),
    ),
  );
  expect(desktop.openExternal).toHaveBeenCalledWith("https://example.com/activate");
  expect(send).toHaveBeenCalledWith(
    "todu:oauth:event",
    expect.objectContaining({
      type: "progress",
      message: "Enter code ABCD at https://example.com/activate",
    }),
  );
  invoke("todu:oauth:prompt-response", "work");
  await login;
  expect(loadOAuthCredentials("test-login")).toEqual(credential);
  expect(getOAuthStatus()).toContainEqual({
    id: "test-login",
    name: "Test subscription",
    connected: true,
    expired: false,
  });
  expect(send).toHaveBeenCalledWith("todu:oauth:event", {
    type: "login-complete",
    providerId: "test-login",
  });
});

it("cancels a pending prompt without storing credentials", async () => {
  const faux = fauxProvider({ provider: "test-login" });
  models.setProvider({
    ...faux.provider,
    auth: {
      oauth: {
        name: "Test subscription",
        isSubscription: true,
        login: async (interaction) => {
          await interaction.prompt({
            type: "manual_code",
            message: "Paste code",
            signal: interaction.signal,
          });
          return credential;
        },
        refresh: vi.fn(),
        toAuth: vi.fn(),
      },
    },
  });
  const login = invoke("todu:oauth:login", "test-login");
  const rejected = expect(login).rejects.toThrow();
  await vi.waitFor(() =>
    expect(send).toHaveBeenCalledWith(
      "todu:oauth:event",
      expect.objectContaining({ type: "prompt" }),
    ),
  );
  invoke("todu:oauth:cancel");
  await rejected;
  expect(loadOAuthCredentials("test-login")).toBeNull();
  expect(send).toHaveBeenCalledWith(
    "todu:oauth:event",
    expect.objectContaining({ type: "login-error" }),
  );
});
