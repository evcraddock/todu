/**
 * @vitest-environment jsdom
 */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Note } from "@todu/core/browser";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as hooks from "../hooks/useTodu.js";
import { CommentThread } from "./CommentThread.js";

vi.mock("../hooks/useTodu.js", () => ({
  useActors: vi.fn(),
  useApproveNoteContent: vi.fn(),
  useCreateNote: vi.fn(),
  useDeleteNote: vi.fn(),
  useNotes: vi.fn(),
  useUpdateNote: vi.fn(),
}));

function makeNote(overrides: Partial<Note> = {}): Note {
  return {
    id: "note-1" as Note["id"],
    content: "Imported comment",
    author: "legacy-reviewer",
    authorActorId: "actor-reviewer" as NonNullable<Note["authorActorId"]>,
    contentApproval: { state: "approved" },
    entityType: "task",
    entityId: "task-1",
    tags: [],
    createdAt: "2026-03-14T15:00:00.000Z",
    updatedAt: "2026-03-14T15:00:00.000Z",
    ...overrides,
  };
}

const approveNoteContentMutate = vi.fn();
const createNoteMutate = vi.fn();
const deleteNoteMutate = vi.fn();
const updateNoteMutate = vi.fn();

const rangeRects = Object.getOwnPropertyDescriptor(Range.prototype, "getClientRects");
const rangeBounds = Object.getOwnPropertyDescriptor(Range.prototype, "getBoundingClientRect");

beforeAll(() => {
  Object.defineProperties(Range.prototype, {
    getClientRects: { configurable: true, value: () => [] },
    getBoundingClientRect: { configurable: true, value: () => new DOMRect() },
  });
});

afterAll(() => {
  for (const [name, descriptor] of [
    ["getClientRects", rangeRects],
    ["getBoundingClientRect", rangeBounds],
  ] as const) {
    if (descriptor) Object.defineProperty(Range.prototype, name, descriptor);
    else Reflect.deleteProperty(Range.prototype, name);
  }
});

beforeEach(() => {
  vi.resetAllMocks();

  vi.mocked(hooks.useActors).mockReturnValue({
    data: [{ id: "actor-reviewer", displayName: "Reviewer" }],
  } as ReturnType<typeof hooks.useActors>);

  vi.mocked(hooks.useNotes).mockReturnValue({
    data: [makeNote()],
    isLoading: false,
  } as ReturnType<typeof hooks.useNotes>);

  vi.mocked(hooks.useApproveNoteContent).mockReturnValue({
    mutate: approveNoteContentMutate,
    isPending: false,
  } as ReturnType<typeof hooks.useApproveNoteContent>);

  vi.mocked(hooks.useCreateNote).mockReturnValue({
    mutate: createNoteMutate,
    isPending: false,
  } as ReturnType<typeof hooks.useCreateNote>);

  vi.mocked(hooks.useUpdateNote).mockReturnValue({
    mutate: updateNoteMutate,
    isPending: false,
  } as unknown as ReturnType<typeof hooks.useUpdateNote>);

  vi.mocked(hooks.useDeleteNote).mockReturnValue({
    mutate: deleteNoteMutate,
  } as ReturnType<typeof hooks.useDeleteNote>);
});

afterEach(() => {
  cleanup();
});

