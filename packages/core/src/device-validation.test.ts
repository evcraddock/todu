import { describe, expect, it } from "vitest";
import { validateDeviceEndpoint, validateDeviceName } from "./validation.js";

describe("device metadata validation", () => {
  it.each([
    "Laptop",
    "  Mac mini  ",
    "a".repeat(100),
  ])("accepts a bounded readable name: %s", (name) => {
    expect(validateDeviceName(name)).toBeNull();
  });
  it.each([
    "",
    " ",
    "a".repeat(101),
    "host\nname",
    "host\u001b",
    1,
    null,
  ])("rejects invalid names: %s", (name) => {
    expect(validateDeviceName(name)?.field).toBe("name");
  });
  it.each([
    null,
    "http://laptop.lan:24377",
    "http://192.168.1.2:24377/",
    "http://[::1]:24377",
    "https://host.example",
  ])("accepts a base endpoint or explicit clearing: %s", (endpoint) => {
    expect(validateDeviceEndpoint(endpoint)).toBeNull();
  });
  it.each([
    undefined,
    7,
    "",
    "host:24377",
    "ws://host",
    "http://user:pass@host",
    "http://host/sync/catalog",
    "http://host/?token=secret",
    "http://host/#fragment",
    " http://host",
    "http://host:65536",
    `http://host/${"a".repeat(2048)}`,
  ])("rejects unsafe or non-base endpoints: %s", (endpoint) => {
    expect(validateDeviceEndpoint(endpoint)?.field).toBe("endpoint");
  });
});
