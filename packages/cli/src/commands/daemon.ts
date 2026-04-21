import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveRemoteSyncConfig } from "@todu/core";
import { runDaemonEntrypoint } from "@todu/daemon";
import type { Command } from "commander";
import { getConfigPath, loadConfig, resolveDataDir } from "../config.js";
import {
  type CliDaemonInvoker,
  formatDaemonCommandError,
  resolveDaemonSocketPath,
} from "../daemon-command-client.js";
import {
  resolveDaemonPluginConfig,
  TODU_DAEMON_PLUGIN_CONFIG_ENV,
  TODUAI_DAEMON_PLUGIN_CONFIG_ENV,
} from "../daemon-plugin-config.js";
import {
  resolveDaemonPluginPaths,
  TODU_DAEMON_PLUGIN_PATHS_ENV,
  TODUAI_DAEMON_PLUGIN_PATHS_ENV,
} from "../daemon-plugin-paths.js";
import {
  resolveDaemonAssignedWorkers,
  TODU_DAEMON_ASSIGNED_WORKERS_ENV,
  TODUAI_DAEMON_ASSIGNED_WORKERS_ENV,
} from "../daemon-worker-assignment.js";
import { formatJSON } from "../format.js";

interface DaemonStatusResult {
  role: "node" | "authority";
  state: "stopped" | "starting" | "running" | "stopping";
  healthy: boolean;
  startedAt: string | null;
  transport: {
    kind: "uds";
    path: string;
    mode: number;
  } | null;
  catalog: {
    id: string | null;
  };
}

interface DaemonStatusOutput {
  running: boolean;
  status?: DaemonStatusResult;
  reason?: string;
}

type DaemonLifecycleAction = "start" | "stop" | "restart";
type DaemonLifecycleMode = "direct" | "systemd-user" | "launchd";

interface DaemonLifecycleResult {
  action: DaemonLifecycleAction;
  ok: boolean;
  mode: DaemonLifecycleMode;
  delegated: boolean;
  message: string;
  running?: boolean;
  pid?: number;
  details?: string;
}

interface DaemonCommandContext {
  configPath: string;
  storagePath: string;
  socketPath: string;
  daemonPidPath: string;
  remoteSyncServer: string | null;
  assignedWorkersEnvValue: string | undefined;
  pluginPathsEnvValue: string | undefined;
  pluginConfigEnvValue: string | undefined;
}

const DIRECT_PID_FILENAME = "daemon.pid";
const DIRECT_STDOUT_LOG_FILENAME = "daemon.out.log";
const DIRECT_STDERR_LOG_FILENAME = "daemon.err.log";
const DIRECT_LOG_ROTATION_MAX_BYTES = 10 * 1024 * 1024;
const DIRECT_LOG_ROTATION_KEEP_COUNT = 2;
const SYSTEMD_SERVICE_NAME = "toduai-daemon";
const SYSTEMD_SERVICE_PATH = ".config/systemd/user/toduai-daemon.service";
const LAUNCHD_LABEL = "com.todu.daemon";
const LAUNCHD_PLIST_PATH = "Library/LaunchAgents/com.todu.daemon.plist";
const TODU_DAEMON_LIFECYCLE_MODE_ENV = "TODU_DAEMON_LIFECYCLE_MODE";
const TODUAI_DAEMON_LIFECYCLE_MODE_ENV = "TODUAI_DAEMON_LIFECYCLE_MODE";
const INTERNAL_DAEMON_RUN_SUBCOMMAND = "__run-internal";
const STARTUP_TIMEOUT_MS = 5_000;
const STOP_TIMEOUT_MS = 5_000;

