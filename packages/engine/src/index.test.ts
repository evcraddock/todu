import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "./index.js";

describe("engine", () => {
  it("re-exports core schema version", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});
