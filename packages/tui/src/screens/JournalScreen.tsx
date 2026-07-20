import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Note, NoteFilter } from "@todu/core";
import { Box, Text, useApp, useInput, useStdout } from "ink";
import type { JSX } from "react";
import { useEffect, useMemo, useState } from "react";
import { Pane } from "../components/Pane.js";
import { ToastLine, type ToastTone } from "../components/ToastLine.js";
import { getVisibleTaskWindow } from "../components/tasks/TaskListPane.js";
import { formatToduClientError, type TuiToduClient } from "../daemon/todu-client.js";
import { composeJournalEntry, normalizeCommentContent } from "../state/comment-actions.js";
import { createJournalWeek, moveJournalWeek } from "../state/journal-week.js";
import { formatListWindowIndicator } from "../state/list-window.js";
import { queryKeys } from "../state/query-keys.js";
import { getSelectedItem, moveSelection, resolveSelectedId } from "../state/selection.js";

const MIN_VISIBLE_ENTRIES = 1;

export interface JournalScreenProps {
  client: TuiToduClient;
  dataQueriesEnabled?: boolean;
  onGlobalInputEnabledChange?: (enabled: boolean) => void;
  composeEntry?: (initialContent: string) => string | null;
  initialDate?: Date;
  timezone?: string;
}

interface SaveEntryInput {
  entry: Note | null;
  content: string;
}

