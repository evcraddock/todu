import { describe, expect, it } from "vitest";
import { normalizeCommentContent } from "./comment-actions.js";

describe("comment actions", () => {
  it("normalizes non-empty comments", () => {
    expect(normalizeCommentContent("  Looks good  ")).toBe("Looks good");
  });

  it("rejects empty comments", () => {
    expect(normalizeCommentContent("")).toBeNull();
    expect(normalizeCommentContent("   \t  ")).toBeNull();
  });
});
