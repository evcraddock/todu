import type { Note } from "@todu/core/browser";
import { type ReactNode, useState } from "react";
import { JournalDetail } from "./JournalDetail.js";
import { JournalEditor } from "./JournalEditor.js";
import { JournalList } from "./JournalList.js";

type JournalViewState =
  | { view: "list" }
  | { view: "detail"; note: Note }
  | { view: "create" }
  | { view: "edit"; note: Note };

export function JournalView(): ReactNode {
  const [state, setState] = useState<JournalViewState>({ view: "list" });

  switch (state.view) {
    case "list":
      return (
        <JournalList
          onCreateEntry={() => setState({ view: "create" })}
          onViewEntry={(note) => setState({ view: "detail", note })}
        />
      );

    case "detail":
      return (
        <JournalDetail
          note={state.note}
          onBack={() => setState({ view: "list" })}
          onEdit={(note) => setState({ view: "edit", note })}
        />
      );

    case "create":
      return <JournalEditor onClose={() => setState({ view: "list" })} />;

    case "edit":
      return <JournalEditor note={state.note} onClose={() => setState({ view: "list" })} />;
  }
}
