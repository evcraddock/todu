import type { ToduError } from "@todu/core";

// ============================================================================
// Output formatting
// ============================================================================

/**
 * Format data as a table for terminal output.
 * Columns auto-size to content width.
 */
export function formatTable(
  rows: Record<string, string>[],
  columns: { key: string; label: string }[],
): string {
  if (rows.length === 0) {
    return "No results.";
  }

  // Calculate column widths
  const widths = columns.map((col) => {
    const values = rows.map((row) => (row[col.key] ?? "").length);
    return Math.max(col.label.length, ...values);
  });

  // Header
  const header = columns.map((col, i) => col.label.padEnd(widths[i])).join("  ");
  const separator = widths.map((w) => "─".repeat(w)).join("──");

  // Rows
  const body = rows
    .map((row) => columns.map((col, i) => (row[col.key] ?? "").padEnd(widths[i])).join("  "))
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
