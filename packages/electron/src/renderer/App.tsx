import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { Placeholder } from "./components/Placeholder.js";
import { Sidebar } from "./components/Sidebar.js";
import { StatusBar } from "./components/StatusBar.js";
import { ToastContainer } from "./components/ToastContainer.js";
import { useSidebar } from "./hooks/useSidebar.js";
import { type ThemePreference, useTheme } from "./hooks/useTheme.js";
import { queryClient, setupChangeListener } from "./lib/query-client.js";
import { AgentView } from "./views/AgentView.js";
import { HabitsView } from "./views/HabitsView.js";
import { HomeView } from "./views/HomeView.js";
import { LabelsView } from "./views/LabelsView.js";
import { NotesView } from "./views/NotesView.js";
import { ProjectsView } from "./views/ProjectsView.js";
import { RecurringView } from "./views/RecurringView.js";
import { SettingsView } from "./views/SettingsView.js";
import { TasksView } from "./views/TasksView.js";

function ViewRouter({
  activeView,
  onNavigateToEntity,
  triggerCreateTask,
  themePreference,
  onThemeChange,
}: {
  activeView: string;
  onNavigateToEntity: (entityType: string, entityId: string) => void;
  triggerCreateTask: number;
  themePreference: ThemePreference;
  onThemeChange: (pref: ThemePreference) => void;
}): ReactNode {
  switch (activeView) {
    case "home":
      return <HomeView onNavigateToTask={(id) => onNavigateToEntity("task", id)} />;
    case "projects":
      return <ProjectsView />;
    case "tasks":
      return <TasksView triggerCreateTask={triggerCreateTask} />;
    case "habits":
      return <HabitsView />;
    case "recurring":
      return <RecurringView />;
    case "notes":
      return <NotesView onNavigateToEntity={onNavigateToEntity} />;
    case "labels":
      return <LabelsView />;
    case "agent":
      return <AgentView />;
    case "settings":
      return <SettingsView themePreference={themePreference} onThemeChange={onThemeChange} />;
    default:
      return <Placeholder title="Unknown" />;
  }
}

export function App(): ReactNode {
  const [activeView, setActiveView] = useState("home");
  const [triggerCreateTask, setTriggerCreateTask] = useState(0);
  const theme = useTheme();
  const sidebar = useSidebar();

  useEffect(() => {
    const cleanup = setupChangeListener();
    return cleanup;
  }, []);

  // Listen for actions from the main process (tray menu, etc.)
  useEffect(() => {
    const cleanup = window.todu.on("todu:action", (data) => {
      const action = data as string;
      if (action === "new-task") {
        setActiveView("tasks");
        setTriggerCreateTask((c) => c + 1);
      }
    });
    return cleanup;
  }, []);

  // In-app keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Ctrl/Cmd+N — new task
      if (mod && e.key === "n") {
        e.preventDefault();
        setActiveView("tasks");
        setTriggerCreateTask((c) => c + 1);
      }

      // Ctrl/Cmd+B — toggle sidebar
      if (mod && e.key === "b") {
        e.preventDefault();
        sidebar.toggleHidden();
      }

      // Ctrl/Cmd+K — focus search (navigate to tasks view)
      if (mod && e.key === "k") {
        e.preventDefault();
        setActiveView("tasks");
        // Focus the search input after view renders
        setTimeout(() => {
          const searchInput = document.querySelector<HTMLInputElement>(".search-input");
          searchInput?.focus();
        }, 50);
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sidebar.toggleHidden]);

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
        <Sidebar
          activeView={activeView}
          onNavigate={setActiveView}
          mode={sidebar.mode}
          cssWidth={sidebar.cssWidth}
          onToggleCollapse={sidebar.toggleCollapse}
          onDragStart={sidebar.onDragStart}
        />
        <main className="content-area">
          <ViewRouter
            activeView={activeView}
            onNavigateToEntity={handleNavigateToEntity}
            triggerCreateTask={triggerCreateTask}
            themePreference={theme.preference}
            onThemeChange={theme.setPreference}
          />
        </main>
      </div>
      <StatusBar />
      <ToastContainer />
    </QueryClientProvider>
  );
}
