import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION } from "./schema.js";

describe("schema", () => {
  it("exports a schema version", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });
});
