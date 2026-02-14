import type { Note } from "@todu/core/browser";
import { type ReactNode, useState } from "react";
import { JournalEditor } from "./JournalEditor.js";
import { JournalList } from "./JournalList.js";

type JournalViewState = { view: "list" } | { view: "create" } | { view: "edit"; note: Note };

export function JournalView(): ReactNode {
  const [state, setState] = useState<JournalViewState>({ view: "list" });

  switch (state.view) {
    case "list":
      return (
        <JournalList
          onCreateEntry={() => setState({ view: "create" })}
          onEditEntry={(note) => setState({ view: "edit", note })}
        />
      );

    case "create":
      return <JournalEditor onClose={() => setState({ view: "list" })} />;

    case "edit":
      return <JournalEditor note={state.note} onClose={() => setState({ view: "list" })} />;
  }
}
