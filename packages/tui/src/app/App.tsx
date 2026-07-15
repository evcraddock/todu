import { useQueryClient } from "@tanstack/react-query";
import { useApp, useInput } from "ink";
import { type JSX, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppFrame } from "../components/AppFrame.js";
import { ConnectionState } from "../components/ConnectionState.js";
import {
  createDaemonConnection,
  type DaemonConnection,
  type DaemonConnectionSnapshot,
} from "../daemon/connection.js";
import { createTuiToduClient, type TuiToduClient } from "../daemon/todu-client.js";
import { DataStatusScreen } from "../screens/DataStatusScreen.js";
import { HelpScreen } from "../screens/HelpScreen.js";
import { ProjectsScreen } from "../screens/ProjectsScreen.js";
import { TasksScreen } from "../screens/TasksScreen.js";
import {
  applySyncStatusEvent,
  invalidateDataChangedQueries,
  invalidateReconnectQueries,
  reactiveDaemonEvents,
} from "../state/event-invalidation.js";
import {
  allProjectsFilter,
  createProjectFilter,
  type ProjectFilterState,
} from "../state/project-filter.js";
import { createTuiQueryClient, TuiQueryProvider } from "../state/query-client.js";
import type { TuiTaskFilterState } from "../state/task-filter.js";
import {
  applyNavigationAction,
  createInitialRouteState,
  resolveGlobalKeyAction,
} from "./keymap.js";
import type { AppRoute } from "./routes.js";

export interface AppProps {
  connection?: DaemonConnection;
  toduClient?: TuiToduClient;
  onExit?: () => void;
}

export function App({
  connection: providedConnection,
  toduClient: providedToduClient,
  onExit,
}: AppProps = {}): JSX.Element {
  const queryClient = useMemo(() => createTuiQueryClient(), []);

  return (
    <TuiQueryProvider client={queryClient}>
      <AppContent connection={providedConnection} toduClient={providedToduClient} onExit={onExit} />
    </TuiQueryProvider>
  );
}

function AppContent({
  connection: providedConnection,
  toduClient: providedToduClient,
  onExit,
}: AppProps): JSX.Element {
  const { exit } = useApp();
  const queryClient = useQueryClient();
  const connection = useMemo(
    () => providedConnection ?? createDaemonConnection(),
    [providedConnection],
  );
  const toduClient = useMemo(
    () => providedToduClient ?? createTuiToduClient(connection),
    [connection, providedToduClient],
  );
  const [routeState, setRouteState] = useState(createInitialRouteState);
  const [projectFilter, setProjectFilter] = useState<ProjectFilterState>(allProjectsFilter);
  const taskFilter = useMemo<TuiTaskFilterState>(() => ({ projectFilter }), [projectFilter]);
  const [globalInputEnabled, setGlobalInputEnabled] = useState(true);
  const [connectionSnapshot, setConnectionSnapshot] = useState<DaemonConnectionSnapshot>(() =>
    connection.getSnapshot(),
  );
  const [hasConnected, setHasConnected] = useState(connectionSnapshot.state === "connected");
  const previousConnectionState = useRef(connectionSnapshot.state);
  const requestExit = (): void => {
    onExit?.();
    exit();
  };

  const updateProjectFilter = useCallback((nextFilter: ProjectFilterState): void => {
    setProjectFilter(nextFilter);
  }, []);

  useInput(
    (input, key) => {
      const action = resolveGlobalKeyAction(input, key);
      const nextState = applyNavigationAction(routeState, action);

      if (nextState === "quit") {
        requestExit();
        return;
      }

      setRouteState(nextState);
    },
    { isActive: globalInputEnabled },
  );

  useEffect(() => {
    const unsubscribe = connection.subscribe(setConnectionSnapshot);
    connection.start();

    return () => {
      unsubscribe();
      connection.stop();
    };
  }, [connection]);

  useEffect(() => {
    if (connectionSnapshot.state === "connected") {
      setHasConnected(true);
    }
  }, [connectionSnapshot.state]);

  useEffect(() => {
    const previousState = previousConnectionState.current;
    previousConnectionState.current = connectionSnapshot.state;

    if (connectionSnapshot.state !== "connected") {
      return;
    }

    let active = true;
    const unsubscribeEvents = connection.subscribeEvents((event) => {
      if (event.event === "data.changed") {
        void invalidateDataChangedQueries(queryClient);
        return;
      }

      if (event.event === "sync.statusChanged") {
        applySyncStatusEvent(queryClient, event.payload);
      }
    });

    void connection
      .request<{ subscribed: string[] }>("events.subscribe", { events: [...reactiveDaemonEvents] })
      .then((result) => {
        if (!active || !result.ok) {
          return;
        }

        if (previousState !== "connected") {
          void invalidateReconnectQueries(queryClient);
        }
      });

    return () => {
      active = false;
      unsubscribeEvents();
    };
  }, [connection, connectionSnapshot.state, queryClient]);

  return (
    <AppFrame route={routeState.route} taskFilter={taskFilter}>
      <ConnectionState connection={connectionSnapshot} />
      <RouteScreen
        route={routeState.route}
        connection={connectionSnapshot}
        hasConnected={hasConnected}
        toduClient={toduClient}
        projectFilter={projectFilter}
        onSelectProject={(project) => {
          updateProjectFilter(createProjectFilter(project));
          setRouteState({ route: "tasks", previousRoute: "tasks" });
        }}
        onSelectAllProjects={() => {
          updateProjectFilter(allProjectsFilter);
          setRouteState({ route: "tasks", previousRoute: "tasks" });
        }}
        onTaskProjectFilterChange={updateProjectFilter}
        onGlobalInputEnabledChange={setGlobalInputEnabled}
      />
    </AppFrame>
  );
}

interface RouteScreenProps {
  route: AppRoute;
  connection: DaemonConnectionSnapshot;
  hasConnected: boolean;
  toduClient: TuiToduClient;
  projectFilter: ProjectFilterState;
  onSelectProject: (project: import("@todu/core").Project) => void;
  onSelectAllProjects: () => void;
  onTaskProjectFilterChange: (filter: ProjectFilterState) => void;
  onGlobalInputEnabledChange: (enabled: boolean) => void;
}

function RouteScreen({
  route,
  connection,
  hasConnected,
  toduClient,
  projectFilter,
  onSelectProject,
  onSelectAllProjects,
  onTaskProjectFilterChange,
  onGlobalInputEnabledChange,
}: RouteScreenProps): JSX.Element | null {
  const dataQueriesEnabled = connection.state === "connected";
  const canShowDataScreens = dataQueriesEnabled || hasConnected;

  if (route === "projects") {
    return canShowDataScreens ? (
      <ProjectsScreen
        client={toduClient}
        projectFilter={projectFilter}
        onSelectProject={onSelectProject}
        onSelectAllProjects={onSelectAllProjects}
        dataQueriesEnabled={dataQueriesEnabled}
      />
    ) : null;
  }

  if (route === "data-status") {
    return connection.state === "connected" ? <DataStatusScreen client={toduClient} /> : null;
  }

  if (route === "help") {
    return <HelpScreen />;
  }

  return canShowDataScreens ? (
    <TasksScreen
      client={toduClient}
      projectFilter={projectFilter}
      statusActionsEnabled={dataQueriesEnabled}
      dataQueriesEnabled={dataQueriesEnabled}
      onGlobalInputEnabledChange={onGlobalInputEnabledChange}
      onProjectFilterChange={onTaskProjectFilterChange}
    />
  ) : null;
}
