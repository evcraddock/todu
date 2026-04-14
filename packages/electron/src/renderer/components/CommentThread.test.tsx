/**
 * @vitest-environment jsdom
 */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { Note } from "@todu/core/browser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as hooks from "../hooks/useTodu.js";
import { CommentThread } from "./CommentThread.js";

vi.mock("../hooks/useTodu.js", () => ({
  useActors: vi.fn(),
  useCreateNote: vi.fn(),
  useDeleteNote: vi.fn(),
  useNotes: vi.fn(),
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
    ...overrides,
  };
}

const createNoteMutate = vi.fn();
const deleteNoteMutate = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();

  vi.mocked(hooks.useActors).mockReturnValue({
    data: [{ id: "actor-reviewer", displayName: "Reviewer" }],
  } as ReturnType<typeof hooks.useActors>);

  vi.mocked(hooks.useNotes).mockReturnValue({
    data: [makeNote()],
    isLoading: false,
  } as ReturnType<typeof hooks.useNotes>);

  vi.mocked(hooks.useCreateNote).mockReturnValue({
    mutate: createNoteMutate,
    isPending: false,
  } as ReturnType<typeof hooks.useCreateNote>);

  vi.mocked(hooks.useDeleteNote).mockReturnValue({
    mutate: deleteNoteMutate,
  } as ReturnType<typeof hooks.useDeleteNote>);
});

afterEach(() => {
  cleanup();
});

describe("CommentThread", () => {
  it("renders actor-based authors and approval badges", () => {
    render(<CommentThread entityType="task" entityId="task-1" />);

    expect(screen.getByText("Reviewer")).toBeDefined();
    expect(screen.getByText("Approved import")).toBeDefined();
    expect(screen.getByText("Imported comment")).toBeDefined();
  });

  it("creates comments without legacy author strings", async () => {
    render(<CommentThread entityType="task" entityId="task-1" />);

    fireEvent.change(screen.getByPlaceholderText("Add a comment…"), {
      target: { value: "New comment" },
    });
    fireEvent.click(screen.getByText("Comment"));

    await waitFor(() => {
      expect(createNoteMutate).toHaveBeenCalledWith(
        { content: "New comment", entityType: "task", entityId: "task-1" },
        { onSuccess: expect.any(Function) },
      );
    });
  });
});
