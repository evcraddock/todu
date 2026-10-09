import type { DocHandle, Repo } from "@automerge/automerge-repo/slim";
import {
  type CatalogDocument,
  type Device,
  type DeviceId,
  type DeviceRegistryEntry,
  deviceRegistryKey,
  err,
  ok,
  type Result,
  resolveEnrollmentEndpoint,
  type StorageError,
  type SyncListenerConfig,
  storageError,
  type ValidationError,
  validateDeviceEndpoint,
} from "@todu/core";
import type { SyncListenerStatus } from "./todu.js";

export interface ListenerPublicationStatus {
  state: "published" | "manual" | "suppressed" | "unavailable" | "error";
  endpoint?: string;
  error?: string;
}

type PublicationResult<T> = Result<T, StorageError | ValidationError>;

type Ownership =
  | { mode: "manual" }
  | { mode: "automatic"; endpoint: string | null; previous?: string | null };
const OWNERSHIP_NAMESPACE = "todu-listener-endpoint";

/** Manage only this replica's advertisement; ownership is local, not replicated authorization. */
export function createListenerPublication(options: {
  repo: Repo;
  catalog: DocHandle<CatalogDocument>;
  localId: DeviceId;
}) {
  const { repo, catalog, localId } = options;
  const key = `${catalog.documentId}:${localId}`;
  let operation: Promise<unknown> = Promise.resolve();
  let closed = false;

  function control<T>(action: () => Promise<PublicationResult<T>>): Promise<PublicationResult<T>> {
    if (closed) return Promise.resolve(err(storageError("Listener publication is closed")));
    const next = operation
      .then(action)
      .catch((error: unknown) =>
        err(
          storageError(
            `Cannot manage listener endpoint for ${localId} in catalog ${catalog.documentId}: ${String(error)}`,
          ),
        ),
      );
    operation = next;
    return next;
  }

  function entry(): DeviceRegistryEntry {
    const current = catalog.doc()?.[deviceRegistryKey(localId)];
    if (!current || current.removed || current.id !== localId)
      throw new Error(
        "Local device entry is missing or removed; automatic publication cannot reenroll it",
      );
    return current;
  }

  async function loadOwnership(): Promise<Ownership | undefined> {
    const bytes = await repo.storageSubsystem?.load(OWNERSHIP_NAMESPACE, key);
    if (!bytes) return undefined;
    const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof value === "object" && value !== null && "mode" in value) {
      if (value.mode === "manual") return { mode: "manual" };
      if (
        value.mode === "automatic" &&
        "endpoint" in value &&
        (value.endpoint === null || typeof value.endpoint === "string") &&
        (!("previous" in value) || value.previous === null || typeof value.previous === "string")
      )
        return value as Ownership;
    }
    throw new Error(
      "Invalid listener endpoint ownership record; refusing to replace published metadata",
    );
  }

  async function saveOwnership(value: Ownership): Promise<void> {
    if (!repo.storageSubsystem) throw new Error("Listener publication requires persistent storage");
    await repo.storageSubsystem.save(
      OWNERSHIP_NAMESPACE,
      key,
      new TextEncoder().encode(JSON.stringify(value)),
    );
  }

  function owns(value: Ownership | undefined, endpoint: string | null): boolean {
    return (
      value?.mode === "automatic" &&
      (endpoint === value.endpoint ||
        (Object.hasOwn(value, "previous") && endpoint === value.previous))
    );
  }

  function manualStatus(): PublicationResult<ListenerPublicationStatus> {
    const endpoint = entry().endpoint;
    if (!endpoint) return ok({ state: "suppressed" });
    const invalid = validateDeviceEndpoint(endpoint);
    if (invalid || ["0.0.0.0", "[::]"].includes(new URL(endpoint).hostname))
      return err(
        storageError(
          "The published endpoint is not a reachable HTTP(S) base address; use an explicit advertised endpoint override",
        ),
      );
    return ok({ state: "manual", endpoint: new URL(endpoint).origin });
  }

  async function changeEndpoint(endpoint: string | null): Promise<void> {
    entry();
    if ((entry().endpoint ?? null) !== endpoint) {
      catalog.change((doc) => {
        if (endpoint === null) delete doc[deviceRegistryKey(localId)].endpoint;
        else doc[deviceRegistryKey(localId)].endpoint = endpoint;
      });
    }
    await repo.flush([catalog.documentId]);
  }

  async function preserveManual(): Promise<PublicationResult<ListenerPublicationStatus>> {
    await saveOwnership({ mode: "manual" });
    return manualStatus();
  }

  async function managedChange(
    endpoint: string | null,
  ): Promise<PublicationResult<ListenerPublicationStatus>> {
    const previous = entry().endpoint ?? null;
    // Persist intent before mutation; either side of an interrupted write remains recognizable.
    await saveOwnership({ mode: "automatic", endpoint, previous });
    if ((entry().endpoint ?? null) !== previous) return preserveManual();
    await changeEndpoint(endpoint);
    if ((entry().endpoint ?? null) !== endpoint) return preserveManual();
    await saveOwnership({ mode: "automatic", endpoint });
    if ((entry().endpoint ?? null) !== endpoint) return preserveManual();
    return ok(endpoint === null ? { state: "unavailable" } : { state: "published", endpoint });
  }

  return {
    apply(
      listener: SyncListenerStatus,
      configured?: SyncListenerConfig,
    ): Promise<PublicationResult<ListenerPublicationStatus>> {
      return control(async () => {
        const ownership = await loadOwnership();
        const local = catalog.doc()?.[deviceRegistryKey(localId)];
        if (listener.state !== "listening" && (!local || local.removed || local.id !== localId))
          return ok({ state: "unavailable" });
        const current = entry().endpoint ?? null;
        const automatic = owns(ownership, current);
        if (listener.state !== "listening") {
          if (automatic && current !== null) return managedChange(null);
          return ok({ state: "unavailable" });
        }
        if (configured?.advertise !== undefined) {
          const target = resolveEnrollmentEndpoint({
            listener: {
              enabled: true,
              bind: listener.bind,
              port: listener.port,
              advertise: configured.advertise,
            },
          });
          if (!target.ok) return target;
          await saveOwnership({ mode: "manual" });
          await changeEndpoint(target.value);
          return ok({ state: "manual", endpoint: target.value });
        }
        if (!automatic && (ownership !== undefined || current !== null)) return preserveManual();
        const target = resolveEnrollmentEndpoint({
          listener: { enabled: true, bind: listener.bind, port: listener.port },
        });
        if (!target.ok) {
          if (automatic && current !== null) {
            const withdrawn = await managedChange(null);
            if (!withdrawn.ok) return withdrawn;
          }
          return target;
        }
        return managedChange(target.value);
      });
    },
    setEndpoint(endpoint: string | null): Promise<PublicationResult<Device>> {
      return control(async () => {
        entry();
        const invalid = validateDeviceEndpoint(endpoint);
        if (invalid) return err(invalid);
        await saveOwnership({ mode: "manual" });
        await changeEndpoint(endpoint === null ? null : new URL(endpoint).origin);
        const current = entry();
        return ok({
          id: current.id,
          name: current.name,
          ...(current.endpoint ? { endpoint: current.endpoint } : {}),
        });
      });
    },
    async close(): Promise<void> {
      closed = true;
      await operation;
    },
  };
}
