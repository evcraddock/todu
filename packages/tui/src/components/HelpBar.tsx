import { Box, Text } from "ink";
import type { JSX } from "react";
import { globalKeyBindings } from "../app/keymap.js";

export function HelpBar(): JSX.Element {
  return (
    <Box flexDirection="row">
      <Text color="gray" wrap="truncate-end">
        {globalKeyBindings.map((binding) => `${binding.keys} ${binding.description}`).join("  •  ")}
      </Text>
    </Box>
  );
}
