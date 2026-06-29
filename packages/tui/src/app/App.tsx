import { Box, Text, useApp, useInput } from "ink";
import { type JSX, useEffect, useMemo, useState } from "react";
import { ConnectionState } from "../components/ConnectionState.js";
import {
  createDaemonConnection,
  type DaemonConnection,
  type DaemonConnectionSnapshot,
} from "../daemon/connection.js";

export interface AppProps {
  connection?: DaemonConnection;
}

export function App({ connection: providedConnection }: AppProps = {}): JSX.Element {
  const { exit } = useApp();
  const connection = useMemo(
    () => providedConnection ?? createDaemonConnection(),
    [providedConnection],
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
      <Text color="gray">Press q or Ctrl+C to quit.</Text>
    </Box>
  );
}