export function JournalScreen({
  client,
  dataQueriesEnabled = true,
  onGlobalInputEnabledChange,
  composeEntry = defaultComposeEntry,
  initialDate,
  timezone = resolveLocalTimezone(),
}: JournalScreenProps): JSX.Element {
  const queryClient = useQueryClient();
  const { suspendTerminal } = useApp();
  const { stdout } = useStdout();
  const [selectedDate, setSelectedDate] = useState(() => initialDate ?? new Date());
  const [selectedEntryId, setSelectedEntryId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ message: string; tone: ToastTone } | null>(null);
  const week = useMemo(() => createJournalWeek(selectedDate), [selectedDate]);
  const filter = useMemo<NoteFilter>(
    () => ({
      journal: true,
      createdFrom: week.startDate,
      createdTo: week.endDate,
      timezone,
    }),
    [timezone, week.endDate, week.startDate],
  );
  const entriesQuery = useQuery({
    queryKey: queryKeys.notes(filter),
    queryFn: () => client.note.list(filter),
    enabled: dataQueriesEnabled,
  });
  const entries = useMemo(
    () =>
      [...(entriesQuery.data ?? [])].sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt),
      ),
    [entriesQuery.data],
  );
  const effectiveSelectedEntryId = resolveSelectedId(entries, selectedEntryId);
  const selectedEntry = getSelectedItem(entries, effectiveSelectedEntryId);
  const entryWindow = getVisibleTaskWindow(
    entries,
    effectiveSelectedEntryId,
    resolveMaxVisibleEntries(stdout.rows),
  );
  const saveMutation = useMutation({
    mutationFn: ({ entry, content }: SaveEntryInput) =>
      entry ? client.note.update(entry.id, { content }) : client.note.create({ content }),
  });

  useEffect(() => {
    if (!entriesQuery.data) return;
    setSelectedEntryId((current) => resolveSelectedId(entries, current));
  }, [entries, entriesQuery.data]);

  const openEntryEditor = async (entry: Note | null): Promise<void> => {
    if (!dataQueriesEnabled) {
      setFeedback({
        message: "Journal actions unavailable while daemon is disconnected.",
        tone: "error",
      });
      return;
    }

    onGlobalInputEnabledChange?.(false);
    try {
      let composedContent: string | null = null;
      await suspendTerminal(() => {
        composedContent = composeEntry(entry?.content ?? "");
      });
      const content = normalizeCommentContent(composedContent ?? "");
      if (!content) {
        setFeedback({ message: "Cancelled journal entry.", tone: "info" });
        return;
      }

      const savedEntry = await saveMutation.mutateAsync({ entry, content });
      queryClient.setQueryData<Note[]>(queryKeys.notes(filter), (current = []) =>
        entry
          ? current.map((currentEntry) =>
              currentEntry.id === savedEntry.id ? savedEntry : currentEntry,
            )
          : [...current, savedEntry],
      );
      setSelectedEntryId(savedEntry.id);
      setFeedback({
        message: entry ? "Journal entry updated." : "Journal entry added.",
        tone: "success",
      });
      await queryClient.invalidateQueries({ queryKey: ["notes"] });
    } catch (error) {
      setFeedback({ message: formatToduClientError(error), tone: "error" });
    } finally {
      onGlobalInputEnabledChange?.(true);
    }
  };

  useInput((input, key) => {
    const normalizedInput = input.toLowerCase();
    if (key.shift && normalizedInput === "l") {
      setSelectedDate((current) => moveJournalWeek(current, "next"));
      setFeedback(null);
      return;
    }
    if (key.shift && normalizedInput === "h") {
      setSelectedDate((current) => moveJournalWeek(current, "previous"));
      setFeedback(null);
      return;
    }
    if (key.ctrl || key.shift || saveMutation.isPending) return;

    if (input === "j" || key.downArrow) {
      setSelectedEntryId((current) => moveSelection(entries, current, "next"));
      return;
    }
    if (input === "k" || key.upArrow) {
      setSelectedEntryId((current) => moveSelection(entries, current, "previous"));
      return;
    }
    if (input === "n") {
      setFeedback(null);
      void openEntryEditor(null);
      return;
    }
    if ((key.return || input === "\r") && selectedEntry) {
      setFeedback(null);
      void openEntryEditor(selectedEntry);
    }
  });

  const title = entriesQuery.isLoading
    ? `Week • ${week.label} • loading…`
    : `Week • ${week.label} • ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;
  const aboveIndicator = formatListWindowIndicator(entryWindow, "above");
  const belowIndicator = formatListWindowIndicator(entryWindow, "below");

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Pane title={title} width="100%" focused>
        {entriesQuery.error ? (
          <Box flexDirection="column">
            <Text color="red">Journal unavailable</Text>
            <Text color="gray">{formatToduClientError(entriesQuery.error)}</Text>
          </Box>
        ) : null}
        {!entriesQuery.error && entriesQuery.isLoading ? (
          <Text color="gray">Loading journal entries…</Text>
        ) : null}
        {!entriesQuery.error && !entriesQuery.isLoading && entries.length === 0 ? (
          <Text color="gray">No journal entries this week.</Text>
        ) : null}
        {!entriesQuery.error && !entriesQuery.isLoading && aboveIndicator ? (
          <Text color="gray">{aboveIndicator}</Text>
        ) : null}
        {!entriesQuery.error && !entriesQuery.isLoading
          ? entryWindow.items.map((entry) => {
              const selected = entry.id === effectiveSelectedEntryId;
              return (
                <Text
                  key={entry.id}
                  color={selected ? "cyan" : undefined}
                  inverse={selected}
                  wrap="truncate-end"
                >
                  {selected ? ">" : " "} {formatJournalEntryDate(entry, timezone)}
                </Text>
              );
            })
          : null}
        {!entriesQuery.error && !entriesQuery.isLoading && belowIndicator ? (
          <Text color="gray">{belowIndicator}</Text>
        ) : null}
      </Pane>
      <ToastLine message={feedback?.message ?? null} tone={feedback?.tone ?? "info"} />
    </Box>
  );
}

function defaultComposeEntry(initialContent: string): string | null {
  return composeJournalEntry({ initialContent });
}

function resolveLocalTimezone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function formatJournalEntryDate(entry: Note, timezone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  }).format(new Date(entry.createdAt));
}

function resolveMaxVisibleEntries(rows: number | undefined): number {
  const terminalRows = rows && rows > 0 ? rows : 24;
  return Math.max(MIN_VISIBLE_ENTRIES, terminalRows - 11);
}
