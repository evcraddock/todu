import { Box, Text } from "ink";
import type { JSX } from "react";
import { type FooterContext, footerKeyBindings } from "../app/keymap.js";

export interface HelpBarProps {
  context: FooterContext;
}

export function HelpBar({ context }: HelpBarProps): JSX.Element {
  return (
    <Box flexDirection="row">
      <Text color="gray" wrap="truncate-end">
        {footerKeyBindings[context]
          .map((binding) => `${binding.keys} ${binding.description}`)
          .join("  •  ")}
      </Text>
    </Box>
  );
}