export function registerDaemonCommands(program: Command, invokeDaemon: CliDaemonInvoker): void {
  const daemon = program.command("daemon").description("Manage local daemon lifecycle");

  daemon.command(INTERNAL_DAEMON_RUN_SUBCOMMAND, { hidden: true }).action(async () => {
    await runDaemonEntrypoint();
  });

  daemon
    .command("run")
    .description("Run local daemon in foreground mode")
    .action(async () => {
      const context = resolveDaemonCommandContext(program);
      const child = spawn(
        process.execPath,
        resolveSelfInvocationArgs(["daemon", INTERNAL_DAEMON_RUN_SUBCOMMAND]),
        {
          cwd: process.cwd(),
          stdio: "inherit",
          env: createDaemonChildEnv(context),
        },
      );

      const forwardSigInt = () => {
        child.kill("SIGINT");
      };
      const forwardSigTerm = () => {
        child.kill("SIGTERM");
      };

      process.on("SIGINT", forwardSigInt);
      process.on("SIGTERM", forwardSigTerm);

      try {
        const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
          (resolve, reject) => {
            child.once("error", reject);
            child.once("exit", (code, signal) => {
              resolve({ code, signal });
            });
          },
        );

        if (result.signal) {
          process.exitCode = result.signal === "SIGINT" || result.signal === "SIGTERM" ? 0 : 1;
          return;
        }

        process.exitCode = result.code ?? 1;
      } finally {
        process.off("SIGINT", forwardSigInt);
        process.off("SIGTERM", forwardSigTerm);
      }
    });

  daemon
    .command("status")
    .description("Show daemon availability and health")
    .action(async () => {
      const result = await invokeDaemon<DaemonStatusResult>("daemon.status", {});
      const format = program.opts().format;

      if (!result.ok) {
        if (result.error.code === "DAEMON_UNAVAILABLE") {
          const unavailable: DaemonStatusOutput = {
            running: false,
            reason: result.error.message,
          };

          if (format === "json") {
            console.log(formatJSON(unavailable));
          } else {
            console.log("Daemon: not running");
            console.log(`Reason: ${result.error.message}`);
          }

          return;
        }

        console.error(formatDaemonCommandError(result.error));
        process.exitCode = 1;
        return;
      }

      const running = result.value.state === "running" && result.value.healthy;
      const output: DaemonStatusOutput = {
        running,
        status: result.value,
      };

      if (format === "json") {
        console.log(formatJSON(output));
        return;
      }

      console.log(`Daemon: ${running ? "running" : "not running"}`);
      console.log(`State:  ${result.value.state}`);
      console.log(`Role:   ${result.value.role}`);
      if (result.value.transport?.path) {
        console.log(`Socket: ${result.value.transport.path}`);
      }
      console.log(`Healthy: ${result.value.healthy ? "yes" : "no"}`);
      if (result.value.catalog.id) {
        console.log(`Catalog: ${result.value.catalog.id}`);
      }
    });

  daemon
    .command("start")
    .description("Start daemon via configured service manager or direct fallback")
    .action(async () => {
      await handleLifecycleAction("start", program, invokeDaemon);
    });

  daemon
    .command("stop")
    .description("Stop daemon via configured service manager or direct fallback")
    .action(async () => {
      await handleLifecycleAction("stop", program, invokeDaemon);
    });

  daemon
    .command("restart")
    .description("Restart daemon via configured service manager or direct fallback")
    .action(async () => {
      await handleLifecycleAction("restart", program, invokeDaemon);
    });
}

async function handleLifecycleAction(
  action: DaemonLifecycleAction,
  program: Command,
  invokeDaemon: CliDaemonInvoker,
): Promise<void> {
  const context = resolveDaemonCommandContext(program);
  const format = program.opts().format;

  let mode: DaemonLifecycleMode;
  try {
    mode = resolveLifecycleMode();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const invalidModeResult: DaemonLifecycleResult = {
      action,
      ok: false,
      mode: "direct",
      delegated: false,
      message,
    };

    renderLifecycleResult(invalidModeResult, format);
    process.exitCode = 1;
    return;
  }

  const result = await executeLifecycleAction(action, mode, context, invokeDaemon);
  renderLifecycleResult(result, format);

  if (!result.ok) {
    process.exitCode = 1;
  }
}

