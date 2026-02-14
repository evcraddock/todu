import type { TaskFilter } from "@todu/core/browser";
import { type ReactNode, useEffect, useState } from "react";
import { CreateTaskDialog } from "./CreateTaskDialog.js";
import { TaskDetail } from "./TaskDetail.js";
import { TaskList } from "./TaskList.js";

/**
 * Top-level task view — manages navigation between list, detail, and create.
 * `triggerCreateTask` is a counter — incrementing it opens the create dialog.
 * `externalFilter` is set by agent ui-actions to apply filters from the chat pane.
 */
export function TasksView({
  triggerCreateTask = 0,
  externalFilter,
}: {
  triggerCreateTask?: number;
  externalFilter?: TaskFilter | null;
}): ReactNode {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  // Open create dialog when triggered externally (tray menu, shortcut)
  useEffect(() => {
    if (triggerCreateTask > 0) {
      setSelectedTaskId(null);
      setShowCreateDialog(true);
    }
  }, [triggerCreateTask]);

  if (selectedTaskId) {
    return <TaskDetail taskId={selectedTaskId} onBack={() => setSelectedTaskId(null)} />;
  }

  return (
    <>
      <TaskList
        onSelectTask={setSelectedTaskId}
        onCreateTask={() => setShowCreateDialog(true)}
        externalFilter={externalFilter}
      />
      {showCreateDialog && <CreateTaskDialog onClose={() => setShowCreateDialog(false)} />}
    </>
  );
}
