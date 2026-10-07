import {
  createDeviceId,
  type Device,
  type DeviceId,
  err,
  ok,
  type Result,
  type ValidationError,
  validationError,
} from "./types.js";
import { validateDeviceEndpoint, validateDeviceName } from "./validation.js";

export type EnrollmentRequestId = string & { readonly __brand: "EnrollmentRequestId" };
export function createEnrollmentRequestId(id: string): EnrollmentRequestId {
  return id as EnrollmentRequestId;
}

export const MAX_ENROLLMENT_BODY_BYTES = 8 * 1024;
export const MAX_ENROLLMENT_REQUESTS = 128;
export const ENROLLMENT_REQUEST_TTL_MS = 10 * 60 * 1000;
export const ENROLLMENT_HTTP_TIMEOUT_MS = 5_000;
export const ENROLLMENT_POLL_INTERVAL_MS = 2_000;

export interface EnrollmentInput {
  requestId: EnrollmentRequestId;
  device: Device;
  expectedCatalogId?: string;
}
export type EnrollmentRequestState = "pending" | "approving" | "approved" | "denied" | "expired";
export interface EnrollmentApproval {
  catalogId: string;
  deviceId: DeviceId;
  sourceDeviceId: DeviceId;
  syncPath: string;
}
export interface EnrollmentRequest extends EnrollmentInput {
  catalogId: string;
  state: EnrollmentRequestState;
  createdAt: string;
  expiresAt: string;
  approval?: EnrollmentApproval;
}
/** Request-scoped HTTP response; never includes a catalog/document body. */
export interface EnrollmentResponse {
  requestId: EnrollmentRequestId;
  state: Exclude<EnrollmentRequestState, "approving">;
  expiresAt: string;
  approval?: EnrollmentApproval;
}
export interface EnrollmentClientStatus {
  stage:
    | "idle"
    | "prepared"
    | "pending"
    | "attaching"
    | "active"
    | "denied"
    | "expired"
    | "error"
    | "cancelled";
  requestId?: EnrollmentRequestId;
  endpoint?: string;
  deviceId?: DeviceId;
  catalogId?: string;
  error?: string;
}

export function isEnrollmentRequestId(value: unknown): value is EnrollmentRequestId {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

export function validateEnrollmentInput(value: unknown): Result<EnrollmentInput, ValidationError> {
  const invalid = (field: string, message: string) => err(validationError(field, message));
  if (
    !isRecord(value) ||
    Object.keys(value).some((key) => !["requestId", "device", "expectedCatalogId"].includes(key))
  ) {
    return invalid("enrollment", "Expected registration metadata only");
  }
  if (!isEnrollmentRequestId(value.requestId))
    return invalid("requestId", "Expected a UUID request ID");
  if (
    !isRecord(value.device) ||
    Object.keys(value.device).some((key) => !["id", "name", "endpoint"].includes(key))
  ) {
    return invalid("device", "Expected native replica ID, name, and optional endpoint only");
  }
  if (typeof value.device.id !== "string" || !/^[a-zA-Z0-9_-]{1,200}$/.test(value.device.id)) {
    return invalid("device.id", "Expected the native persistent replica ID");
  }
  const nameError = validateDeviceName(value.device.name);
  if (nameError) return err(nameError);
  if (value.device.endpoint !== undefined) {
    if (value.device.endpoint === null)
      return invalid("device.endpoint", "Omit an absent endpoint");
    const endpointError = validateDeviceEndpoint(value.device.endpoint);
    if (endpointError) return err(endpointError);
  }
  if (
    value.expectedCatalogId !== undefined &&
    (typeof value.expectedCatalogId !== "string" ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(value.expectedCatalogId))
  ) {
    return invalid(
      "expectedCatalogId",
      "Expected an existing catalog ID or omit it for pristine setup",
    );
  }
  return ok({
    requestId: value.requestId,
    device: {
      id: createDeviceId(value.device.id),
      name: (value.device.name as string).trim(),
      ...(value.device.endpoint !== undefined
        ? { endpoint: new URL(value.device.endpoint as string).origin }
        : {}),
    },
    ...(value.expectedCatalogId !== undefined
      ? { expectedCatalogId: value.expectedCatalogId as string }
      : {}),
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
