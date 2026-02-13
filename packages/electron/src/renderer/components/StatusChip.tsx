import type { ReactNode } from "react";

const STATUS_CLASSES: Record<string, string> = {
  active: "status-active",
  inprogress: "status-inprogress",
  waiting: "status-waiting",
  done: "status-done",
  canceled: "status-canceled",
};

export function StatusChip({ status }: { status: string }): ReactNode {
  return <span className={`chip ${STATUS_CLASSES[status] ?? ""}`}>{status}</span>;
}
