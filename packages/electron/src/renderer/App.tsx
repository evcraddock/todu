import { QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode, useEffect, useState } from "react";
import { Placeholder } from "./components/Placeholder.js";
import { Sidebar } from "./components/Sidebar.js";
import { StatusBar } from "./components/StatusBar.js";
import { queryClient, setupChangeListener } from "./lib/query-client.js";
import { ProjectList } from "./views/ProjectList.js";
import { TasksView } from "./views/TasksView.js";

function ViewRouter({ activeView }: { activeView: string }): ReactNode {
  switch (activeView) {
    case "projects":
      return <ProjectList />;
    case "tasks":
      return <TasksView />;
    case "habits":
      return <Placeholder title="Habits" />;
    case "recurring":
      return <Placeholder title="Recurring" />;
    case "notes":
      return <Placeholder title="Notes" />;
    case "labels":
      return <Placeholder title="Labels" />;
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

  return (
    <QueryClientProvider client={queryClient}>
      <div className="app-layout">
        <Sidebar activeView={activeView} onNavigate={setActiveView} />
        <main className="content-area">
          <ViewRouter activeView={activeView} />
        </main>
      </div>
      <StatusBar />
    </QueryClientProvider>
  );
}
