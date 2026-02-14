import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { type ReactNode, useCallback, useEffect, useRef } from "react";
import { Markdown } from "tiptap-markdown";

// ============================================================================
// Types
// ============================================================================

export interface MarkdownEditorProps {
  /** Markdown string to display/edit */
  value: string;
  /** Called with updated markdown when content changes */
  onChange?: (markdown: string) => void;
  /** Placeholder text when editor is empty */
  placeholder?: string;
  /** Minimum height in pixels */
  minHeight?: number;
  /** Auto-focus the editor on mount */
  autoFocus?: boolean;
  /** Whether the editor is editable (false = read-only rendering) */
  editable?: boolean;
  /** Called when the editor loses focus */
  onBlur?: () => void;
}

// ============================================================================
// Toolbar
// ============================================================================

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }): ReactNode {
  if (!editor) return null;

  const items: { label: string; action: () => void; isActive?: () => boolean }[] = [
    {
      label: "B",
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: () => editor.isActive("bold"),
    },
    {
      label: "I",
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: () => editor.isActive("italic"),
    },
    {
      label: "S",
      action: () => editor.chain().focus().toggleStrike().run(),
      isActive: () => editor.isActive("strike"),
    },
    {
      label: "H1",
      action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
      isActive: () => editor.isActive("heading", { level: 1 }),
    },
    {
      label: "H2",
      action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
      isActive: () => editor.isActive("heading", { level: 2 }),
    },
    {
      label: "H3",
      action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
      isActive: () => editor.isActive("heading", { level: 3 }),
    },
    {
      label: "•",
      action: () => editor.chain().focus().toggleBulletList().run(),
      isActive: () => editor.isActive("bulletList"),
    },
    {
      label: "1.",
      action: () => editor.chain().focus().toggleOrderedList().run(),
      isActive: () => editor.isActive("orderedList"),
    },
    {
      label: "</>",
      action: () => editor.chain().focus().toggleCodeBlock().run(),
      isActive: () => editor.isActive("codeBlock"),
    },
    {
      label: "🔗",
      action: () => {
        if (editor.isActive("link")) {
          editor.chain().focus().unsetLink().run();
          return;
        }
        const url = window.prompt("URL:");
        if (url) {
          editor.chain().focus().setLink({ href: url }).run();
        }
      },
      isActive: () => editor.isActive("link"),
    },
    {
      label: "—",
      action: () => editor.chain().focus().setHorizontalRule().run(),
    },
  ];

  return (
    <div className="md-editor-toolbar">
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          className={`md-toolbar-btn ${item.isActive?.() ? "md-toolbar-btn-active" : ""}`}
          onMouseDown={(e) => {
            e.preventDefault();
            item.action();
          }}
          title={item.label}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

// ============================================================================
// MarkdownEditor
// ============================================================================

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  minHeight,
  autoFocus = false,
  editable = true,
  onBlur,
}: MarkdownEditorProps): ReactNode {
  // Track whether we're currently updating from props to avoid echo loops
  const isUpdatingRef = useRef(false);
  // Track the last value we set from props to avoid unnecessary updates
  const lastPropValueRef = useRef(value);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
      }),
      Link.configure({
        openOnClick: !editable,
        HTMLAttributes: {
          class: "md-link",
          rel: "noopener noreferrer",
          target: "_blank",
        },
      }),
      Placeholder.configure({
        placeholder: placeholder ?? "",
      }),
      Markdown.configure({
        transformPastedText: true,
        transformCopiedText: true,
      }),
    ],
    content: value,
    editable,
    autofocus: autoFocus,
    onUpdate: ({ editor: ed }) => {
      if (isUpdatingRef.current) return;
      const md = ed.storage.markdown.getMarkdown() as string;
      onChange?.(md);
    },
    onBlur: () => {
      onBlur?.();
    },
  });

  // Sync editable prop
  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable);
    }
  }, [editor, editable]);

  // Sync value from props (external updates)
  useEffect(() => {
    if (!editor) return;
    if (value === lastPropValueRef.current) return;
    lastPropValueRef.current = value;

    const currentMd = editor.storage.markdown.getMarkdown() as string;
    if (currentMd === value) return;

    isUpdatingRef.current = true;
    editor.commands.setContent(value);
    isUpdatingRef.current = false;
  }, [editor, value]);

  // Cleanup
  const handleClick = useCallback(() => {
    if (editable && editor && !editor.isFocused) {
      editor.commands.focus();
    }
  }, [editor, editable]);

  return (
    <div
      className={`md-editor ${editable ? "md-editor-editable" : "md-editor-readonly"}`}
      style={minHeight ? { minHeight: `${minHeight}px` } : undefined}
      onClick={handleClick}
      onKeyDown={(e) => {
        // Focus editor on Enter/Space when the container is focused (a11y)
        if ((e.key === "Enter" || e.key === " ") && editable && editor && !editor.isFocused) {
          e.preventDefault();
          editor.commands.focus();
        }
      }}
    >
      {editable && <Toolbar editor={editor} />}
      <EditorContent editor={editor} className="md-editor-content" />
    </div>
  );
}
