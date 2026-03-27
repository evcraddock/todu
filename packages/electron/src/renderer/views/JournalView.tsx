import type { Note } from "@todu/core/browser";
import { type ReactNode, useEffect, useState } from "react";
import { resolveSystemTimezone } from "../lib/journal-time.js";
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
  const [timezone, setTimezone] = useState<string | null>(null);

  useEffect(() => {
    window.todu.settings
      .get()
      .then((settings) => setTimezone(settings.timezone))
      .catch(() => setTimezone(resolveSystemTimezone()));
  }, []);

  if (!timezone) {
    return <div className="loading-state">Loading journal…</div>;
  }

  switch (state.view) {
    case "list":
      return (
        <JournalList
          timezone={timezone}
          onCreateEntry={() => setState({ view: "create" })}
          onViewEntry={(note) => setState({ view: "detail", note })}
        />
      );

    case "detail":
      return (
        <JournalDetail
          note={state.note}
          timezone={timezone}
          onBack={() => setState({ view: "list" })}
          onEdit={(note) => setState({ view: "edit", note })}
        />
      );

    case "create":
      return <JournalEditor timezone={timezone} onClose={() => setState({ view: "list" })} />;

    case "edit":
      return (
        <JournalEditor
          note={state.note}
          timezone={timezone}
          onClose={() => setState({ view: "list" })}
        />
      );
  }
}
