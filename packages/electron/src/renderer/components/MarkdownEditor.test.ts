import { describe, expect, it } from "vitest";
import type { MarkdownEditorProps } from "./MarkdownEditor.js";

describe("MarkdownEditor types", () => {
  it("props interface has required value field", () => {
    const props: MarkdownEditorProps = {
      value: "# Hello\n\nSome **bold** text",
    };
    expect(props.value).toContain("# Hello");
  });

  it("props interface supports all optional fields", () => {
    const props: MarkdownEditorProps = {
      value: "",
      onChange: (md: string) => md,
      placeholder: "Write something…",
      minHeight: 200,
      autoFocus: true,
      editable: false,
      onBlur: () => {},
    };
    expect(props.editable).toBe(false);
    expect(props.minHeight).toBe(200);
    expect(props.autoFocus).toBe(true);
    expect(props.placeholder).toBe("Write something…");
  });

  it("editable defaults intent is true (tested at component level)", () => {
    // The component defaults editable to true when not provided
    const props: MarkdownEditorProps = { value: "test" };
    expect(props.editable).toBeUndefined();
  });
});
