import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getInstallationId } from "./installation-id.js";

describe("installation identity", () => {
  let directory: string;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), "todu-installation-"));
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
  it("creates and reuses a persistent UUID", () => {
    const userData = path.join(directory, "desktop");
    const id = getInstallationId(userData);
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    expect(getInstallationId(userData)).toBe(id);
    expect(fs.readFileSync(path.join(userData, "installation-id"), "utf8").trim()).toBe(id);
  });
  it("preserves an existing installation identity", () => {
    const id = "b4238f67-43f2-40c0-81ab-081bcc59eb64";
    fs.writeFileSync(path.join(directory, "installation-id"), id);
    expect(getInstallationId(directory)).toBe(id);
  });
  it("does not silently replace an invalid saved identity", () => {
    fs.writeFileSync(path.join(directory, "installation-id"), "invalid");
    expect(() => getInstallationId(directory)).toThrow("invalid");
    expect(fs.readFileSync(path.join(directory, "installation-id"), "utf8")).toBe("invalid");
  });
});
