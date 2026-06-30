import { useApp, useInput } from "ink";
import { type JSX, useEffect, useMemo, useState } from "react";
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
import { createTuiQueryClient, TuiQueryProvider } from "../state/query-client.js";
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
  const connection = useMemo(
    () => providedConnection ?? createDaemonConnection(),
    [providedConnection],
  );
  const toduClient = useMemo(
    () => providedToduClient ?? createTuiToduClient(connection),
    [connection, providedToduClient],
  );
  const [routeState, setRouteState] = useState(createInitialRouteState);
  const [connectionSnapshot, setConnectionSnapshot] = useState<DaemonConnectionSnapshot>(() =>
    connection.getSnapshot(),
  );

  const requestExit = (): void => {
    onExit?.();
    exit();
  };

  useInput((input, key) => {
    const action = resolveGlobalKeyAction(input, key);
    const nextState = applyNavigationAction(routeState, action);

    if (nextState === "quit") {
      requestExit();
      return;
    }

    setRouteState(nextState);
  });

  useEffect(() => {
    const unsubscribe = connection.subscribe(setConnectionSnapshot);
    connection.start();

    return () => {
      unsubscribe();
      connection.stop();
    };
  }, [connection]);

  return (
    <AppFrame route={routeState.route} connection={connectionSnapshot}>
      <ConnectionState connection={connectionSnapshot} />
      <RouteScreen
        route={routeState.route}
        connection={connectionSnapshot}
        toduClient={toduClient}
      />
    </AppFrame>
  );
}

interface RouteScreenProps {
  route: AppRoute;
  connection: DaemonConnectionSnapshot;
  toduClient: TuiToduClient;
}

function RouteScreen({ route, connection, toduClient }: RouteScreenProps): JSX.Element | null {
  if (route === "projects") {
    return <ProjectsScreen />;
  }

  if (route === "data-status") {
    return connection.state === "connected" ? <DataStatusScreen client={toduClient} /> : null;
  }

  if (route === "help") {
    return <HelpScreen />;
  }

  return <TasksScreen />;
}
