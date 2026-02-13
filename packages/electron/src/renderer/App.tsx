import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Placeholder } from "./components/Placeholder.js";
import { Sidebar } from "./components/Sidebar.js";
import { StatusBar } from "./components/StatusBar.js";
import { queryClient, setupChangeListener } from "./lib/query-client.js";
import { HabitsView } from "./views/HabitsView.js";
import { LabelsView } from "./views/LabelsView.js";
import { NotesView } from "./views/NotesView.js";
import { ProjectsView } from "./views/ProjectsView.js";
import { RecurringView } from "./views/RecurringView.js";
import { TasksView } from "./views/TasksView.js";

function ViewRouter({
  activeView,
  onNavigateToEntity,
}: {
  activeView: string;
  onNavigateToEntity: (entityType: string, entityId: string) => void;
}): ReactNode {
  switch (activeView) {
    case "projects":
      return <ProjectsView />;
    case "tasks":
      return <TasksView />;
    case "habits":
      return <HabitsView />;
    case "recurring":
      return <RecurringView />;
    case "notes":
      return <NotesView onNavigateToEntity={onNavigateToEntity} />;
    case "labels":
      return <LabelsView />;
    case "agent":
      return <Placeholder title="Agent" />;
    default:
      return <Placeholder title="Unknown" />;
  }
}

export function App(): ReactNode {
  const [activeView, setActiveView] = useState("projects");

  useEffect(() => {
    const cleanup = setupChangeListener();
    return cleanup;
  }, []);

  // Navigate to an entity from notes or other cross-view links.
  // For now, switches to the appropriate top-level view.
  // TODO: deep-link to specific entity detail (needs view-level state lifting)
  const handleNavigateToEntity = useCallback((entityType: string, _entityId: string) => {
    switch (entityType) {
      case "task":
        setActiveView("tasks");
        break;
      case "project":
        setActiveView("projects");
        break;
      case "habit":
        setActiveView("habits");
        break;
      default:
        break;
    }
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app-layout">
        <Sidebar activeView={activeView} onNavigate={setActiveView} />
        <main className="content-area">
          <ViewRouter activeView={activeView} onNavigateToEntity={handleNavigateToEntity} />
        </main>
      </div>
      <StatusBar />
    </QueryClientProvider>
  );
}