function renderLifecycleResult(result: DaemonLifecycleResult, format: string): void {
  if (format === "json") {
    console.log(formatJSON(result));
    return;
  }

  if (!result.ok) {
    console.error(`Error: ${result.message}`);
    console.error(`Mode: ${result.mode}`);
    if (result.details) {
      console.error(`Details: ${result.details}`);
    }
    return;
  }

  console.log(`Daemon ${result.action}: ${result.message}`);
  console.log(`Mode: ${result.mode}${result.delegated ? " (delegated)" : ""}`);
  if (typeof result.running === "boolean") {
    console.log(`Running: ${result.running ? "yes" : "no"}`);
  }
  if (typeof result.pid === "number") {
    console.log(`PID: ${result.pid}`);
  }
  if (result.details) {
    console.log(`Details: ${result.details}`);
  }
}

async function executeLifecycleAction(
  action: DaemonLifecycleAction,
  mode: DaemonLifecycleMode,
  context: DaemonCommandContext,
  invokeDaemon: CliDaemonInvoker,
): Promise<DaemonLifecycleResult> {
  if (mode === "systemd-user") {
    return executeSystemdLifecycleAction(action);
  }

  if (mode === "launchd") {
    return executeLaunchdLifecycleAction(action);
  }

  if (action === "start") {
    return executeDirectStart(action, context, invokeDaemon);
  }

  if (action === "stop") {
    return executeDirectStop(action, context, invokeDaemon, {
      allowUnmanagedRunning: false,
    });
  }

  const stop = await executeDirectStop("restart", context, invokeDaemon, {
    allowUnmanagedRunning: false,
  });
  if (!stop.ok) {
    return stop;
  }

  return executeDirectStart("restart", context, invokeDaemon);
}

function executeSystemdLifecycleAction(action: DaemonLifecycleAction): DaemonLifecycleResult {
  const servicePath = path.join(os.homedir(), SYSTEMD_SERVICE_PATH);

  if (!fs.existsSync(servicePath)) {
    return {
      action,
      ok: false,
      mode: "systemd-user",
      delegated: true,
      message: `systemd user service is not configured at ${servicePath}`,
      details: "Create the service using docs/daemon-service-operations.md or use direct mode.",
    };
  }

  const command = runCommand("systemctl", ["--user", action, SYSTEMD_SERVICE_NAME]);
  if (!command.ok) {
    return {
      action,
      ok: false,
      mode: "systemd-user",
      delegated: true,
      message: `systemctl --user ${action} ${SYSTEMD_SERVICE_NAME} failed`,
      details: command.message,
    };
  }

  return {
    action,
    ok: true,
    mode: "systemd-user",
    delegated: true,
    message: `${action} delegated to systemd user service`,
    details: servicePath,
  };
}

