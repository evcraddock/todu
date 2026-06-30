import { Box, Text } from "ink";
import type { JSX } from "react";
import { globalKeyBindings } from "../app/keymap.js";

export function HelpScreen(): JSX.Element {
  return (
    <Box flexDirection="column">
      <Text color="cyan">Help</Text>
      {globalKeyBindings.map((binding) => (
        <Text key={binding.keys} color="gray">
          {binding.keys.padEnd(6)} {binding.description}
        </Text>
      ))}
    </Box>
  );
}
