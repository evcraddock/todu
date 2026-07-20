import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Habit, HabitFilter } from "@todu/core";
import { Box, Text, useInput, useStdout } from "ink";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { Pane } from "../components/Pane.js";
import { ToastLine, type ToastTone } from "../components/ToastLine.js";
import { getVisibleTaskWindow } from "../components/tasks/TaskListPane.js";
import { formatToduClientError, type TuiToduClient } from "../daemon/todu-client.js";
import { formatListWindowIndicator } from "../state/list-window.js";
import { queryKeys } from "../state/query-keys.js";
import { getSelectedItem, moveSelection, resolveSelectedId } from "../state/selection.js";

const availableHabitsFilter = { paused: false } satisfies HabitFilter;
const checkedTodayHabitsFilter = {
  paused: false,
  checkedToday: true,
} satisfies HabitFilter;
const MIN_VISIBLE_HABITS = 1;

export interface HabitsScreenProps {
  client: TuiToduClient;
  dataQueriesEnabled?: boolean;
}

export function HabitsScreen({
  client,
  dataQueriesEnabled = true,
}: HabitsScreenProps): JSX.Element {
  const queryClient = useQueryClient();
  const { stdout } = useStdout();
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; tone: ToastTone } | null>(null);
  const habitsQuery = useQuery({
    queryKey: queryKeys.habits(availableHabitsFilter),
    queryFn: () => client.habit.list(availableHabitsFilter),
    enabled: dataQueriesEnabled,
  });
  const checkedTodayQuery = useQuery({
    queryKey: queryKeys.habits(checkedTodayHabitsFilter),
    queryFn: () => client.habit.list(checkedTodayHabitsFilter),
    enabled: dataQueriesEnabled,
  });
  const habits = habitsQuery.data ?? [];
  const checkedTodayIds = useMemo(
    () => new Set((checkedTodayQuery.data ?? []).map((habit) => habit.id)),
    [checkedTodayQuery.data],
  );
  const effectiveSelectedHabitId = resolveSelectedId(habits, selectedHabitId);
  const selectedHabit = getSelectedItem(habits, effectiveSelectedHabitId);
  const maxVisibleHabits = resolveMaxVisibleHabits(stdout.rows);
  const habitWindow = getVisibleTaskWindow(habits, effectiveSelectedHabitId, maxVisibleHabits);
  const toggleMutation = useMutation({
    mutationFn: ({ habit, completed }: { habit: Habit; completed: boolean }) =>
      completed ? client.habit.uncheck(habit.id) : client.habit.check(habit.id),
  });

  useEffect(() => {
    if (!habitsQuery.data) {
      return;
    }

    setSelectedHabitId((current) => resolveSelectedId(habitsQuery.data ?? [], current));
  }, [habitsQuery.data]);

  const toggleHabit = async (habit: Habit): Promise<void> => {
    if (!dataQueriesEnabled) {
      setFeedback({
        message: "Habit actions unavailable while daemon is disconnected.",
        tone: "error",
      });
      return;
    }

    const wasCompleted = checkedTodayIds.has(habit.id);
    try {
      const entry = await toggleMutation.mutateAsync({ habit, completed: wasCompleted });
      queryClient.setQueryData<Habit[]>(
        queryKeys.habits(checkedTodayHabitsFilter),
        (current = []) => updateCheckedTodayHabits(current, habit, entry.completed),
      );
      setFeedback({
        message: `Habit ${entry.completed ? "checked" : "unchecked"}: ${habit.title}`,
        tone: "success",
      });
      await queryClient.invalidateQueries({ queryKey: ["habits"] });
    } catch (error) {
      setFeedback({ message: formatToduClientError(error), tone: "error" });
    }
  };

  useInput((input, key) => {
    if (input === "j" || key.downArrow) {
      setSelectedHabitId((current) => moveSelection(habits, current, "next"));
      return;
    }

    if (input === "k" || key.upArrow) {
      setSelectedHabitId((current) => moveSelection(habits, current, "previous"));
      return;
    }

    if (
      (key.return || input === "\r" || input === " ") &&
      selectedHabit &&
      !toggleMutation.isPending
    ) {
      void toggleHabit(selectedHabit);
    }
  });

  const error = habitsQuery.error ?? checkedTodayQuery.error;
  const isLoading = habitsQuery.isLoading || checkedTodayQuery.isLoading;
  const title = isLoading ? "Habits • loading…" : `Habits (${habits.length})`;
  const aboveIndicator = formatListWindowIndicator(habitWindow, "above");
  const belowIndicator = formatListWindowIndicator(habitWindow, "below");

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Pane title={title} width="100%" focused>
        {error ? (
          <Box flexDirection="column">
            <Text color="red">Habits unavailable</Text>
            <Text color="gray">{formatToduClientError(error)}</Text>
          </Box>
        ) : null}
        {!error && isLoading ? <Text color="gray">Loading habits…</Text> : null}
        {!error && !isLoading && habits.length === 0 ? (
          <Text color="gray">No active habits available.</Text>
        ) : null}
        {!error && !isLoading && aboveIndicator ? <Text color="gray">{aboveIndicator}</Text> : null}
        {!error && !isLoading
          ? habitWindow.items.map((habit) => {
              const selected = habit.id === effectiveSelectedHabitId;
              const completed = checkedTodayIds.has(habit.id);
              return (
                <Text
                  key={habit.id}
                  color={selected ? "cyan" : undefined}
                  inverse={selected}
                  wrap="truncate-end"
                >
                  {selected ? ">" : " "} [{completed ? "x" : " "}] {habit.title}
                </Text>
              );
            })
          : null}
        {!error && !isLoading && belowIndicator ? <Text color="gray">{belowIndicator}</Text> : null}
      </Pane>
      <ToastLine message={feedback?.message ?? null} tone={feedback?.tone ?? "info"} />
    </Box>
  );
}

export function updateCheckedTodayHabits(
  current: readonly Habit[],
  habit: Habit,
  completed: boolean,
): Habit[] {
  if (!completed) {
    return current.filter((entry) => entry.id !== habit.id);
  }

  return current.some((entry) => entry.id === habit.id) ? [...current] : [...current, habit];
}

function resolveMaxVisibleHabits(rows: number | undefined): number {
  const terminalRows = rows && rows > 0 ? rows : 24;
  return Math.max(MIN_VISIBLE_HABITS, terminalRows - 11);
}
