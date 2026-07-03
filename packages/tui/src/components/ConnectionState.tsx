import { Box, Text } from "ink";
import type { JSX } from "react";
import type { DaemonConnectionSnapshot } from "../daemon/connection.js";

export interface ConnectionStateProps {
  connection: DaemonConnectionSnapshot;
}

export function ConnectionState({ connection }: ConnectionStateProps): JSX.Element | null {
  if (connection.state === "connected") {
    return null;
  }

  if (connection.state === "connecting") {
    return <Text color="yellow">Connecting to daemon at {connection.socketPath}…</Text>;
  }

  if (connection.state === "reconnecting") {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Daemon disconnected; reconnecting…</Text>
        <Text color="gray">
          Attempt {connection.reconnectAttempt} in {connection.reconnectDelayMs ?? 0}ms
        </Text>
      </Box>
    );
  }

  if (connection.state === "failed") {
    return (
      <Box flexDirection="column">
        <Text color="red">Daemon unavailable</Text>
        <Text color="gray">Start it with: todu daemon start</Text>
        <Text color="gray">Socket: {connection.socketPath}</Text>
        {connection.error ? <Text color="gray">Reason: {connection.error.message}</Text> : null}
      </Box>
    );
  }

  return <Text color="gray">Daemon disconnected</Text>;
}
