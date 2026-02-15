import type { HabitFilter } from "@todu/core/browser";
import { type ReactNode, useState } from "react";
import { CreateHabitDialog } from "./CreateHabitDialog.js";
import { HabitDetail } from "./HabitDetail.js";
import { HabitList } from "./HabitList.js";

type HabitsViewState = { view: "list" } | { view: "detail"; habitId: string } | { view: "create" };

export function HabitsView({
  externalFilter,
}: {
  externalFilter?: HabitFilter | null;
}): ReactNode {
  const [state, setState] = useState<HabitsViewState>({ view: "list" });

  switch (state.view) {
    case "list":
      return (
        <HabitList
          onSelectHabit={(id) => setState({ view: "detail", habitId: id })}
          onCreateHabit={() => setState({ view: "create" })}
          externalFilter={externalFilter}
        />
      );

    case "detail":
      return <HabitDetail habitId={state.habitId} onBack={() => setState({ view: "list" })} />;

    case "create":
      return (
        <>
          <HabitList
            onSelectHabit={(id) => setState({ view: "detail", habitId: id })}
            onCreateHabit={() => setState({ view: "create" })}
            externalFilter={externalFilter}
          />
          <CreateHabitDialog onClose={() => setState({ view: "list" })} />
        </>
      );
  }
}
