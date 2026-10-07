import crypto from "node:crypto";
import { isValidDocumentId } from "@automerge/automerge-repo/slim";
import {
  createEnrollmentRequestId,
  type Device,
  ENROLLMENT_HTTP_TIMEOUT_MS,
  ENROLLMENT_POLL_INTERVAL_MS,
  type EnrollmentApproval,
  type EnrollmentClientStatus,
  type EnrollmentResponse,
  err,
  isEnrollmentRequestId,
  MAX_ENROLLMENT_BODY_BYTES,
  ok,
  type Result,
  storageError,
  validateDeviceEndpoint,
  validationError,
} from "@todu/core";
import {
  type LocalEnrollmentState,
  readEnrollmentState,
  writeEnrollmentState,
} from "./enrollment-storage.js";

export interface EnrollmentClient {
  begin(endpoint: string, signal?: AbortSignal): Promise<Result<EnrollmentClientStatus>>;
  status(): EnrollmentClientStatus;
  cancel(): Promise<Result<EnrollmentClientStatus>>;
  resume(): void;
  stop(): Promise<void>;
}

async function requestEnrollment(options: {
  endpoint: string;
  route: string;
  body?: unknown;
  signal: AbortSignal;
}): Promise<EnrollmentResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Enrollment HTTP request timed out")),
    ENROLLMENT_HTTP_TIMEOUT_MS,
  );
  const onAbort = () => controller.abort(options.signal.reason);
  options.signal.addEventListener("abort", onAbort, { once: true });
  try {
    options.signal.throwIfAborted();
    const response = await fetch(new URL(options.route, options.endpoint), {
      method: options.body ? "POST" : "GET",
      redirect: "error",
      headers: { "Content-Type": "application/json" },
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    if (!response.body) throw new Error("Enrollment source returned no response body");
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.length;
        if (size > MAX_ENROLLMENT_BODY_BYTES)
          throw new Error("Enrollment response exceeds the metadata size limit");
        chunks.push(chunk.value);
      }
    } finally {
      await reader.cancel();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    const body = JSON.parse(new TextDecoder().decode(bytes)) as EnrollmentResponse;
    if (!response.ok)
      throw new Error(
        `Enrollment source refused the request (${response.status}): ${JSON.stringify(body)}`,
      );
    if (
      !body ||
      Object.keys(body).some(
        (key) => !["requestId", "state", "expiresAt", "approval"].includes(key),
      ) ||
      !isEnrollmentRequestId(body.requestId) ||
      !["pending", "approved", "denied", "expired"].includes(body.state) ||
      !Number.isFinite(Date.parse(body.expiresAt))
    )
      throw new Error("Enrollment source returned invalid request metadata");
    return body;
  } finally {
    clearTimeout(timeout);
    options.signal.removeEventListener("abort", onAbort);
  }
}

function validateApproval(
  approval: EnrollmentApproval | undefined,
  device: Device,
  catalogId: string | null,
): Result<EnrollmentApproval> {
  if (
    !approval ||
    typeof approval !== "object" ||
    Array.isArray(approval) ||
    Object.keys(approval).some(
      (key) => !["catalogId", "deviceId", "sourceDeviceId", "syncPath"].includes(key),
    ) ||
    typeof approval.catalogId !== "string" ||
    !isValidDocumentId(approval.catalogId) ||
    approval.deviceId !== device.id ||
    typeof approval.sourceDeviceId !== "string" ||
    !/^[a-zA-Z0-9_-]{1,200}$/.test(approval.sourceDeviceId) ||
    approval.sourceDeviceId === device.id ||
    approval.syncPath !== `/sync/${approval.catalogId}`
  )
    return err(
      validationError(
        "approval",
        "Source returned invalid catalog, replica identity, or sync route",
      ),
    );
  if (catalogId && approval.catalogId !== catalogId)
    return err(
      validationError(
        "catalogId",
        "Different initialized dataset; enrollment cannot replace or merge it",
      ),
    );
  return ok(approval);
}

