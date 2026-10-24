import type { HabitFilter } from "@todu/core/browser";
import { type ReactNode, useEffect, useState } from "react";
import { CreateHabitDialog } from "./CreateHabitDialog.js";
import { HabitDetail } from "./HabitDetail.js";
import { HabitList } from "./HabitList.js";

type HabitsViewState =
  | { view: "list" }
  | { view: "detail"; habitId: string; returnToHome?: boolean }
  | { view: "create" };

export function HabitsView({
  externalFilter,
  focusHabitId,
  onFocusConsumed,
  returnToHome,
  onNavigateHome,
}: {
  externalFilter?: HabitFilter | null;
  focusHabitId?: string | null;
  onFocusConsumed?: () => void;
  returnToHome?: boolean;
  onNavigateHome?: () => void;
}): ReactNode {
  const [state, setState] = useState<HabitsViewState>(
    focusHabitId ? { view: "detail", habitId: focusHabitId, returnToHome } : { view: "list" },
  );
  useEffect(() => {
    if (focusHabitId) {
      setState({ view: "detail", habitId: focusHabitId, returnToHome });
      onFocusConsumed?.();
    }
  }, [focusHabitId, onFocusConsumed, returnToHome]);

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
      return (
        <HabitDetail
          habitId={state.habitId}
          backLabel={state.returnToHome && onNavigateHome ? "Overview" : "Habits"}
          onBack={() => {
            if (state.returnToHome && onNavigateHome) onNavigateHome();
            else setState({ view: "list" });
          }}
        />
      );

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
