import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Habit, HabitFilter, Task } from "@todu/core";
import { Box, Text, useInput, useStdin, useStdout } from "ink";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { Pane } from "../components/Pane.js";
import { ToastLine, type ToastTone } from "../components/ToastLine.js";
import { getVisibleTaskWindow } from "../components/tasks/TaskListPane.js";
import { formatToduClientError, type TuiToduClient } from "../daemon/todu-client.js";
import { createHomeTaskSections, localDateString } from "../state/home-sections.js";
import { formatListWindowIndicator } from "../state/list-window.js";
import { queryKeys } from "../state/query-keys.js";
import { getSelectedItem, moveSelection, resolveSelectedId } from "../state/selection.js";

const availableHabitsFilter = { paused: false } satisfies HabitFilter;
const checkedTodayHabitsFilter = {
  paused: false,
  checkedToday: true,
} satisfies HabitFilter;
const homeSectionOrder = ["now", "next", "waiting", "habits"] as const;

type HomeSection = (typeof homeSectionOrder)[number];

export interface HomeScreenProps {
  client: TuiToduClient;
  dataQueriesEnabled?: boolean;
  today?: string;
}

export function HomeScreen({
  client,
  dataQueriesEnabled = true,
  today = localDateString(),
}: HomeScreenProps): JSX.Element {
  const queryClient = useQueryClient();
  const { stdin } = useStdin();
  const { stdout } = useStdout();
  const [focusedSection, setFocusedSection] = useState<HomeSection>("now");
  const [selectedHabitId, setSelectedHabitId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; tone: ToastTone } | null>(null);
  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks({ status: ["active", "inprogress", "waiting"] }),
    queryFn: () => client.task.list({ status: ["active", "inprogress", "waiting"] }),
    enabled: dataQueriesEnabled,
  });
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
  const taskSections = useMemo(
    () => createHomeTaskSections(tasksQuery.data ?? [], today),
    [tasksQuery.data, today],
  );
  const habits = habitsQuery.data ?? [];
  const checkedTodayIds = useMemo(
    () => new Set((checkedTodayQuery.data ?? []).map((habit) => habit.id)),
    [checkedTodayQuery.data],
  );
  const effectiveSelectedHabitId = resolveSelectedId(habits, selectedHabitId);
  const selectedHabit = getSelectedItem(habits, effectiveSelectedHabitId);
  const maxVisibleItems = resolveMaxVisibleItems(stdout.rows);
  const habitWindow = getVisibleTaskWindow(habits, effectiveSelectedHabitId, maxVisibleItems);
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

  useEffect(() => {
    // Ctrl+J is encoded as a line feed and Ink normalizes it as Enter on non-Kitty terminals.
    const handleControlNavigation = (chunk: string | Buffer): void => {
      const lineFeeds = [...chunk.toString()].filter((character) => character === "\n").length;
      for (let index = 0; index < lineFeeds; index += 1) {
        setFocusedSection((current) => moveHomeSection(current, "next"));
      }
    };

    stdin.on("data", handleControlNavigation);
    return () => {
      stdin.off("data", handleControlNavigation);
    };
  }, [stdin]);

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
    if (key.ctrl && (input === "j" || input === "k")) {
      setFocusedSection((current) => moveHomeSection(current, input === "j" ? "next" : "previous"));
      return;
    }

    if (focusedSection !== "habits" || key.ctrl) {
      return;
    }

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

  const taskError = tasksQuery.error;
  const habitError = habitsQuery.error ?? checkedTodayQuery.error;
  const isLoading = tasksQuery.isLoading || habitsQuery.isLoading || checkedTodayQuery.isLoading;
  const habitsAboveIndicator = formatListWindowIndicator(habitWindow, "above");
  const habitsBelowIndicator = formatListWindowIndicator(habitWindow, "below");

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Pane title={`Home${isLoading ? " • loading…" : ""}`} width="100%" focused>
        {taskError ? (
          <Text color="red">Tasks unavailable: {formatToduClientError(taskError)}</Text>
        ) : (
          <>
            <TaskSummarySection
              title="Now"
              tasks={taskSections.now}
              focused={focusedSection === "now"}
              maxVisibleItems={maxVisibleItems}
            />
            <TaskSummarySection
              title="Next"
              tasks={taskSections.next}
              focused={focusedSection === "next"}
              maxVisibleItems={maxVisibleItems}
            />
            <TaskSummarySection
              title="Waiting"
              tasks={taskSections.waiting}
              focused={focusedSection === "waiting"}
              maxVisibleItems={maxVisibleItems}
            />
          </>
        )}
        <Text color={focusedSection === "habits" ? "cyan" : "white"} bold>
          {focusedSection === "habits" ? "> " : "  "}Habits ({habits.length})
        </Text>
        {focusedSection === "habits" && habitError ? (
          <Text color="red">Habits unavailable: {formatToduClientError(habitError)}</Text>
        ) : null}
        {focusedSection === "habits" && !habitError && habitsQuery.isLoading ? (
          <Text color="gray"> Loading habits…</Text>
        ) : null}
        {focusedSection === "habits" &&
        !habitError &&
        !habitsQuery.isLoading &&
        habits.length === 0 ? (
          <Text color="gray"> No active habits available.</Text>
        ) : null}
        {focusedSection === "habits" &&
        !habitError &&
        !habitsQuery.isLoading &&
        habitsAboveIndicator ? (
          <Text color="gray">{habitsAboveIndicator}</Text>
        ) : null}
        {focusedSection === "habits" && !habitError && !habitsQuery.isLoading
          ? habitWindow.items.map((habit) => {
              const selected = habit.id === effectiveSelectedHabitId;
              const habitFocused = focusedSection === "habits";
              const completed = checkedTodayIds.has(habit.id);
              return (
                <Text
                  key={habit.id}
                  color={selected && habitFocused ? "cyan" : undefined}
                  inverse={selected && habitFocused}
                  wrap="truncate-end"
                >
                  {selected && habitFocused ? ">" : " "} [{completed ? "x" : " "}] {habit.title}
                </Text>
              );
            })
          : null}
        {focusedSection === "habits" &&
        !habitError &&
        !habitsQuery.isLoading &&
        habitsBelowIndicator ? (
          <Text color="gray">{habitsBelowIndicator}</Text>
        ) : null}
      </Pane>
      <ToastLine message={feedback?.message ?? null} tone={feedback?.tone ?? "info"} />
    </Box>
  );
}

