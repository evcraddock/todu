import { writeFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import {
  CommentEditorError,
  composeJournalEntry,
  composeTaskComment,
  normalizeCommentContent,
} from "./comment-actions.js";

describe("comment actions", () => {
  it("normalizes non-empty comments", () => {
    expect(normalizeCommentContent("  Looks good  ")).toBe("Looks good");
  });

  it("rejects empty comments", () => {
    expect(normalizeCommentContent("")).toBeNull();
    expect(normalizeCommentContent("   \t  ")).toBeNull();
  });

  it("returns content saved by the configured visual editor", () => {
    const spawnEditor = vi.fn((_command: string, args: readonly string[]) => {
      writeFileSync(args.at(-1) ?? "", "  Composed in the editor\n");
      return { status: 0, signal: null };
    });

    expect(
      composeTaskComment({
        env: { EDITOR: "ignored", VISUAL: "code --wait" },
        spawnEditor,
      }),
    ).toBe("Composed in the editor");
    expect(spawnEditor).toHaveBeenCalledWith("code", ["--wait", expect.any(String)]);
  });

  it("composes journal entries with a dedicated temporary file", () => {
    const spawnEditor = vi.fn((_command: string, args: readonly string[]) => {
      writeFileSync(args.at(-1) ?? "", "Weekly reflection\n");
      return { status: 0, signal: null };
    });

    expect(composeJournalEntry({ env: { EDITOR: "nano" }, spawnEditor })).toBe("Weekly reflection");
    expect(spawnEditor).toHaveBeenCalledWith("nano", [expect.stringContaining("entry.md")]);
  });

  it("treats unchanged empty editor content as cancellation", () => {
    expect(
      composeTaskComment({
        env: { EDITOR: "nano" },
        spawnEditor: () => ({ status: 0, signal: null }),
      }),
    ).toBeNull();
  });

  it("reports missing editor configuration", () => {
    expect(() =>
      composeTaskComment({
        env: {},
        spawnEditor: () => ({ status: 0, signal: null }),
      }),
    ).toThrow(new CommentEditorError("No terminal editor configured. Set VISUAL or EDITOR."));
  });

  it("reports editor launch failures", () => {
    expect(() =>
      composeTaskComment({
        env: { EDITOR: "missing-editor" },
        spawnEditor: () => ({
          status: null,
          signal: null,
          error: new Error("command not found"),
        }),
      }),
    ).toThrow(
      new CommentEditorError(
        'Failed to launch terminal editor "missing-editor": command not found',
      ),
    );
  });
});
