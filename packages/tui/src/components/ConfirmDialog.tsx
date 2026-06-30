import { Box, Text } from "ink";
import type { JSX } from "react";

export interface ConfirmDialogProps {
  message: string;
}

export function ConfirmDialog({ message }: ConfirmDialogProps): JSX.Element {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text color="yellow">{message}</Text>
      <Text color="gray">Press y to confirm or n to cancel.</Text>
    </Box>
  );
}
