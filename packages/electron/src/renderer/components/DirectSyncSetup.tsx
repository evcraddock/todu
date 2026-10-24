import type { EnrollmentClientStatus, EnrollmentRequest } from "@todu/core";
import { useEffect, useRef, useState } from "react";

const stageMessages: Record<EnrollmentClientStatus["stage"], string> = {
  idle: "Ready to request a connection.",
  prepared: "Ready to connect to an existing dataset.",
  pending:
    "Waiting for approval on the other computer. Open Sync there and choose ‘Connect another computer to this data’ to approve this request.",
  attaching: "Approved. Connecting to the shared dataset...",
  active:
    "Approved and connected to the shared dataset. This does not mean all data has finished syncing.",
  denied: "The other computer denied this request.",
  expired: "The request expired. You can request a connection again.",
  error: "The connection could not be completed.",
  cancelled: "The connection request was cancelled.",
};

export function DirectSyncSetup({
  listenerReady,
  onSetup,
  onConnected,
}: {
  listenerReady: boolean;
  onSetup(): void;
  onConnected(): void;
}) {
  const [endpoint, setEndpoint] = useState("");
  const [status, setStatus] = useState<EnrollmentClientStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);
  const revision = useRef(0);
  const busyRef = useRef(false);
  const active = status?.stage === "pending" || status?.stage === "attaching";

  useEffect(() => {
    let disposed = false;
    let polling = false;
    const refresh = async () => {
      if (polling || busyRef.current) return;
      polling = true;
      const current = revision.current;
      try {
        const next = await window.todu.sync.enrollmentStatus();
        if (!disposed && current === revision.current) {
          setStatus(next);
          setPollError(null);
        }
      } catch {
        if (!disposed && current === revision.current)
          setPollError("Unable to refresh connection progress. Retrying...");
      } finally {
        polling = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (status?.stage === "active") onConnected();
  }, [status?.stage, onConnected]);

  const act = async (action: () => Promise<EnrollmentClientStatus>) => {
    revision.current++;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      setStatus(await action());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div>
      <ol>
        <li>Keep the daemon running on both computers.</li>
        <li>Enable Direct Sync on both computers. Apply any pending change from the Status tab.</li>
        <li>Copy the other computer’s direct address from its sharing panel and enter it below.</li>
        <li>Request a connection, then approve it on the other computer.</li>
      </ol>
      <p className="settings-hint">
        The other computer shares its catalog ID during enrollment. An existing different dataset
        cannot be replaced or merged through this flow.
      </p>
      {!listenerReady && (
        <div className="settings-hint">
          <p>Enable and apply Direct Sync on this computer before requesting a connection.</p>
          <button type="button" className="btn btn-sm" onClick={onSetup}>
            Set up Direct Sync
          </button>
        </div>
      )}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void act(() => window.todu.sync.enroll(endpoint.trim()));
        }}
      >
        <label className="form-label" htmlFor="direct-peer-address">
          Other computer’s direct address
        </label>
        <div className="settings-key-input-row">
          <input
            id="direct-peer-address"
            type="url"
            required
            className="input settings-key-input"
            placeholder="http://192.168.1.20:24377"
            value={endpoint}
            disabled={busy || active}
            onChange={(event) => setEndpoint(event.target.value)}
          />
          <button
            type="submit"
            className="btn btn-primary btn-sm"
            disabled={!listenerReady || !endpoint.trim() || busy || active}
          >
            {busy ? "Working..." : "Request connection"}
          </button>
        </div>
      </form>
      {status && (
        <div className="settings-hint" role="status">
          <p>{stageMessages[status.stage]}</p>
          {status.endpoint && <p>Computer: {status.endpoint}</p>}
          {status.catalogId && (
            <p>
              Shared dataset: <code>{status.catalogId}</code>
            </p>
          )}
        </div>
      )}
      {active && (
        <button
          type="button"
          className="btn btn-sm"
          disabled={busy}
          onClick={() => void act(() => window.todu.sync.enrollmentCancel())}
        >
          Cancel request
        </button>
      )}
      {(error || status?.error) && (
        <p className="settings-oauth-error" role="alert">
          {error ?? status?.error}
        </p>
      )}
      {pollError && (
        <p className="settings-hint" role="status">
          {pollError}
        </p>
      )}
    </div>
  );
}

export function DirectSyncRequests() {
  const [requests, setRequests] = useState<EnrollmentRequest[]>([]);
  const [busy, setBusy] = useState(false);
  const [pollError, setPollError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const revision = useRef(0);
  const busyRef = useRef(false);
  useEffect(() => {
    let disposed = false;
    let polling = false;
    const refresh = async () => {
      if (polling || busyRef.current) return;
      polling = true;
      const current = revision.current;
      try {
        const next = await window.todu.sync.enrollmentRequests();
        if (!disposed && current === revision.current) {
          setRequests(next);
          setLoaded(true);
          setPollError(null);
        }
      } catch {
        if (!disposed) setPollError("Connection requests unavailable.");
      } finally {
        polling = false;
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    return () => {
      disposed = true;
      clearInterval(timer);
    };
  }, []);

  const decide = async (id: string, approve: boolean) => {
    revision.current++;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await (approve
        ? window.todu.sync.enrollmentApprove(id)
        : window.todu.sync.enrollmentDeny(id));
      setRequests(await window.todu.sync.enrollmentRequests());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };
  const pending = requests.filter(
    (request) => request.state === "pending" || request.state === "approving",
  );
  return (
    <div className="sync-incoming-requests">
      <h4>Connection requests</h4>
      <p className="settings-hint">
        Approve only the computer you intend to share this dataset with.
      </p>
      {!loaded && !error && !pollError && <p className="settings-hint">Loading requests...</p>}
      {loaded && pending.length === 0 && (
        <p className="settings-hint">No pending connection requests.</p>
      )}
      {pending.map((request) => (
        <div key={request.requestId} className="settings-device-row">
          <div>
            <strong>{request.device.name}</strong>
            <div className="settings-device-id">{request.device.id}</div>
            <div>{request.device.endpoint}</div>
          </div>
          <div className="settings-key-input-row">
            <button
              type="button"
              className="btn btn-primary btn-sm"
              disabled={busy || request.state === "approving"}
              onClick={() => void decide(request.requestId, true)}
            >
              {request.state === "approving" ? "Approving..." : "Approve"}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              disabled={busy || request.state === "approving"}
              onClick={() => void decide(request.requestId, false)}
            >
              Deny
            </button>
          </div>
        </div>
      ))}
      {(error || pollError) && (
        <p className="settings-oauth-error" role="alert">
          {error ?? pollError}
        </p>
      )}
    </div>
  );
}
