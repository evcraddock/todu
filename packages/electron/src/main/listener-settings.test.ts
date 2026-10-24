import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configureListener, getListenerSettings } from "./listener-settings.js";

describe("listener settings", () => {
  let directory: string;
  let configPath: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-listener-settings-"));
    configPath = path.join(directory, "config.yaml");
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));

  it("preserves saved binding, server settings, and comments while toggling", async () => {
    fs.writeFileSync(
      configPath,
      "# My config\nsync:\n  remote:\n    server: ws://localhost:3030\n  listener:\n    enabled: false\n    bind: 127.0.0.1\n    port: 24400\n",
    );
    expect(await configureListener(configPath, true)).toMatchObject({
      enabled: true,
      bind: "127.0.0.1",
      port: 24400,
    });
    expect(getListenerSettings(configPath).enabled).toBe(true);
    expect(await configureListener(configPath, false)).toMatchObject({
      enabled: false,
      bind: "127.0.0.1",
      port: 24400,
    });
    const content = fs.readFileSync(configPath, "utf8");
    expect(content).toContain("# My config");
    expect(content).toContain("server: ws://localhost:3030");
  });

  it("refuses malformed configuration and leaves it unchanged", async () => {
    const content = "sync: [broken";
    fs.writeFileSync(configPath, content);
    await expect(configureListener(configPath, true)).rejects.toThrow();
    expect(fs.readFileSync(configPath, "utf8")).toBe(content);
  });

  it("rejects non-boolean requests without writing", async () => {
    await expect(configureListener(configPath, "yes")).rejects.toThrow("must be a boolean");
    expect(fs.existsSync(configPath)).toBe(false);
  });
});