function executeLaunchdLifecycleAction(action: DaemonLifecycleAction): DaemonLifecycleResult {
  const plistPath = path.join(os.homedir(), LAUNCHD_PLIST_PATH);
  const uid = process.getuid?.();

  if (!Number.isInteger(uid)) {
    return {
      action,
      ok: false,
      mode: "launchd",
      delegated: true,
      message: "launchd delegation requires a macOS user session with a numeric uid",
    };
  }

  if (!fs.existsSync(plistPath)) {
    return {
      action,
      ok: false,
      mode: "launchd",
      delegated: true,
      message: `launchd plist is not configured at ${plistPath}`,
      details: "Create the LaunchAgent using docs/daemon-service-operations.md or use direct mode.",
    };
  }

  const domainTarget = `gui/${uid}`;
  const serviceTarget = `${domainTarget}/${LAUNCHD_LABEL}`;

  if (action === "stop") {
    const stop = runCommand("launchctl", ["bootout", domainTarget, plistPath]);
    if (!stop.ok && !isLaunchdAlreadyStopped(stop.message)) {
      return {
        action,
        ok: false,
        mode: "launchd",
        delegated: true,
        message: `launchctl bootout failed for ${serviceTarget}`,
        details: stop.message,
      };
    }

    return {
      action,
      ok: true,
      mode: "launchd",
      delegated: true,
      message: "stop delegated to launchd",
      details: plistPath,
    };
  }

  if (action === "restart") {
    const start = runLaunchdStart(serviceTarget, domainTarget, plistPath);
    if (!start.ok) {
      return {
        action,
        ok: false,
        mode: "launchd",
        delegated: true,
        message: `launchctl restart failed for ${serviceTarget}`,
        details: start.message,
      };
    }

    return {
      action,
      ok: true,
      mode: "launchd",
      delegated: true,
      message: "restart delegated to launchd",
      details: plistPath,
    };
  }

  const start = runLaunchdStart(serviceTarget, domainTarget, plistPath);
  if (!start.ok) {
    return {
      action,
      ok: false,
      mode: "launchd",
      delegated: true,
      message: `launchctl start failed for ${serviceTarget}`,
      details: start.message,
    };
  }

  return {
    action,
    ok: true,
    mode: "launchd",
    delegated: true,
    message: "start delegated to launchd",
    details: plistPath,
  };
}

function runLaunchdStart(
  serviceTarget: string,
  domainTarget: string,
  plistPath: string,
): CommandRunResult {
  const print = runCommand("launchctl", ["print", serviceTarget]);
  if (!print.ok) {
    const bootstrap = runCommand("launchctl", ["bootstrap", domainTarget, plistPath]);
    if (!bootstrap.ok && !isLaunchdAlreadyLoaded(bootstrap.message)) {
      return bootstrap;
    }
  }

  return runCommand("launchctl", ["kickstart", "-k", serviceTarget]);
}

function isLaunchdAlreadyLoaded(message: string): boolean {
  return message.includes("already loaded") || message.includes("service already bootstrapped");
}

function isLaunchdAlreadyStopped(message: string): boolean {
  return message.includes("No such process") || message.includes("Could not find service");
}

function resolveDirectLogPaths(storagePath: string): { stdout: string; stderr: string } {
  return {
    stdout: path.join(storagePath, DIRECT_STDOUT_LOG_FILENAME),
    stderr: path.join(storagePath, DIRECT_STDERR_LOG_FILENAME),
  };
}

function rotateDirectLogFile(filePath: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return;
  }

  if (!stat.isFile() || stat.size < DIRECT_LOG_ROTATION_MAX_BYTES) {
    return;
  }

  safeUnlink(`${filePath}.${DIRECT_LOG_ROTATION_KEEP_COUNT}`);

  for (let index = DIRECT_LOG_ROTATION_KEEP_COUNT - 1; index >= 1; index -= 1) {
    const currentArchivePath = `${filePath}.${index}`;
    const nextArchivePath = `${filePath}.${index + 1}`;

    if (!fs.existsSync(currentArchivePath)) {
      continue;
    }

    fs.renameSync(currentArchivePath, nextArchivePath);
  }

  fs.renameSync(filePath, `${filePath}.1`);
}

