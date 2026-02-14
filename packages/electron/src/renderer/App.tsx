import { QueryClientProvider } from "@tanstack/react-query";
import type { ProjectFilter, TaskFilter } from "@todu/core/browser";
import { type ReactNode, useCallback, useEffect, useState } from "react";
import { AgentPane } from "./components/AgentPane.js";
import { Placeholder } from "./components/Placeholder.js";
import { Sidebar } from "./components/Sidebar.js";
import { StatusBar } from "./components/StatusBar.js";
import { ToastContainer } from "./components/ToastContainer.js";
import { useAgentPane } from "./hooks/useAgentPane.js";
import { useSidebar } from "./hooks/useSidebar.js";
import { type ThemePreference, useTheme } from "./hooks/useTheme.js";
import { queryClient, setupChangeListener } from "./lib/query-client.js";
import { HabitsView } from "./views/HabitsView.js";
import { HomeView } from "./views/HomeView.js";
import { JournalView } from "./views/JournalView.js";
import { LabelsView } from "./views/LabelsView.js";
import { ProjectsView } from "./views/ProjectsView.js";
import { RecurringView } from "./views/RecurringView.js";
import { SettingsView } from "./views/SettingsView.js";
import { TasksView } from "./views/TasksView.js";

function ViewRouter({
  activeView,
  onNavigateToEntity,
  triggerCreateTask,
  agentTaskFilter,
  themePreference,
  onThemeChange,
}: {
  activeView: string;
  onNavigateToEntity: (entityType: string, entityId: string) => void;
  triggerCreateTask: number;
  agentTaskFilter: TaskFilter | null;
  agentProjectFilter: ProjectFilter | null;
  themePreference: ThemePreference;
  onThemeChange: (pref: ThemePreference) => void;
}): ReactNode {
  switch (activeView) {
    case "home":
      return <HomeView onNavigateToTask={(id) => onNavigateToEntity("task", id)} />;
    case "projects":
      return <ProjectsView externalFilter={agentProjectFilter} />;
    case "tasks":
      return <TasksView triggerCreateTask={triggerCreateTask} externalFilter={agentTaskFilter} />;
    case "habits":
      return <HabitsView />;
    case "recurring":
      return <RecurringView />;
    case "journal":
      return <JournalView />;
    case "labels":
      return <LabelsView />;
    case "settings":
      return <SettingsView themePreference={themePreference} onThemeChange={onThemeChange} />;
    default:
      return <Placeholder title="Unknown" />;
  }
}

export function App(): ReactNode {
  const [activeView, setActiveView] = useState("home");
  const [triggerCreateTask, setTriggerCreateTask] = useState(0);
  const [agentTaskFilter, setAgentTaskFilter] = useState<TaskFilter | null>(null);
  const [agentProjectFilter, setAgentProjectFilter] = useState<ProjectFilter | null>(null);
  const theme = useTheme();
  const sidebar = useSidebar();
  const agentPane = useAgentPane();

  useEffect(() => {
    const cleanup = setupChangeListener();
    return cleanup;
  }, []);

  // Listen for UI actions from agent tools (e.g., list_tasks → navigate to Tasks with filter)
  useEffect(() => {
    const cleanup = window.todu.on("todu:ui-action", (data) => {
      const uiAction = data as { action: string; filter?: Record<string, unknown> };
      if (uiAction.action === "show_tasks") {
        setActiveView("tasks");
        setAgentTaskFilter((uiAction.filter as TaskFilter) ?? {});
      } else if (uiAction.action === "show_projects") {
        setActiveView("projects");
        setAgentProjectFilter((uiAction.filter as ProjectFilter) ?? {});
      }
    });
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

      // Ctrl/Cmd+J — toggle agent pane
      if (mod && e.key === "j") {
        e.preventDefault();
        agentPane.toggle();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [sidebar.toggleHidden, agentPane.toggle]);

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
          agentPaneVisible={agentPane.visible}
          onToggleAgentPane={agentPane.toggle}
        />
        <main className="content-area">
          <ViewRouter
            activeView={activeView}
            onNavigateToEntity={handleNavigateToEntity}
            triggerCreateTask={triggerCreateTask}
            agentTaskFilter={agentTaskFilter}
            agentProjectFilter={agentProjectFilter}
            themePreference={theme.preference}
            onThemeChange={theme.setPreference}
          />
        </main>
        <AgentPane
          visible={agentPane.visible}
          width={agentPane.cssWidth}
          isDragging={agentPane.isDragging}
          onDragStart={agentPane.onDragStart}
          onClose={agentPane.hide}
        />
      </div>
      <StatusBar />
      <ToastContainer />
    </QueryClientProvider>
  );
}
