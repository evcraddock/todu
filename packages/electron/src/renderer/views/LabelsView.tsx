import { type ReactNode, useState } from "react";
import { LabelDialog } from "./LabelDialog.js";
import { LabelList } from "./LabelList.js";

type LabelViewState = { view: "list" } | { view: "create" } | { view: "edit"; labelId: string };

export function LabelsView(): ReactNode {
  const [state, setState] = useState<LabelViewState>({ view: "list" });

  switch (state.view) {
    case "list":
      return (
        <LabelList
          onCreateLabel={() => setState({ view: "create" })}
          onEditLabel={(id) => setState({ view: "edit", labelId: id })}
        />
      );

    case "create":
      return (
        <>
          <LabelList
            onCreateLabel={() => setState({ view: "create" })}
            onEditLabel={(id) => setState({ view: "edit", labelId: id })}
          />
          <LabelDialog onClose={() => setState({ view: "list" })} />
        </>
      );

    case "edit":
      return (
        <>
          <LabelList
            onCreateLabel={() => setState({ view: "create" })}
            onEditLabel={(id) => setState({ view: "edit", labelId: id })}
          />
          <LabelDialog editLabelId={state.labelId} onClose={() => setState({ view: "list" })} />
        </>
      );
  }
}
