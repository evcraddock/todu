import type { TaskPriority } from "@todu/core";
import { Box, Text, useInput } from "ink";
import type { JSX } from "react";
import { useState } from "react";
import { toggleStatus } from "../state/list-filter.js";

const priorities: readonly (TaskPriority | undefined)[] = [undefined, "high", "medium", "low"];

export interface FilterStatusOption<Status extends string> {
  value: Status;
  label: string;
}

export interface ListFilterDraft<Status extends string> {
  statuses: readonly Status[];
  priority?: TaskPriority;
  includeHigherPriorities?: boolean;
}

export interface ListFilterModalProps<Status extends string> {
  title: string;
  statusOptions: readonly FilterStatusOption<Status>[];
  initialFilter: ListFilterDraft<Status>;
  defaultFilter?: ListFilterDraft<Status>;
  onApply: (filter: ListFilterDraft<Status>) => void;
  onCancel: () => void;
}

export function ListFilterModal<Status extends string>({
  title,
  statusOptions,
  initialFilter,
  defaultFilter,
  onApply,
  onCancel,
}: ListFilterModalProps<Status>): JSX.Element {
  const [draft, setDraft] = useState<ListFilterDraft<Status>>(initialFilter);
  const [selectedRow, setSelectedRow] = useState(0);
  const priorityRow = statusOptions.length;
  const includeHigherPrioritiesRow = priorityRow + 1;

  useInput((input, key) => {
    if (key.escape || input === "\u001B") {
      onCancel();
      return;
    }

    if (key.return) {
      onApply(draft);
      return;
    }

    if (input === "r") {
      setDraft(defaultFilter ?? initialFilter);
      return;
    }

    if (input === "j" || key.downArrow) {
      setSelectedRow((row) => Math.min(row + 1, includeHigherPrioritiesRow));
      return;
    }

    if (input === "k" || key.upArrow) {
      setSelectedRow((row) => Math.max(row - 1, 0));
      return;
    }

    if (input === " ") {
      if (selectedRow < priorityRow) {
        const status = statusOptions[selectedRow]?.value;
        if (status) {
          setDraft((current) => ({
            ...current,
            statuses: toggleStatus(current.statuses, status),
          }));
        }
      }

      if (selectedRow === includeHigherPrioritiesRow) {
        setDraft((current) => ({
          ...current,
          includeHigherPriorities: !current.includeHigherPriorities,
        }));
      }
      return;
    }

    if ((key.leftArrow || key.rightArrow) && selectedRow === priorityRow) {
      const direction = key.rightArrow ? 1 : -1;
      setDraft((current) => ({
        ...current,
        priority: cyclePriority(current.priority, direction),
      }));
    }
  });

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan">{title}</Text>
      {statusOptions.map((status, index) => (
        <Text key={status.value} color={selectedRow === index ? "white" : "gray"}>
          {`${selectedRow === index ? ">" : " "} [${draft.statuses.includes(status.value) ? "x" : " "}] ${status.label}`}
        </Text>
      ))}
      <Text color={selectedRow === priorityRow ? "white" : "gray"}>
        {`${selectedRow === priorityRow ? ">" : " "} Priority: ${formatPriority(draft.priority)}`}
      </Text>
      <Text color={selectedRow === includeHigherPrioritiesRow ? "white" : "gray"}>
        {`${selectedRow === includeHigherPrioritiesRow ? ">" : " "} [${draft.includeHigherPriorities ? "x" : " "}] Include higher priorities`}
      </Text>
      <Text color="gray">
        ↑↓ select • Space toggle • ←→ priority • Enter apply • r reset • Esc cancel
      </Text>
    </Box>
  );
}

function cyclePriority(
  priority: TaskPriority | undefined,
  direction: number,
): TaskPriority | undefined {
  const currentIndex = priorities.indexOf(priority);
  const nextIndex = (currentIndex + direction + priorities.length) % priorities.length;
  return priorities[nextIndex];
}

function formatPriority(priority: TaskPriority | undefined): string {
  return priority ? `${priority[0]?.toUpperCase()}${priority.slice(1)}` : "Any";
}
