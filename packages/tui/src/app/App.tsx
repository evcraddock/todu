import { Box, Text, useApp, useInput } from "ink";
import { type JSX, useEffect, useMemo, useState } from "react";
import { ConnectionState } from "../components/ConnectionState.js";
import {
  createDaemonConnection,
  type DaemonConnection,
  type DaemonConnectionSnapshot,
} from "../daemon/connection.js";
import { createTuiToduClient, type TuiToduClient } from "../daemon/todu-client.js";
import { DataStatusScreen } from "../screens/DataStatusScreen.js";
import { createTuiQueryClient, TuiQueryProvider } from "../state/query-client.js";

export interface AppProps {
  connection?: DaemonConnection;
  toduClient?: TuiToduClient;
}

export function App({
  connection: providedConnection,
  toduClient: providedToduClient,
}: AppProps = {}): JSX.Element {
  const queryClient = useMemo(() => createTuiQueryClient(), []);

  return (
    <TuiQueryProvider client={queryClient}>
      <AppContent connection={providedConnection} toduClient={providedToduClient} />
    </TuiQueryProvider>
  );
}

function AppContent({
  connection: providedConnection,
  toduClient: providedToduClient,
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
  const [connectionSnapshot, setConnectionSnapshot] = useState<DaemonConnectionSnapshot>(() =>
    connection.getSnapshot(),
  );

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
    }
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
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text color="cyan" bold>
        todu TUI
      </Text>
      <ConnectionState connection={connectionSnapshot} />
      {connectionSnapshot.state === "connected" ? <DataStatusScreen client={toduClient} /> : null}
      <Text color="gray">Press q or Ctrl+C to quit.</Text>
    </Box>
  );
}
