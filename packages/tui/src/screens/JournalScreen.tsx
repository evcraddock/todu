import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Note, NoteFilter } from "@todu/core";
import { Box, Text, useApp, useInput } from "ink";
import type { JSX } from "react";
import { useMemo, useState } from "react";
import { Pane } from "../components/Pane.js";
import { ToastLine, type ToastTone } from "../components/ToastLine.js";
import { formatToduClientError, type TuiToduClient } from "../daemon/todu-client.js";
import { composeJournalEntry, normalizeCommentContent } from "../state/comment-actions.js";
import { createJournalWeek, moveJournalWeek } from "../state/journal-week.js";
import { queryKeys } from "../state/query-keys.js";

export interface JournalScreenProps {
  client: TuiToduClient;
  dataQueriesEnabled?: boolean;
  onGlobalInputEnabledChange?: (enabled: boolean) => void;
  composeEntry?: () => string | null;
  initialDate?: Date;
  timezone?: string;
}

export function JournalScreen({
  client,
  dataQueriesEnabled = true,
  onGlobalInputEnabledChange,
  composeEntry = composeJournalEntry,
  initialDate,
  timezone = resolveLocalTimezone(),
}: JournalScreenProps): JSX.Element {
  const queryClient = useQueryClient();
  const { suspendTerminal } = useApp();
  const [selectedDate, setSelectedDate] = useState(() => initialDate ?? new Date());
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
  const createMutation = useMutation({
    mutationFn: (content: string) => client.note.create({ content }),
  });

  const openEntryEditor = async (): Promise<void> => {
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
        composedContent = composeEntry();
      });
      const content = normalizeCommentContent(composedContent ?? "");
      if (!content) {
        setFeedback({ message: "Cancelled journal entry.", tone: "info" });
        return;
      }

      await createMutation.mutateAsync(content);
      setFeedback({ message: "Journal entry added.", tone: "success" });
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
    if (key.ctrl || key.shift || createMutation.isPending) {
      return;
    }
    if (input === "n") {
      setFeedback(null);
      void openEntryEditor();
    }
  });

  const title = entriesQuery.isLoading
    ? `Week • ${week.label} • loading…`
    : `Week • ${week.label} • ${entries.length} ${entries.length === 1 ? "entry" : "entries"}`;

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
        {!entriesQuery.error && !entriesQuery.isLoading
          ? entries.map((entry) => (
              <Box key={entry.id} flexDirection="column" marginBottom={1}>
                <Text color="cyan">{formatJournalEntryDate(entry, timezone)}</Text>
                <Text>{entry.content}</Text>
              </Box>
            ))
          : null}
      </Pane>
      <ToastLine message={feedback?.message ?? null} tone={feedback?.tone ?? "info"} />
    </Box>
  );
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
