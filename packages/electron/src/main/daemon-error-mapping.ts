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
  if (error.code !== "JOIN_FAILED") {
    return `${method} failed (${error.code}): ${error.message}`;
  }

  const stage = stringDetail(error, "stage");
  const previousCatalogId = stringDetail(error, "previousCatalogId");
  const targetCatalogId = stringDetail(error, "targetCatalogId");
  const cause =
    stringDetail(error, "cause") ??
    stringDetail(error, "switchError") ??
    stringDetail(error, "restoreError");

  const contextParts = [
    stage ? `stage=${stage}` : null,
    previousCatalogId ? `previous=${previousCatalogId}` : null,
    targetCatalogId ? `target=${targetCatalogId}` : null,
  ].filter((value): value is string => value !== null);

  const context = contextParts.length > 0 ? ` (${contextParts.join(", ")})` : "";
  const causeText = cause ? ` Cause: ${cause}` : "";

  return `${method} failed (${error.code}): ${error.message}${context}${causeText}`;
}

function inferEntityFromMethod(method: string): string {
  const namespace = method.split(".")[0];
  return namespace.length > 0 ? namespace : "entity";
}

function stringDetail(error: DaemonConnectionError, key: string): string | undefined {
  const value = error.details?.[key];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}
