import type { DocHandle, Repo } from "@automerge/automerge-repo/slim";
import {
  type CatalogDocument,
  type DeviceId,
  err,
  getDeviceRegistryEntries,
  ok,
  type Result,
  storageError,
  validateDeviceEndpoint,
} from "@todu/core";
import {
  createEnrollmentPeerConnection,
  type EnrollmentPeerConnection,
  type EnrollmentSource,
  enrollmentSyncUrl,
} from "./enrollment-peer.js";
import type { SyncAdapterEventLogger } from "./sync-client.js";

export interface PeerReloadReport {
  added: number;
  removed: number;
  retained: number;
  errors: string[];
}

/** Snapshot-to-adapter wiring only; no roster subscription or additional retry scheduler. */
export function createRosterPeerConnections(options: {
  catalog: DocHandle<CatalogDocument>;
  repo: Repo;
  localId: DeviceId;
  logger?: SyncAdapterEventLogger;
  existing(source: EnrollmentSource): EnrollmentPeerConnection | undefined;
}) {
  const links = new Map<
    DeviceId,
    { source: EnrollmentSource; connection: EnrollmentPeerConnection }
  >();
  let closed = false;
  return {
    reload(): Result<PeerReloadReport> {
      if (closed) return err(storageError("Cannot reload roster peers after engine shutdown"));
      const doc = options.catalog.doc();
      if (!doc) return err(storageError("Cannot reload peers: active catalog is unavailable"));
      const report: PeerReloadReport = { added: 0, removed: 0, retained: 0, errors: [] };
      const targets = new Map<DeviceId, EnrollmentSource>();
      for (const device of getDeviceRegistryEntries(doc)) {
        if (device.id === options.localId || device.removed || !device.endpoint) continue;
        const invalid = validateDeviceEndpoint(device.endpoint);
        if (invalid || ["0.0.0.0", "[::]"].includes(new URL(device.endpoint).hostname)) {
          report.errors.push(`Device ${device.id}: invalid advertised listener endpoint`);
          continue;
        }
        targets.set(device.id, {
          endpoint: new URL(device.endpoint).origin,
          approval: {
            catalogId: options.catalog.documentId,
            deviceId: options.localId,
            sourceDeviceId: device.id,
            syncPath: `/sync/${options.catalog.documentId}`,
          },
        });
      }
      for (const [id, link] of links) {
        const target = targets.get(id);
        if (
          !target ||
          link.connection.isClosed?.() ||
          enrollmentSyncUrl(target) !== enrollmentSyncUrl(link.source)
        ) {
          link.connection.close();
          links.delete(id);
          report.removed++;
        }
      }
      for (const [id, source] of targets) {
        if (links.has(id)) {
          report.retained++;
          continue;
        }
        try {
          const existing = options.existing(source);
          const connection =
            existing ??
            createEnrollmentPeerConnection({ repo: options.repo, source, logger: options.logger });
          links.set(id, { source, connection });
          if (existing) report.retained++;
          else report.added++;
        } catch (error) {
          report.errors.push(`Device ${id}: cannot attach native peer: ${String(error)}`);
        }
      }
      for (const error of report.errors)
        options.logger?.warn("roster peer reload warning", { error });
      return ok(report);
    },
    find(source: EnrollmentSource): EnrollmentPeerConnection | undefined {
      const link = links.get(source.approval.sourceDeviceId);
      return link &&
        !link.connection.isClosed?.() &&
        enrollmentSyncUrl(link.source) === enrollmentSyncUrl(source)
        ? link.connection
        : undefined;
    },
    release(url: string): void {
      for (const [id, link] of links) {
        if (enrollmentSyncUrl(link.source) !== url) continue;
        link.connection.close();
        links.delete(id);
      }
    },
    close(): void {
      if (closed) return;
      closed = true;
      const errors: unknown[] = [];
      for (const link of links.values()) {
        try {
          link.connection.close();
        } catch (error) {
          errors.push(error);
        }
      }
      links.clear();
      if (errors.length) throw new AggregateError(errors, "Cannot close roster peer connections");
    },
  };
}
