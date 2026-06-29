import { Box, Text, useApp, useInput } from "ink";
import type { JSX } from "react";

export function App(): JSX.Element {
  const { exit } = useApp();

  useInput((input, key) => {
    if (input === "q" || (key.ctrl && input === "c")) {
      exit();
    }
  });

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Text color="cyan" bold>
        todu TUI coming online
      </Text>
      <Text color="gray">Press q or Ctrl+C to quit.</Text>
    </Box>
  );
}
