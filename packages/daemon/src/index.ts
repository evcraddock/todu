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
  DAEMON_PROTOCOL_VERSION,
  type DaemonHelloResult,
  type DaemonRpcContext,
  type DaemonRpcRouter,
  DEFAULT_DAEMON_VERSION,
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
