import type { ReactNode } from "react";

const PRIORITY_CLASSES: Record<string, string> = {
  high: "priority-high",
  medium: "priority-medium",
  low: "priority-low",
};

export function PriorityChip({ priority }: { priority: string }): ReactNode {
  return <span className={`chip ${PRIORITY_CLASSES[priority] ?? ""}`}>{priority}</span>;
}