async function executeDirectStart(
  action: DaemonLifecycleAction,
  context: DaemonCommandContext,
  invokeDaemon: CliDaemonInvoker,
): Promise<DaemonLifecycleResult> {
  const pidInfo = readDaemonPid(context.daemonPidPath);
  if (pidInfo.pid && isProcessAlive(pidInfo.pid)) {
    const running = await waitForDaemonRunning(invokeDaemon, STARTUP_TIMEOUT_MS);
    if (!running.running) {
      return {
        action,
        ok: false,
        mode: "direct",
        delegated: false,
        message: "managed daemon process exists but daemon socket is not responding",
        pid: pidInfo.pid,
      };
    }

    return {
      action,
      ok: true,
      mode: "direct",
      delegated: false,
      message: "daemon already running",
      running: true,
      pid: pidInfo.pid,
    };
  }

  if (pidInfo.pid && !isProcessAlive(pidInfo.pid)) {
    safeUnlink(context.daemonPidPath);
  }

  const unmanagedRunning = await waitForDaemonRunning(invokeDaemon, 400);
  if (unmanagedRunning.running) {
    return {
      action,
      ok: false,
      mode: "direct",
      delegated: false,
      message: "daemon is running but not managed by direct lifecycle wrapper",
      details: "Use daemon stop via the service manager that started it.",
    };
  }

  fs.mkdirSync(context.storagePath, { recursive: true });

  const directLogPaths = resolveDirectLogPaths(context.storagePath);
  let stdoutFd: number | null = null;
  let stderrFd: number | null = null;

  try {
    rotateDirectLogFile(directLogPaths.stdout);
    rotateDirectLogFile(directLogPaths.stderr);
    stdoutFd = fs.openSync(directLogPaths.stdout, "a");
    stderrFd = fs.openSync(directLogPaths.stderr, "a");
  } catch (error) {
    if (stdoutFd !== null) {
      fs.closeSync(stdoutFd);
    }

    if (stderrFd !== null) {
      fs.closeSync(stderrFd);
    }

    return {
      action,
      ok: false,
      mode: "direct",
      delegated: false,
      message: "failed to open direct daemon log files",
      details: error instanceof Error ? error.message : String(error),
    };
  }

  let daemonProcess: ReturnType<typeof spawn>;
  try {
    daemonProcess = spawn(
      process.execPath,
      resolveSelfInvocationArgs(["daemon", INTERNAL_DAEMON_RUN_SUBCOMMAND]),
      {
        cwd: process.cwd(),
        detached: true,
        stdio: ["ignore", stdoutFd, stderrFd],
        env: createDaemonChildEnv(context),
      },
    );
  } catch (error) {
    fs.closeSync(stdoutFd);
    fs.closeSync(stderrFd);

    return {
      action,
      ok: false,
      mode: "direct",
      delegated: false,
      message: "failed to spawn daemon process",
      details: error instanceof Error ? error.message : String(error),
    };
  }

  fs.closeSync(stdoutFd);
  fs.closeSync(stderrFd);

  const daemonPid = daemonProcess.pid;
  if (!daemonPid) {
    return {
      action,
      ok: false,
      mode: "direct",
      delegated: false,
      message: "failed to spawn daemon process",
    };
  }

  daemonProcess.unref();

  try {
    fs.writeFileSync(context.daemonPidPath, `${daemonPid}\n`, "utf8");
  } catch (error) {
    terminateProcess(daemonPid, "SIGTERM");
    return {
      action,
      ok: false,
      mode: "direct",
      delegated: false,
      message: "failed to write daemon pid file",
      details: error instanceof Error ? error.message : String(error),
    };
  }

  const running = await waitForDaemonRunning(invokeDaemon, STARTUP_TIMEOUT_MS);
  if (!running.running) {
    terminateProcess(daemonPid, "SIGTERM");
    safeUnlink(context.daemonPidPath);

    return {
      action,
      ok: false,
      mode: "direct",
      delegated: false,
      message: "daemon failed to become healthy after start",
      pid: daemonPid,
      details: running.reason,
    };
  }

  return {
    action,
    ok: true,
    mode: "direct",
    delegated: false,
    message: "started managed daemon process",
    running: true,
    pid: daemonPid,
  };
}

