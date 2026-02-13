import { type ReactNode, useState } from "react";
import { CreateRecurringDialog } from "./CreateRecurringDialog.js";
import { RecurringDetail } from "./RecurringDetail.js";
import { RecurringList } from "./RecurringList.js";

type RecurringViewState =
  | { view: "list" }
  | { view: "detail"; templateId: string }
  | { view: "create" };

export function RecurringView(): ReactNode {
  const [state, setState] = useState<RecurringViewState>({ view: "list" });

  switch (state.view) {
    case "list":
      return (
        <RecurringList
          onSelectTemplate={(id) => setState({ view: "detail", templateId: id })}
          onCreateTemplate={() => setState({ view: "create" })}
        />
      );

    case "detail":
      return (
        <RecurringDetail templateId={state.templateId} onBack={() => setState({ view: "list" })} />
      );

    case "create":
      return (
        <>
          <RecurringList
            onSelectTemplate={(id) => setState({ view: "detail", templateId: id })}
            onCreateTemplate={() => setState({ view: "create" })}
          />
          <CreateRecurringDialog onClose={() => setState({ view: "list" })} />
        </>
      );
  }
}
