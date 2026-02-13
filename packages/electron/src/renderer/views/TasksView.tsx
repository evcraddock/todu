import { type ReactNode, useState } from "react";
import { CreateTaskDialog } from "./CreateTaskDialog.js";
import { TaskDetail } from "./TaskDetail.js";
import { TaskList } from "./TaskList.js";

/**
 * Top-level task view — manages navigation between list, detail, and create.
 */
export function TasksView(): ReactNode {
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);

  if (selectedTaskId) {
    return <TaskDetail taskId={selectedTaskId} onBack={() => setSelectedTaskId(null)} />;
  }

  return (
    <>
      <TaskList onSelectTask={setSelectedTaskId} onCreateTask={() => setShowCreateDialog(true)} />
      {showCreateDialog && <CreateTaskDialog onClose={() => setShowCreateDialog(false)} />}
    </>
  );
}