describe("CommentThread", () => {
  it("renders comment Markdown as read-only formatted content", async () => {
    vi.mocked(hooks.useNotes).mockReturnValue({
      data: [
        makeNote({ content: "### Preview update\n\n**Ready** to inspect:\n\n- Run `make dev`" }),
      ],
      isLoading: false,
    } as ReturnType<typeof hooks.useNotes>);

    const { container } = render(<CommentThread entityType="task" entityId="task-1" />);

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "Preview update", level: 3 })).toBeDefined();
    });
    expect(screen.getByText("Ready").tagName).toBe("STRONG");
    expect(screen.getByRole("listitem").textContent).toBe("Run make dev");
    expect(screen.getByText("make dev").tagName).toBe("CODE");
    expect(container.querySelector('.comment-body [contenteditable="true"]')).toBeNull();
    expect(container.querySelector(".comment-body .md-editor-toolbar")).toBeNull();
  });

  it("renders actor-based authors and approval badges", () => {
    render(<CommentThread entityType="task" entityId="task-1" />);

    expect(screen.getByText("Reviewer")).toBeDefined();
    expect(screen.getByText("Approved import")).toBeDefined();
    expect(screen.getByText("Imported comment")).toBeDefined();
  });

  it("shows explicit approve actions for pending imported comments", async () => {
    vi.mocked(hooks.useNotes).mockReturnValue({
      data: [makeNote({ contentApproval: { state: "pendingApproval" } })],
      isLoading: false,
    } as ReturnType<typeof hooks.useNotes>);

    render(<CommentThread entityType="task" entityId="task-1" />);

    fireEvent.click(screen.getByText("Approve"));

    await waitFor(() => {
      expect(approveNoteContentMutate).toHaveBeenCalledWith(
        "note-1",
        expect.objectContaining({
          onSuccess: expect.any(Function),
          onError: expect.any(Function),
        }),
      );
    });
  });

  it("edits existing comments as Markdown and closes after a successful save", async () => {
    vi.mocked(hooks.useNotes).mockReturnValue({
      data: [makeNote({ content: "**Imported** comment" })],
      isLoading: false,
    } as ReturnType<typeof hooks.useNotes>);
    updateNoteMutate.mockImplementation((_input, options) => options.onSuccess());
    const { container } = render(<CommentThread entityType="task" entityId="task-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    const editor = container.querySelector('.comment-edit [contenteditable="true"]') as HTMLElement;
    await waitFor(() => expect(document.activeElement).toBe(editor));
    expect(editor.textContent).toBe("Imported comment");
    await act(async () => {
      const bold = editor.querySelector("strong");
      expect(bold).not.toBeNull();
      if (bold) bold.textContent = "Updated";
      fireEvent.input(editor);
    });
    fireEvent.click(screen.getByRole("button", { name: "Save comment" }));
    await waitFor(() =>
      expect(updateNoteMutate).toHaveBeenCalledWith(
        { id: "note-1", input: { content: "**Updated** comment" } },
        expect.objectContaining({ onSuccess: expect.any(Function), onError: expect.any(Function) }),
      ),
    );
    expect(screen.queryByRole("group", { name: "Edit comment" })).toBeNull();
  });

  it("cancels editing without changing the comment", () => {
    render(<CommentThread entityType="task" entityId="task-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(updateNoteMutate).not.toHaveBeenCalled();
    expect(screen.getByText("Imported comment")).toBeDefined();
    expect(screen.queryByRole("group", { name: "Edit comment" })).toBeNull();
  });

  it("keeps the draft open and displays an error when saving fails", () => {
    updateNoteMutate.mockImplementation((_input, options) =>
      options.onError(new Error("Save failed")),
    );
    render(<CommentThread entityType="task" entityId="task-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Save comment" }));
    expect(screen.getByRole("alert").textContent).toBe("Save failed");
    expect(screen.getByRole("group", { name: "Edit comment" })).toBeDefined();
  });

  it("clears the composer after saving while it switches out of its pending state", async () => {
    const props = { entityType: "task", entityId: "task-1" };
    const { container, rerender } = render(<CommentThread {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    const editor = container.querySelector(
      '.comment-input [contenteditable="true"]',
    ) as HTMLElement;
    await act(async () => {
      editor.innerHTML = "<p><strong>Latest</strong> comment</p>";
      fireEvent.input(editor);
    });
    await waitFor(() =>
      expect((screen.getByText("Comment") as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByText("Comment"));
    const onSuccess = createNoteMutate.mock.calls[0][1].onSuccess;
    vi.mocked(hooks.useCreateNote).mockReturnValue({
      mutate: createNoteMutate,
      isPending: true,
    } as ReturnType<typeof hooks.useCreateNote>);
    rerender(<CommentThread {...props} />);
    vi.mocked(hooks.useCreateNote).mockReturnValue({
      mutate: createNoteMutate,
      isPending: false,
    } as ReturnType<typeof hooks.useCreateNote>);
    await act(async () => {
      onSuccess();
      rerender(<CommentThread {...props} />);
    });
    await waitFor(() => {
      expect(screen.queryByRole("group", { name: "New comment" })).toBeNull();
      expect(screen.getByRole("button", { name: "Add Comment" })).toBeDefined();
    });
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    await waitFor(() => {
      const composer = container.querySelector('.comment-input [contenteditable="true"]');
      expect(composer?.textContent).toBe("");
      expect((screen.getByText("Comment") as HTMLButtonElement).disabled).toBe(true);
    });
  });

  it("opens the composer on demand and closes it with Cancel", () => {
    render(<CommentThread entityType="task" entityId="task-1" />);
    expect(screen.queryByRole("group", { name: "New comment" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    expect(screen.getByRole("group", { name: "New comment" })).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group", { name: "New comment" })).toBeNull();
    expect(createNoteMutate).not.toHaveBeenCalled();
  });

  it("creates comments without legacy author strings", async () => {
    const { container } = render(<CommentThread entityType="task" entityId="task-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Add Comment" }));
    const editor = container.querySelector(
      '.comment-input [contenteditable="true"]',
    ) as HTMLElement;
    editor.innerHTML = "<p><strong>New</strong> comment</p>";
    fireEvent.input(editor);
    await waitFor(() =>
      expect((screen.getByText("Comment") as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(screen.getByText("Comment"));

    await waitFor(() => {
      expect(createNoteMutate).toHaveBeenCalledWith(
        { content: "**New** comment", entityType: "task", entityId: "task-1" },
        { onSuccess: expect.any(Function) },
      );
    });
  });
});