function TaskSummarySection({
  title,
  tasks,
  focused,
  maxVisibleItems,
}: {
  title: string;
  tasks: readonly Task[];
  focused: boolean;
  maxVisibleItems: number;
}): JSX.Element {
  return (
    <>
      <Text color={focused ? "cyan" : "white"} bold>
        {focused ? "> " : "  "}
        {title} ({tasks.length})
      </Text>
      {focused && tasks.length === 0 ? <Text color="gray"> No tasks.</Text> : null}
      {focused &&
        tasks.slice(0, maxVisibleItems).map((task) => (
          <Text key={task.id} wrap="truncate-end">
            {"  • "}
            {task.title}
          </Text>
        ))}
      {focused && tasks.length > maxVisibleItems ? (
        <Text color="gray"> … {tasks.length - maxVisibleItems} more</Text>
      ) : null}
    </>
  );
}

export function moveHomeSection(current: HomeSection, direction: "next" | "previous"): HomeSection {
  const currentIndex = homeSectionOrder.indexOf(current);
  const delta = direction === "next" ? 1 : -1;
  const nextIndex = Math.max(0, Math.min(homeSectionOrder.length - 1, currentIndex + delta));
  return homeSectionOrder[nextIndex] ?? current;
}

function resolveMaxVisibleItems(rows: number | undefined): number {
  const terminalRows = rows && rows > 0 ? rows : 24;
  return Math.max(1, terminalRows - 14);
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