async function executeDirectStop(
  action: DaemonLifecycleAction,
  context: DaemonCommandContext,
  invokeDaemon: CliDaemonInvoker,
  options: { allowUnmanagedRunning: boolean } = { allowUnmanagedRunning: true },
): Promise<DaemonLifecycleResult> {
  const pidInfo = readDaemonPid(context.daemonPidPath);

  if (!pidInfo.pid) {
    const running = await waitForDaemonRunning(invokeDaemon, 400);
    if (running.running && !options.allowUnmanagedRunning) {
      return {
        action,
        ok: false,
        mode: "direct",
        delegated: false,
        message: "daemon is running but not managed by direct lifecycle wrapper",
        details: "Stop it through the service manager that started it.",
      };
    }

    return {
      action,
      ok: true,
      mode: "direct",
      delegated: false,
      message: "daemon already stopped",
      running: false,
    };
  }

  if (!isProcessAlive(pidInfo.pid)) {
    safeUnlink(context.daemonPidPath);
    return {
      action,
      ok: true,
      mode: "direct",
      delegated: false,
      message: "removed stale daemon pid file",
      running: false,
    };
  }

  terminateProcess(pidInfo.pid, "SIGTERM");
  const stopped = await waitForProcessExit(pidInfo.pid, STOP_TIMEOUT_MS);
  if (!stopped) {
    terminateProcess(pidInfo.pid, "SIGKILL");
    const killed = await waitForProcessExit(pidInfo.pid, 1_000);
    if (!killed) {
      return {
        action,
        ok: false,
        mode: "direct",
        delegated: false,
        message: `failed to stop managed daemon process ${pidInfo.pid}`,
      };
    }
  }

  safeUnlink(context.daemonPidPath);

  const running = await waitForDaemonRunning(invokeDaemon, 1_000);
  if (running.running) {
    return {
      action,
      ok: false,
      mode: "direct",
      delegated: false,
      message: "daemon socket still responds after managed process stop",
    };
  }

  return {
    action,
    ok: true,
    mode: "direct",
    delegated: false,
    message: "stopped managed daemon process",
    running: false,
  };
}

async function waitForDaemonRunning(
  invokeDaemon: CliDaemonInvoker,
  timeoutMs: number,
): Promise<{ running: boolean; reason?: string }> {
  const deadline = Date.now() + timeoutMs;
  let lastReason: string | undefined;

  while (Date.now() < deadline) {
    const status = await invokeDaemon<DaemonStatusResult>("daemon.status", {});
    if (status.ok) {
      if (status.value.state === "running" && status.value.healthy) {
        return { running: true };
      }

      lastReason = `state=${status.value.state}, healthy=${status.value.healthy ? "yes" : "no"}`;
      await sleep(100);
      continue;
    }

    lastReason = status.error.message;
    await sleep(100);
  }

  return {
    running: false,
    reason: lastReason,
  };
}

async function waitForProcessExit(pid: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) {
      return true;
    }

    await sleep(50);
  }

  return !isProcessAlive(pid);
}

