import { Text } from "ink";
import type { JSX } from "react";

export type ToastTone = "info" | "success" | "error";

export interface ToastLineProps {
  message: string | null;
  tone: ToastTone;
}

export function ToastLine({ message, tone }: ToastLineProps): JSX.Element | null {
  if (!message) {
    return null;
  }

  const color = tone === "error" ? "red" : tone === "success" ? "green" : "gray";
  return <Text color={color}>{message}</Text>;
}
