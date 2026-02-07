import { describe, expect, it } from "vitest";
import { SCHEMA_VERSION, createEmptyCatalog } from "./schema.js";

describe("schema", () => {
  it("exports schema version", () => {
    expect(SCHEMA_VERSION).toBe(1);
  });

  describe("createEmptyCatalog", () => {
    it("creates a catalog with correct version", () => {
      const catalog = createEmptyCatalog();
      expect(catalog.version).toBe(SCHEMA_VERSION);
    });

    it("creates a catalog with empty projects", () => {
      const catalog = createEmptyCatalog();
      expect(catalog.projects).toEqual([]);
    });

    it("creates a catalog with settings", () => {
      const catalog = createEmptyCatalog();
      expect(catalog.settings.schemaVersion).toBe(SCHEMA_VERSION);
    });
  });
});