function terminateProcess(pid: number, signal: NodeJS.Signals): void {
  try {
    process.kill(pid, signal);
  } catch {
    // Process may have already exited.
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readDaemonPid(pidPath: string): { pid: number | null } {
  try {
    const raw = fs.readFileSync(pidPath, "utf8").trim();
    if (!raw) {
      return { pid: null };
    }

    const pid = Number.parseInt(raw, 10);
    if (!Number.isInteger(pid) || pid < 1) {
      return { pid: null };
    }

    return { pid };
  } catch {
    return { pid: null };
  }
}

function safeUnlink(filePath: string): void {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // File may already be removed.
  }
}

function resolveDaemonCommandContext(program: Command): DaemonCommandContext {
  const configOpt = program.opts().config as string | undefined;
  const configPath = getConfigPath(configOpt);
  const fileConfig = loadConfig(configPath);
  const storagePath = resolveDataDir(configPath, fileConfig, { env: process.env });
  const remoteSync = resolveRemoteSyncConfig(fileConfig, { env: process.env });
  const assignedWorkers = resolveDaemonAssignedWorkers(fileConfig);
  const pluginPaths = resolveDaemonPluginPaths(configPath, fileConfig);
  const pluginConfig = resolveDaemonPluginConfig(fileConfig);

  return {
    configPath,
    storagePath,
    socketPath: resolveDaemonSocketPath(storagePath),
    daemonPidPath: path.join(storagePath, DIRECT_PID_FILENAME),
    remoteSyncServer: remoteSync?.server ?? null,
    assignedWorkersEnvValue: assignedWorkers.value,
    pluginPathsEnvValue: pluginPaths.value,
    pluginConfigEnvValue: pluginConfig.value,
  };
}

function createDaemonChildEnv(context: DaemonCommandContext): NodeJS.ProcessEnv {
  const childEnv: NodeJS.ProcessEnv = {
    ...process.env,
    TODU_CONFIG: context.configPath,
    TODU_DATA_DIR: context.storagePath,
  };

  delete childEnv.TODUAI_CONFIG;
  delete childEnv.TODUAI_DATA_DIR;

  if (context.remoteSyncServer) {
    childEnv.TODU_SYNC_SERVER = context.remoteSyncServer;
    childEnv.TODU_SYNC_ENABLED = "1";
    delete childEnv.TODUAI_SYNC_SERVER;
    delete childEnv.TODUAI_SYNC_ENABLED;
  }

  if (context.socketPath) {
    childEnv.TODU_DAEMON_SOCKET = context.socketPath;
    delete childEnv.TODUAI_DAEMON_SOCKET;
  }

  if (context.assignedWorkersEnvValue !== undefined) {
    childEnv[TODU_DAEMON_ASSIGNED_WORKERS_ENV] = context.assignedWorkersEnvValue;
    delete childEnv[TODUAI_DAEMON_ASSIGNED_WORKERS_ENV];
  }

  if (context.pluginPathsEnvValue !== undefined) {
    childEnv[TODU_DAEMON_PLUGIN_PATHS_ENV] = context.pluginPathsEnvValue;
    delete childEnv[TODUAI_DAEMON_PLUGIN_PATHS_ENV];
  }

  if (context.pluginConfigEnvValue !== undefined) {
    childEnv[TODU_DAEMON_PLUGIN_CONFIG_ENV] = context.pluginConfigEnvValue;
    delete childEnv[TODUAI_DAEMON_PLUGIN_CONFIG_ENV];
  }

  return childEnv;
}

function resolveSelfInvocationArgs(commandArgs: string[]): string[] {
  const scriptPath = process.argv[1];

  if (scriptPath && isExistingFile(scriptPath)) {
    return [scriptPath, ...commandArgs];
  }

  return commandArgs;
}

function isExistingFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function resolveLifecycleMode(): DaemonLifecycleMode {
  const override =
    process.env[TODU_DAEMON_LIFECYCLE_MODE_ENV]?.trim() ??
    process.env[TODUAI_DAEMON_LIFECYCLE_MODE_ENV]?.trim();

  if (override && override !== "auto") {
    if (override === "direct" || override === "systemd-user" || override === "launchd") {
      return override;
    }

    throw new Error(
      `Invalid ${TODU_DAEMON_LIFECYCLE_MODE_ENV}/${TODUAI_DAEMON_LIFECYCLE_MODE_ENV} value: ${override}. Expected auto, direct, systemd-user, or launchd.`,
    );
  }

  if (
    process.platform === "linux" &&
    fs.existsSync(path.join(os.homedir(), SYSTEMD_SERVICE_PATH))
  ) {
    return "systemd-user";
  }

  if (process.platform === "darwin" && fs.existsSync(path.join(os.homedir(), LAUNCHD_PLIST_PATH))) {
    return "launchd";
  }

  return "direct";
}

interface CommandRunResult {
  ok: boolean;
  message: string;
}

function runCommand(command: string, args: string[]): CommandRunResult {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });

  if (result.error) {
    return {
      ok: false,
      message: result.error.message,
    };
  }

  if (result.status !== 0) {
    const stderr = result.stderr?.trim();
    const stdout = result.stdout?.trim();

    return {
      ok: false,
      message: stderr || stdout || `exit code ${result.status}`,
    };
  }

  return {
    ok: true,
    message: result.stdout?.trim() ?? "",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
