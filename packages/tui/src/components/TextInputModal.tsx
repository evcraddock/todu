import { Box, Text } from "ink";
import type { JSX } from "react";

export interface TextInputModalProps {
  title: string;
  value: string;
  placeholder?: string;
  hint?: string;
  error?: string | null;
}

export function TextInputModal({
  title,
  value,
  placeholder = "Type here…",
  hint = "Enter submits • Escape cancels",
  error = null,
}: TextInputModalProps): JSX.Element {
  const displayValue = value.length > 0 ? value : placeholder;

  return (
    <Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
      <Text color="cyan">{title}</Text>
      <Text color={value.length > 0 ? "white" : "gray"}>{`> ${displayValue}_`}</Text>
      {error ? <Text color="red">{error}</Text> : null}
      <Text color="gray">{hint}</Text>
    </Box>
  );
}
