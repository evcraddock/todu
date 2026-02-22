export {
  type DaemonProcess,
  type DaemonProcessHooks,
  type StartDaemonProcessOptions,
  startDaemonProcess,
} from "./process.js";
export {
  createProtocolError,
  createProtocolErrorFrame,
  createProtocolEventFrame,
  createProtocolSuccessFrame,
  mapErrorToProtocolError,
  PROTOCOL_ERROR_CODES,
  type ProtocolError,
  type ProtocolErrorCode,
  type ProtocolErrorFrame,
  type ProtocolEventFrame,
  type ProtocolFrameId,
  type ProtocolParams,
  type ProtocolRequestFrame,
  type ProtocolSuccessFrame,
  parseProtocolRequestFrame,
  parseProtocolRequestJson,
} from "./protocol.js";

export {
  createDaemonRpcRouter,
  DAEMON_CAPABILITY_EVENTS,
  DAEMON_CAPABILITY_METHODS,
  DAEMON_PROTOCOL_VERSION,
  type DaemonCapabilityEvent,
  type DaemonHelloResult,
  type DaemonPingResult,
  type DaemonRpcContext,
  type DaemonRpcMethodHandler,
  type DaemonRpcResponse,
  type DaemonRpcRouter,
  type DaemonRuntimeStateSnapshot,
  type DaemonStatusResult,
  type DaemonStatusTransport,
  DEFAULT_DAEMON_REQUEST_TIMEOUT_MS,
  DEFAULT_DAEMON_VERSION,
  type EventsSubscribeResult,
  type EventsUnsubscribeResult,
} from "./rpc.js";

export {
  createDaemonRuntime,
  DAEMON_ROLES,
  type DaemonRole,
  type DaemonRuntime,
  type DaemonRuntimeConfig,
  type DaemonRuntimeState,
  type DaemonRuntimeStatus,
  isDaemonRole,
  type ResolvedDaemonRuntimeConfig,
} from "./runtime.js";

export {
  createUdsTransport,
  DEFAULT_DAEMON_SOCKET_FILENAME,
  DEFAULT_DAEMON_SOCKET_MODE,
  resolveUdsSocketPath,
  type UdsEndpoint,
  type UdsTransport,
  type UdsTransportConfig,
} from "./transport.js";
