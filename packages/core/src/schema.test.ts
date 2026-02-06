import { describe, expect, it } from "bun:test";
import { createEmptyDocument } from "./schema";

describe("schema", () => {
  describe("createEmptyDocument", () => {
    it("creates a document with empty tasks and projects", () => {
      const doc = createEmptyDocument();

      expect(doc.tasks).toEqual({});
      expect(doc.projects).toEqual({});
      expect(doc.version).toBe(1);
    });
  });
});
