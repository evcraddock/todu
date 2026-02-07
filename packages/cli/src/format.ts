import type { ToduError } from "@todu/core";
import pc from "picocolors";

// ============================================================================
// Color support
// ============================================================================

/** Whether color output is enabled (TTY + not explicitly disabled) */
let colorEnabled = process.stdout.isTTY === true && !process.env.NO_COLOR;

export function setColorEnabled(enabled: boolean): void {
  colorEnabled = enabled;
}

export function isColorEnabled(): boolean {
  return colorEnabled;
}

/** Apply color only when enabled */
function color(fn: (s: string) => string, text: string): string {
  return colorEnabled ? fn(text) : text;
}

/** Colorize a priority value */
export function colorPriority(priority: string): string {
  switch (priority) {
    case "high":
      return color(pc.red, priority);
    case "medium":
      return color(pc.yellow, priority);
    case "low":
      return color(pc.green, priority);
    default:
      return priority;
  }
}

/** Colorize a status value */
export function colorStatus(status: string): string {
  switch (status) {
    case "done":
      return color(pc.green, status);
    case "canceled":
      return color(pc.dim, status);
    case "inprogress":
      return color(pc.cyan, status);
    case "waiting":
      return color(pc.yellow, status);
    default:
      return status;
  }
}

// ============================================================================
// Output formatting
// ============================================================================

/**
 * Format data as a table for terminal output.
 * Columns auto-size to content width.
 * Optional colorizers transform cell values for display while keeping
 * width calculations based on the raw value.
 */
export function formatTable(
  rows: Record<string, string>[],
  columns: { key: string; label: string; colorize?: (value: string) => string }[],
): string {
  if (rows.length === 0) {
    return "No results.";
  }

  // Calculate column widths based on raw (uncolored) values
  const widths = columns.map((col) => {
    const values = rows.map((row) => (row[col.key] ?? "").length);
    return Math.max(col.label.length, ...values);
  });

  // Header
  const header = columns.map((col, i) => color(pc.bold, col.label.padEnd(widths[i]))).join("  ");
  const separator = color(pc.dim, widths.map((w) => "─".repeat(w)).join("──"));

  // Rows
  const body = rows
    .map((row) =>
      columns
        .map((col, i) => {
          const raw = row[col.key] ?? "";
          const padded = raw.padEnd(widths[i]);
          return col.colorize ? col.colorize(raw) + " ".repeat(widths[i] - raw.length) : padded;
        })
        .join("  "),
    )
    .join("\n");

  return `${header}\n${separator}\n${body}`;
}

/**
 * Format data as JSON.
 */
export function formatJSON(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Format a ToduError for display.
 */
export function formatError(error: ToduError): string {
  switch (error.type) {
    case "not-found":
      return `Error: ${error.entity} not found: ${error.id}`;
    case "validation":
      return `Error: ${error.field}: ${error.message}`;
    case "storage":
      return `Error: ${error.message}`;
  }
}
