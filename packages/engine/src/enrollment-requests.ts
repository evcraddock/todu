import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import {
  type Device,
  type DeviceId,
  ENROLLMENT_REQUEST_TTL_MS,
  type EnrollmentRequest,
  type EnrollmentRequestId,
  type EnrollmentResponse,
  err,
  isEnrollmentRequestId,
  MAX_ENROLLMENT_BODY_BYTES,
  MAX_ENROLLMENT_REQUESTS,
  ok,
  type Result,
  storageError,
  validateEnrollmentInput,
  validationError,
} from "@todu/core";
import { atomicWriteEnrollmentJson } from "./enrollment-storage.js";

export interface EnrollmentSourceContext {
  catalogId: string;
  deviceId: DeviceId;
}
export interface EnrollmentRequestStore {
  submit(input: unknown): Promise<Result<EnrollmentResponse>>;
  poll(id: EnrollmentRequestId): Promise<Result<EnrollmentResponse>>;
  list(): Promise<Result<EnrollmentRequest[]>>;
  approve(id: EnrollmentRequestId): Promise<Result<EnrollmentResponse>>;
  deny(id: EnrollmentRequestId): Promise<Result<EnrollmentResponse>>;
  handleHttp(request: IncomingMessage, response: ServerResponse): Promise<boolean>;
}

