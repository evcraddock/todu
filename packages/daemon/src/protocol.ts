import { err, ok, type Result, type ToduError } from "@todu/core";

export const PROTOCOL_ERROR_CODES = [
  "PROTOCOL_MISMATCH",
  "BAD_REQUEST",
  "METHOD_NOT_FOUND",
  "UNSUPPORTED_CAPABILITY",
  "TIMEOUT",
  "DAEMON_UNAVAILABLE",
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "CONFLICT",
  "PRECONDITION_FAILED",
  "JOIN_FAILED",
  "WORKER_NOT_ASSIGNED",
  "INTERNAL_ERROR",
] as const;

export type ProtocolErrorCode = (typeof PROTOCOL_ERROR_CODES)[number];

export type ProtocolFrameId = string;
export type ProtocolParams = Record<string, unknown>;

export interface ProtocolRequestFrame {
  id: ProtocolFrameId;
  method: string;
  params: ProtocolParams;
}

export interface ProtocolSuccessFrame<T = unknown> {
  id: ProtocolFrameId;
  result: T;
}

export interface ProtocolError {
  code: ProtocolErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface ProtocolErrorFrame {
  id: ProtocolFrameId | null;
  error: ProtocolError;
}

export interface ProtocolEventFrame<T = unknown> {
  event: string;
  payload: T;
  ts: string;
}

export function parseProtocolRequestJson(
  payload: string,
): Result<ProtocolRequestFrame, ProtocolError> {
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch (error) {
    return err(
      createProtocolError("BAD_REQUEST", "Protocol payload is not valid JSON", {
        parseError: getErrorMessage(error),
      }),
    );
  }

  return parseProtocolRequestFrame(parsed);
}

export function parseProtocolRequestFrame(
  frame: unknown,
): Result<ProtocolRequestFrame, ProtocolError> {
  if (!isRecord(frame)) {
    return err(
      createProtocolError("BAD_REQUEST", "Protocol request frame must be an object", {
        receivedType: describeValueType(frame),
      }),
    );
  }

  const id = frame.id;
  if (typeof id !== "string" || id.trim().length === 0) {
    return err(
      createProtocolError("BAD_REQUEST", "Protocol request id must be a non-empty string", {
        field: "id",
      }),
    );
  }

  const method = frame.method;
  if (typeof method !== "string" || method.trim().length === 0) {
    return err(
      createProtocolError("BAD_REQUEST", "Protocol request method must be a non-empty string", {
        field: "method",
      }),
    );
  }

  const rawParams = frame.params;
  if (rawParams === undefined) {
    return ok({ id, method, params: {} });
  }

  if (!isRecord(rawParams)) {
    return err(
      createProtocolError("BAD_REQUEST", "Protocol request params must be an object", {
        field: "params",
      }),
    );
  }

  return ok({ id, method, params: rawParams });
}

export function createProtocolSuccessFrame<T>(
  id: ProtocolFrameId,
  result: T,
): ProtocolSuccessFrame<T> {
  return { id, result };
}

export function createProtocolErrorFrame(
  id: ProtocolFrameId | null,
  source: unknown,
): ProtocolErrorFrame {
  return {
    id,
    error: mapErrorToProtocolError(source),
  };
}

export function createProtocolEventFrame<T>(
  event: string,
  payload: T,
  ts: string = new Date().toISOString(),
): ProtocolEventFrame<T> {
  return {
    event,
    payload,
    ts,
  };
}

export function createProtocolError(
  code: ProtocolErrorCode,
  message: string,
  details?: Record<string, unknown>,
): ProtocolError {
  if (details === undefined) {
    return { code, message };
  }

  return { code, message, details };
}

export function mapErrorToProtocolError(source: unknown): ProtocolError {
  if (isProtocolError(source)) {
    return source;
  }

  if (isToduError(source)) {
    return mapToduError(source);
  }

  if (isTimeoutLikeError(source)) {
    return createProtocolError("TIMEOUT", getErrorMessage(source));
  }

  return createProtocolError("INTERNAL_ERROR", getErrorMessage(source));
}

function mapToduError(error: ToduError): ProtocolError {
  switch (error.type) {
    case "not-found":
      return createProtocolError("NOT_FOUND", `${error.entity} not found: ${error.id}`, {
        entity: error.entity,
        id: error.id,
      });
    case "validation":
      return createProtocolError("VALIDATION_ERROR", error.message, {
        field: error.field,
      });
    case "storage":
      return createProtocolError("INTERNAL_ERROR", error.message);
  }
}

function isProtocolError(value: unknown): value is ProtocolError {
  if (!isRecord(value)) {
    return false;
  }

  if (typeof value.code !== "string" || typeof value.message !== "string") {
    return false;
  }

  return isProtocolErrorCode(value.code);
}

function isProtocolErrorCode(value: string): value is ProtocolErrorCode {
  return (PROTOCOL_ERROR_CODES as readonly string[]).includes(value);
}

function isToduError(value: unknown): value is ToduError {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  return value.type === "not-found" || value.type === "validation" || value.type === "storage";
}

function isTimeoutLikeError(value: unknown): boolean {
  if (!(value instanceof Error)) {
    return false;
  }

  return value.name === "TimeoutError";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function describeValueType(value: unknown): string {
  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    return "array";
  }

  return typeof value;
}

function getErrorMessage(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }

  if (typeof value === "string") {
    return value;
  }

  return "Unexpected internal error";
}
