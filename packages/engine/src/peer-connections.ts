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

/** Native roster target reconciliation; observation is opt-in for activated daemon engines. */
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
  const observations = new Set<() => void>();
  return {
    observe(reconcile: () => void): () => void {
      if (closed) return () => {};
      let stopped = false;
      let pending = false;
      const snapshot = (): string => {
        const doc = options.catalog.doc();
        if (!doc) return "";
        return JSON.stringify(
          getDeviceRegistryEntries(doc)
            .filter((device) => device.id !== options.localId)
            .map((device) => [device.id, device.endpoint ?? null, device.removed ?? false])
            .sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
        );
      };
      let previous = snapshot();
      const changed = (): void => {
        if (stopped || closed) return;
        const current = snapshot();
        if (current === previous) return;
        previous = current;
        if (pending) return;
        pending = true;
        queueMicrotask(() => {
          pending = false;
          if (!stopped && !closed) reconcile();
        });
      };
      options.catalog.on("change", changed);
      const stop = (): void => {
        stopped = true;
        options.catalog.off("change", changed);
        observations.delete(stop);
      };
      observations.add(stop);
      return stop;
    },
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
    serverSources(url: string): EnrollmentSource[] {
      return [...links.values()]
        .filter((link) => link.connection.serverBacked && enrollmentSyncUrl(link.source) === url)
        .map((link) => link.source);
    },
    findByUrl(url: string): EnrollmentPeerConnection | undefined {
      return [...links.values()].find(
        (link) => !link.connection.isClosed?.() && enrollmentSyncUrl(link.source) === url,
      )?.connection;
    },
    adoptServer(url: string, connection: EnrollmentPeerConnection): boolean {
      if (closed) throw new Error("Roster connections are closed");
      if (
        [...links.values()].some(
          (link) =>
            link.connection.serverBacked &&
            enrollmentSyncUrl(link.source) === url &&
            link.source.approval.sourceDeviceId !== connection.source.approval.sourceDeviceId,
        )
      )
        throw new Error("Cannot adopt a different native source identity");
      let adopted = false;
      for (const [id, link] of links) {
        if (!link.connection.serverBacked || enrollmentSyncUrl(link.source) !== url) continue;
        const lease = adopted ? connection.retain!() : connection;
        links.set(id, { source: link.source, connection: lease });
        adopted = true;
        link.connection.close();
      }
      return adopted;
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
      for (const stop of observations) stop();
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