/** Bounded machine-local approval journal; document data is never stored or served here. */
export function createEnrollmentRequestStore(options: {
  storagePath: string;
  getContext(): Promise<EnrollmentSourceContext | null>;
  registerDevice(device: Device, catalogId: string): Promise<Result<Device>>;
  now?: () => number;
}): EnrollmentRequestStore {
  const file = path.join(options.storagePath, "todu-enrollment-requests.json");
  const now = options.now ?? Date.now;
  let records: EnrollmentRequest[] | undefined;
  const approvals = new Map<EnrollmentRequestId, Promise<Result<EnrollmentResponse>>>();

  function load(): EnrollmentRequest[] {
    if (records) return records;
    try {
      if (fs.statSync(file).size > MAX_ENROLLMENT_REQUESTS * MAX_ENROLLMENT_BODY_BYTES)
        throw new Error("Enrollment journal exceeds its size bound");
      const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as EnrollmentRequest[];
      if (
        !Array.isArray(parsed) ||
        parsed.length > MAX_ENROLLMENT_REQUESTS ||
        parsed.some(
          (record) =>
            !validateEnrollmentInput({
              requestId: record.requestId,
              device: record.device,
              expectedCatalogId: record.expectedCatalogId,
            }).ok ||
            typeof record.catalogId !== "string" ||
            !["pending", "approving", "approved", "denied", "expired"].includes(record.state) ||
            !Number.isFinite(Date.parse(record.expiresAt)),
        )
      )
        throw new Error("Invalid local enrollment journal");
      records = parsed;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      records = [];
    }
    return records;
  }
  function save(): void {
    atomicWriteEnrollmentJson(file, load());
  }
  function expire(): void {
    let changed = false;
    for (const record of load()) {
      if (record.state === "pending" && Date.parse(record.expiresAt) <= now()) {
        record.state = "expired";
        changed = true;
      }
    }
    if (changed) save();
  }
  function view(record: EnrollmentRequest): EnrollmentResponse {
    return {
      requestId: record.requestId,
      state: record.state === "approving" ? "pending" : record.state,
      expiresAt: record.expiresAt,
      ...(record.state === "approved" && record.approval
        ? { approval: structuredClone(record.approval) }
        : {}),
    };
  }
  async function context(): Promise<EnrollmentSourceContext> {
    const current = await options.getContext();
    if (!current) throw new Error("No active catalog is available for enrollment");
    return current;
  }
  async function find(id: EnrollmentRequestId): Promise<EnrollmentRequest | undefined> {
    expire();
    const current = await context();
    return load().find(
      (record) => record.requestId === id && record.catalogId === current.catalogId,
    );
  }
  async function guarded<T>(operation: () => Promise<Result<T>>): Promise<Result<T>> {
    try {
      return await operation();
    } catch (error) {
      records = undefined;
      return err(storageError(`Enrollment request operation failed: ${String(error)}`));
    }
  }
  const missing = () =>
    err(
      validationError(
        "requestId",
        "Enrollment request is unknown, expired from retention, or belongs to another catalog",
      ),
    );

  const store: EnrollmentRequestStore = {
    submit: (input) =>
      guarded(async () => {
        const validated = validateEnrollmentInput(input);
        if (!validated.ok) return validated;
        const registration = validated.value;
        if (!registration.device.endpoint)
          return err(
            validationError(
              "device.endpoint",
              "New enrollment requires an advertised listener endpoint",
            ),
          );
        const current = await context();
        if (registration.expectedCatalogId && registration.expectedCatalogId !== current.catalogId)
          return err(
            validationError(
              "expectedCatalogId",
              "This peer has a different dataset; enrollment is refused without replacement",
            ),
          );
        if (registration.device.id === current.deviceId)
          return err(
            validationError(
              "device.id",
              "The source and destination have the same native replica identity",
            ),
          );
        expire();
        const sameId = load().find((record) => record.requestId === registration.requestId);
        const existing =
          sameId ??
          load().find(
            (record) =>
              record.catalogId === current.catalogId &&
              record.device.id === registration.device.id &&
              ["pending", "approving", "approved"].includes(record.state),
          );
        if (existing) {
          if (
            existing.catalogId !== current.catalogId ||
            existing.device.id !== registration.device.id ||
            (existing.expectedCatalogId !== registration.expectedCatalogId &&
              !(
                existing.expectedCatalogId === undefined &&
                registration.expectedCatalogId === current.catalogId
              )) ||
            (existing.state !== "approved" &&
              JSON.stringify(existing.device) !== JSON.stringify(registration.device))
          )
            return err(
              validationError(
                "requestId",
                "Retry metadata differs from the existing enrollment request",
              ),
            );
          if (existing.state === "approving") return store.approve(existing.requestId);
          return ok(view(existing));
        }
        if (load().length >= MAX_ENROLLMENT_REQUESTS) {
          const terminal = load().findIndex((record) =>
            ["approved", "denied", "expired"].includes(record.state),
          );
          if (terminal < 0)
            return err(
              validationError(
                "requests",
                "Enrollment request queue is full; deny or allow existing requests to expire",
              ),
            );
          load().splice(terminal, 1);
        }
        const record: EnrollmentRequest = {
          ...structuredClone(registration),
          catalogId: current.catalogId,
          state: "pending",
          createdAt: new Date(now()).toISOString(),
          expiresAt: new Date(now() + ENROLLMENT_REQUEST_TTL_MS).toISOString(),
        };
        load().push(record);
        save();
        return ok(view(record));
      }),
    poll: (id) =>
      guarded(async () => {
        const record = await find(id);
        if (!record) return missing();
        if (record.state === "approving") return store.approve(id);
        return ok(view(record));
      }),
    list: () =>
      guarded(async () => {
        expire();
        const current = await context();
        return ok(
          structuredClone(load().filter((record) => record.catalogId === current.catalogId)),
        );
      }),
    approve(id) {
      const inFlight = approvals.get(id);
      if (inFlight) return inFlight;
      const operation = guarded(async () => {
        const current = await context();
        expire();
        const record = load().find(
          (candidate) => candidate.requestId === id && candidate.catalogId === current.catalogId,
        );
        if (!record) return missing();
        if (record.state === "approved") return ok(view(record));
        if (!["pending", "approving"].includes(record.state))
          return err(validationError("state", `Cannot approve a ${record.state} request`));
        // Durable intent allows recovery after registry flush or a lost approval response.
        record.state = "approving";
        save();
        const registered = await options.registerDevice(record.device, record.catalogId);
        if (!registered.ok) {
          // Validation refusal made no registry mutation; it must not leave an unresolvable approval intent.
          if (registered.error.type === "validation") {
            const refused = load().find((candidate) => candidate.requestId === id);
            if (refused) {
              refused.state = "denied";
              save();
            }
          }
          return registered;
        }
        if ((await context()).catalogId !== record.catalogId)
          return err(validationError("catalogId", "The active catalog changed during approval"));
        const finalized = load().find((candidate) => candidate.requestId === id);
        if (!finalized || finalized.state !== "approving")
          throw new Error("Durable approval intent is no longer available");
        finalized.approval = {
          catalogId: record.catalogId,
          sourceDeviceId: current.deviceId,
          deviceId: record.device.id,
          syncPath: `/sync/${record.catalogId}`,
        };
        finalized.state = "approved";
        save();
        return ok(view(finalized));
      }).finally(() => {
        approvals.delete(id);
      });
      approvals.set(id, operation);
      return operation;
    },
    deny: (id) =>
      guarded(async () => {
        const record = await find(id);
        if (!record) return missing();
        if (record.state === "approving" || record.state === "approved")
          return err(
            validationError(
              "state",
              "A durable approval cannot be undone by request cleanup; manage membership explicitly",
            ),
          );
        if (record.state === "pending") {
          record.state = "denied";
          save();
        }
        return ok(view(record));
      }),
    async handleHttp(request, response) {
      const match = /^\/enrollment\/requests\/([^/?]+)$/.exec(request.url ?? "");
      if (request.url !== "/enrollment/requests" && !match) return false;
      const send = (status: number, body: unknown): void => {
        if (response.destroyed || response.writableEnded) return;
        response.writeHead(status, {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
          Connection: "close",
        });
        response.end(JSON.stringify(body));
      };
      let result: Result<EnrollmentResponse>;
      if (request.method === "POST" && request.url === "/enrollment/requests") {
        const chunks: Buffer[] = [];
        let length = 0;
        try {
          for await (const chunk of request) {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            length += bytes.length;
            if (length > MAX_ENROLLMENT_BODY_BYTES) {
              send(413, { error: "Enrollment payload is too large" });
              return true;
            }
            chunks.push(bytes);
          }
          result = await store.submit(JSON.parse(Buffer.concat(chunks).toString("utf-8")));
        } catch {
          send(400, { error: "Invalid or incomplete enrollment JSON request" });
          return true;
        }
      } else if (request.method === "GET" && match && isEnrollmentRequestId(match[1])) {
        result = await store.poll(match[1]);
      } else {
        send(405, {
          error: "Only registration POST and request-scoped GET are available; approval is local",
        });
        return true;
      }
      if (result.ok) send(200, result.value);
      else
        send(
          result.error.type === "validation"
            ? result.error.field === "requestId"
              ? 404
              : result.error.field === "requests"
                ? 429
                : 409
            : 503,
          { error: result.error },
        );
      return true;
    },
  };
  return store;
}
