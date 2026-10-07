import { resolveSyncListenerConfig, type SyncListenerConfig } from "./config.js";
import { err, ok, type Result, type ValidationError, validationError } from "./types.js";
import { validateDeviceEndpoint } from "./validation.js";

/** Reuse explicit listener configuration; never discover interfaces or enable networking. */
export function resolveEnrollmentEndpoint(options: {
  listener?: SyncListenerConfig;
  published?: string;
  override?: string;
}): Result<string, ValidationError> {
  const configured = resolveSyncListenerConfig(options.listener);
  if (!configured.ok) return configured;
  if (!configured.value)
    return err(
      validationError(
        "sync.listener",
        "Enrollment requires explicit listener configuration. Enable a trusted-LAN listener before enrolling.",
      ),
    );
  const { bind, port } = configured.value;
  const endpoint =
    options.override ??
    options.published ??
    `http://${bind.includes(":") ? `[${bind}]` : bind}:${port}`;
  const error = validateDeviceEndpoint(endpoint);
  if (error) return err(error);
  const url = new URL(endpoint);
  if (["0.0.0.0", "[::]"].includes(url.hostname))
    return err(
      validationError(
        "device.endpoint",
        "A wildcard binding is not a reachable advertised address. Publish a device endpoint or supply --advertise with a trusted-LAN address.",
      ),
    );
  return ok(url.origin);
}