/** One bounded managed enrollment workflow; native transport starts only after approval. */
export function createEnrollmentClient(options: {
  storagePath: string;
  getDevice(): Promise<Device>;
  getCatalogId(): string | null;
  activate(
    source: { endpoint: string; approval: EnrollmentApproval },
    signal: AbortSignal,
  ): Promise<void>;
  logger?: { warn(message: string, context?: Record<string, unknown>): void };
}): EnrollmentClient {
  let state = readEnrollmentState(options.storagePath);
  let transient: EnrollmentClientStatus = state?.status ?? { stage: "idle" };
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let operation: Promise<Result<EnrollmentClientStatus>> | null = null;
  let controller: AbortController | null = null;

  function save(next: LocalEnrollmentState): void {
    writeEnrollmentState(options.storagePath, next);
    state = next;
    transient = next.status;
  }
  function schedule(): void {
    if (
      stopped ||
      timer ||
      !state?.status.requestId ||
      !["pending", "attaching", "error"].includes(state.status.stage)
    )
      return;
    timer = setTimeout(() => {
      timer = undefined;
      if (operation) {
        schedule();
        return;
      }
      operation = performPoll().finally(() => {
        operation = null;
        schedule();
      });
    }, ENROLLMENT_POLL_INTERVAL_MS);
    timer.unref();
  }
  async function accept(
    response: EnrollmentResponse,
    endpoint: string,
    device: Device,
    signal: AbortSignal,
    deferActivation = false,
  ): Promise<EnrollmentClientStatus> {
    const existingCatalog = options.getCatalogId();
    const previous = state ?? {
      version: 1 as const,
      mode: existingCatalog ? ("active" as const) : ("pending" as const),
      status: { stage: "prepared" as const },
    };
    const status: EnrollmentClientStatus = {
      stage: response.state === "approved" ? "attaching" : response.state,
      endpoint,
      deviceId: device.id,
      requestId: response.requestId,
      ...(existingCatalog ? { catalogId: existingCatalog } : {}),
    };
    // Validate approval against the live dataset before any state or adapter mutation.
    const approval =
      response.state === "approved"
        ? validateApproval(response.approval, device, existingCatalog)
        : null;
    if (approval && !approval.ok)
      throw new Error(
        approval.error.type === "validation"
          ? approval.error.message
          : JSON.stringify(approval.error),
      );
    save({ ...previous, status, ...(approval?.ok ? { approval: approval.value } : {}) });
    if (approval?.ok && !deferActivation) {
      await options.activate({ endpoint, approval: approval.value }, signal);
      signal.throwIfAborted();
      const committed = readEnrollmentState(options.storagePath);
      save({
        ...(committed ?? previous),
        version: 1,
        mode: "active",
        approval: approval.value,
        connection: { endpoint, approval: approval.value },
        status: { ...status, stage: "active", catalogId: approval.value.catalogId },
      });
    }
    return transient;
  }
  async function performPoll(): Promise<Result<EnrollmentClientStatus>> {
    if (!state?.status.requestId || !state.status.endpoint) return ok(transient);
    controller = new AbortController();
    try {
      const current = state;
      const device = await options.getDevice();
      const response = await requestEnrollment({
        endpoint: current.status.endpoint!,
        route: `/enrollment/requests/${current.status.requestId}`,
        signal: controller.signal,
      });
      if (response.requestId !== current.status.requestId)
        throw new Error("Enrollment source changed the request ID while polling");
      return ok(await accept(response, current.status.endpoint!, device, controller.signal));
    } catch (error) {
      if (!controller.signal.aborted && state) {
        transient = { ...state.status, stage: "error", error: String(error) };
        try {
          save({ ...state, status: transient });
        } catch (saveError) {
          options.logger?.warn("enrollment status persistence failed", {
            error: String(saveError),
          });
        }
        options.logger?.warn("enrollment attempt failed", { error: String(error) });
      }
      return err(storageError(`Enrollment attempt failed: ${String(error)}`));
    } finally {
      controller = null;
    }
  }
  const client: EnrollmentClient = {
    async begin(endpoint, signal) {
      const endpointError = validateDeviceEndpoint(endpoint);
      if (endpointError) return err(endpointError);
      if (stopped || operation)
        return err(
          validationError("enrollment", "An enrollment operation is already running or stopping"),
        );
      const base = new URL(endpoint).origin;
      controller = new AbortController();
      const currentController = controller;
      const abort = () => currentController.abort(signal?.reason);
      signal?.addEventListener("abort", abort, { once: true });
      operation = (async () => {
        try {
          signal?.throwIfAborted();
          const device = await options.getDevice();
          const catalogId = options.getCatalogId();
          if (
            state?.status.stage === "active" &&
            state.connection?.endpoint === base &&
            state.connection.approval.catalogId === catalogId &&
            state.status.deviceId === device.id
          )
            return ok(state.status);
          const requestId =
            state?.status.endpoint === base &&
            state.status.requestId &&
            !["denied", "expired", "cancelled"].includes(state.status.stage)
              ? state.status.requestId
              : createEnrollmentRequestId(crypto.randomUUID());
          const response = await requestEnrollment({
            endpoint: base,
            route: "/enrollment/requests",
            body: { requestId, device, ...(catalogId ? { expectedCatalogId: catalogId } : {}) },
            signal: currentController.signal,
          });
          return ok(await accept(response, base, device, currentController.signal, true));
        } catch (error) {
          // A source mismatch/refusal must not create metadata or modify existing storage.
          transient = { ...(state?.status ?? { stage: "idle" }), error: String(error) };
          return err(storageError(`Cannot request enrollment: ${String(error)}`));
        } finally {
          signal?.removeEventListener("abort", abort);
          controller = null;
        }
      })();
      try {
        return await operation;
      } finally {
        operation = null;
        schedule();
      }
    },
    status: () => structuredClone(transient),
    async cancel() {
      if (state?.status.stage === "active")
        return err(
          validationError(
            "enrollment",
            "Enrollment is already active; cancellation cannot remove data or membership",
          ),
        );
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      controller?.abort(new Error("Enrollment cancelled locally"));
      await operation;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      const committed = readEnrollmentState(options.storagePath);
      if (committed?.status.stage === "active") {
        state = committed;
        transient = committed.status;
        return err(
          validationError(
            "enrollment",
            "Enrollment became active before cancellation; data and membership are retained",
          ),
        );
      }
      if (state)
        save({ ...state, status: { ...state.status, stage: "cancelled", error: undefined } });
      return ok(transient);
    },
    resume: () => schedule(),
    async stop() {
      stopped = true;
      if (timer) {
        clearTimeout(timer);
        timer = undefined;
      }
      controller?.abort(new Error("Daemon is stopping enrollment"));
      await operation;
    },
  };
  return client;
}
