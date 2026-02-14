/**
 * @vitest-environment jsdom
 */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "./MarkdownEditor.js";

afterEach(cleanup);

describe("MarkdownEditor", () => {
  it("renders content from value prop", async () => {
    render(<MarkdownEditor value="Hello **world**" editable={false} />);
    await waitFor(() => {
      expect(screen.getByText("world")).toBeDefined();
    });
  });

  it("shows toolbar when editable", async () => {
    const { container } = render(<MarkdownEditor value="" editable={true} />);
    await waitFor(() => {
      const toolbar = container.querySelector(".md-editor-toolbar");
      expect(toolbar).not.toBeNull();
    });
  });

  it("hides toolbar when read-only", async () => {
    const { container } = render(<MarkdownEditor value="test" editable={false} />);
    await waitFor(() => {
      const toolbar = container.querySelector(".md-editor-toolbar");
      expect(toolbar).toBeNull();
    });
  });

  it("applies editable class when editable", async () => {
    const { container } = render(<MarkdownEditor value="" editable={true} />);
    await waitFor(() => {
      const editor = container.querySelector(".md-editor");
      expect(editor?.className).toContain("md-editor-editable");
    });
  });

  it("applies readonly class when not editable", async () => {
    const { container } = render(<MarkdownEditor value="test" editable={false} />);
    await waitFor(() => {
      const editor = container.querySelector(".md-editor");
      expect(editor?.className).toContain("md-editor-readonly");
    });
  });

  it("renders all toolbar buttons when editable", async () => {
    const { container } = render(<MarkdownEditor value="" editable={true} />);
    await waitFor(() => {
      const buttons = container.querySelectorAll(".md-toolbar-btn");
      // B, I, S, H1, H2, H3, •, 1., </>, 🔗, —
      expect(buttons.length).toBe(11);
    });
  });

  it("renders markdown headings", async () => {
    render(<MarkdownEditor value="# Heading One" editable={false} />);
    await waitFor(() => {
      expect(screen.getByText("Heading One")).toBeDefined();
    });
  });

  it("applies min-height style when provided", async () => {
    const { container } = render(<MarkdownEditor value="" minHeight={300} editable={true} />);
    await waitFor(() => {
      const editor = container.querySelector(".md-editor") as HTMLElement;
      expect(editor?.style.minHeight).toBe("300px");
    });
  });

  it("does not apply min-height style when not provided", async () => {
    const { container } = render(<MarkdownEditor value="" editable={true} />);
    await waitFor(() => {
      const editor = container.querySelector(".md-editor") as HTMLElement;
      expect(editor?.style.minHeight).toBe("");
    });
  });
});
