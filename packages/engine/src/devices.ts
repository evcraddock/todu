import os from "node:os";
import type { DocHandle, Repo } from "@automerge/automerge-repo/slim";
import {
  type CatalogDocument,
  createDeviceId,
  type Device,
  type DeviceId,
  deviceRegistryKey,
  err,
  getDeviceRegistryEntries,
  notFound,
  ok,
  type Result,
  validateDeviceEndpoint,
  validateDeviceName,
  validationError,
} from "@todu/core";
import type { DeviceNamespace } from "./todu.js";

const REGISTRY_RECEIPT_NAMESPACE = "todu-device-registry";

/** Mark staging locally before fetching; it cannot become upgrade enrollment on restart. */
export async function markPendingDeviceRegistry(repo: Repo, catalogId: string): Promise<void> {
  const storage = repo.storageSubsystem;
  if (!storage) return;
  const receipt = await storage.load(REGISTRY_RECEIPT_NAMESPACE, catalogId);
  if (!receipt) {
    await storage.save(REGISTRY_RECEIPT_NAMESPACE, catalogId, new TextEncoder().encode("pending"));
  }
}

/** Enroll only normal established storage, never pending or ephemeral Repos. */
export async function initializeDeviceRegistry(options: {
  repo: Repo;
  catalog: DocHandle<CatalogDocument>;
}): Promise<void> {
  const { repo, catalog } = options;
  const storage = repo.storageSubsystem;
  const storageId = await repo.storageId();
  if (!storage || !storageId) return;
  const receipt = await storage.load(REGISTRY_RECEIPT_NAMESPACE, catalog.documentId);
  if (receipt) return;
  const id = createDeviceId(storageId);
  if (!catalog.doc()?.[deviceRegistryKey(id)]) {
    catalog.change((doc) => {
      doc[deviceRegistryKey(id)] = { id, name: os.hostname() || "Unnamed device" };
    });
  }
  // Persist membership before the local receipt, so a failed write can be retried safely.
  await repo.flush([catalog.documentId]);
  await storage.save(
    REGISTRY_RECEIPT_NAMESPACE,
    catalog.documentId,
    new TextEncoder().encode("initialized"),
  );
}

function cloneDevice(device: Device): Device {
  return {
    id: device.id,
    name: device.name,
    ...(device.endpoint !== undefined ? { endpoint: device.endpoint } : {}),
  };
}

export function createDeviceNamespace(options: {
  catalog: DocHandle<CatalogDocument>;
  localDeviceId?: DeviceId;
}): DeviceNamespace {
  const { catalog, localDeviceId } = options;

  function getDevice(id: DeviceId): Result<Device> {
    const device = catalog.doc()?.[deviceRegistryKey(id)];
    if (!device || device.removed) return err(notFound("device", id));
    return ok(cloneDevice(device));
  }

  return {
    async localId() {
      if (!localDeviceId)
        return err(validationError("id", "Ephemeral clients have no persistent device ID"));
      return ok(localDeviceId);
    },
    async list() {
      const doc = catalog.doc();
      if (!doc) return err(notFound("catalog", catalog.documentId));
      return ok(
        getDeviceRegistryEntries(doc)
          .filter((entry) => !entry.removed)
          .map(cloneDevice)
          .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
      );
    },
    async rename(id, name) {
      const error = validateDeviceName(name);
      if (error) return err(error);
      const device = getDevice(id);
      if (!device.ok) return device;
      catalog.change((doc) => {
        doc[deviceRegistryKey(id)].name = name.trim();
      });
      return getDevice(id);
    },
    async setEndpoint(id, endpoint) {
      const error = validateDeviceEndpoint(endpoint);
      if (error) return err(error);
      const device = getDevice(id);
      if (!device.ok) return device;
      catalog.change((doc) => {
        if (endpoint === null) delete doc[deviceRegistryKey(id)].endpoint;
        else doc[deviceRegistryKey(id)].endpoint = new URL(endpoint).origin;
      });
      return getDevice(id);
    },
    async remove(id) {
      const device = getDevice(id);
      if (!device.ok) return device;
      // Keep a native replicated tombstone so older/offline replicas cannot self-enroll again.
      catalog.change((doc) => {
        doc[deviceRegistryKey(id)].removed = true;
      });
      return ok(undefined);
    },
  };
}
