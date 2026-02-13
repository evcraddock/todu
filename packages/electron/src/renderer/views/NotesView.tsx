import { type ReactNode, useState } from "react";
import { CreateNoteDialog } from "./CreateNoteDialog.js";
import { NoteList } from "./NoteList.js";

type NotesViewState = { view: "list" } | { view: "create" };

export function NotesView({
  onNavigateToEntity,
}: {
  onNavigateToEntity: (entityType: string, entityId: string) => void;
}): ReactNode {
  const [state, setState] = useState<NotesViewState>({ view: "list" });

  switch (state.view) {
    case "list":
      return (
        <NoteList
          onCreateNote={() => setState({ view: "create" })}
          onNavigateToEntity={onNavigateToEntity}
        />
      );

    case "create":
      return (
        <>
          <NoteList
            onCreateNote={() => setState({ view: "create" })}
            onNavigateToEntity={onNavigateToEntity}
          />
          <CreateNoteDialog onClose={() => setState({ view: "list" })} />
        </>
      );
  }
}
