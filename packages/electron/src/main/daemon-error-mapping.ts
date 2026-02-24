import type { ToduError } from "@todu/core";
import type { DaemonConnectionError } from "./daemon-connection-manager.js";

export function mapDaemonErrorToToduError(method: string, error: DaemonConnectionError): ToduError {
  if (error.code === "NOT_FOUND") {
    return {
      type: "not-found",
      entity: stringDetail(error, "entity") ?? inferEntityFromMethod(method),
      id: stringDetail(error, "id") ?? "unknown",
    };
  }

  if (error.code === "VALIDATION_ERROR" || error.code === "BAD_REQUEST") {
    return {
      type: "validation",
      field: stringDetail(error, "field") ?? "request",
      message: error.message,
    };
  }

  return {
    type: "storage",
    message: formatDaemonInvocationError(method, error),
  };
}

export function formatDaemonInvocationError(method: string, error: DaemonConnectionError): string {
  return `${method} failed (${error.code}): ${error.message}`;
}

function inferEntityFromMethod(method: string): string {
  const namespace = method.split(".")[0];
  return namespace.length > 0 ? namespace : "entity";
}

function stringDetail(error: DaemonConnectionError, key: string): string | undefined {
  const value = error.details?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
