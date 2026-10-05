import { describe, expect, it } from "vitest";
import { runServiceCommand } from "./service-command.js";

describe("asynchronous service-manager commands", () => {
  it("keeps timers responsive during a delayed command", async () => {
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 5);
    try {
      const result = await runServiceCommand({
        command: process.execPath,
        args: ["-e", 'setTimeout(() => console.log("done"), 60)'],
      });
      expect(result).toEqual({ ok: true, message: "done" });
      expect(ticks).toBeGreaterThan(0);
    } finally {
      clearInterval(timer);
    }
  });

  it("reports command errors and spawn failures", async () => {
    expect(
      await runServiceCommand({
        command: process.execPath,
        args: ["-e", 'console.error("service failed"); process.exit(1)'],
      }),
    ).toEqual({ ok: false, message: "service failed" });
    const missing = await runServiceCommand({
      command: "/nonexistent/todu-service-command",
      args: [],
    });
    expect(missing.ok).toBe(false);
    expect(missing.message).toContain("ENOENT");
  });

  it("bounds a hung service-manager command", async () => {
    const result = await runServiceCommand({
      command: process.execPath,
      args: ["-e", "setInterval(() => {}, 1000)"],
      timeoutMs: 50,
    });
    expect(result.ok).toBe(false);
    expect(result.message.length).toBeGreaterThan(0);
  });
});
