import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import * as asar from "@electron/asar";

export function createValidationEnv({ fixtureDir, parentEnv = process.env }) {
  const env = Object.fromEntries(
    Object.entries(parentEnv).filter(
      ([name]) => !name.startsWith("TODU_") && name !== "ELECTRON_RUN_AS_NODE",
    ),
  );
  return {
    ...env,
    HOME: fixtureDir,
    XDG_CONFIG_HOME: path.join(fixtureDir, "config"),
    XDG_DATA_HOME: path.join(fixtureDir, "data"),
    XDG_CACHE_HOME: path.join(fixtureDir, "cache"),
    APPDATA: path.join(fixtureDir, "config"),
    LOCALAPPDATA: path.join(fixtureDir, "data"),
    ELECTRON_RUN_AS_NODE: "1",
    TODU_CONFIG: path.join(fixtureDir, "config.yaml"),
    TODU_DATA_DIR: path.join(fixtureDir, "data"),
    TODU_DAEMON_SOCKET: path.join(fixtureDir, "daemon.sock"),
    TODU_SYNC_ENABLED: "false",
    TODU_SYNC_SERVER: "",
  };
}

export async function stopValidatedProcess({ child, timeoutMs = 10000 }) {
  if (child.exitCode !== null || child.signalCode !== null) {
    assert.equal(
      child.exitCode,
      0,
      `Packaged process failed: exit=${child.exitCode}, signal=${child.signalCode}`,
    );
    return;
  }
  let timer;
  let forced = false;
  await new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", resolve);
    timer = setTimeout(() => {
      forced = true;
      child.kill("SIGKILL");
    }, timeoutMs);
    child.kill("SIGTERM");
  }).finally(() => clearTimeout(timer));
  if (forced)
    throw new Error(
      "Packaged daemon required forced termination; storage completion is unconfirmed",
    );
  assert.equal(
    child.exitCode,
    0,
    `Packaged daemon failed graceful shutdown: exit=${child.exitCode}, signal=${child.signalCode}`,
  );
}

export function validatePackagedContents({ appPath, rootDir }) {
  asar.uncache(appPath);
  const extract = (name) => asar.extractFile(appPath, name);
  const readJson = (name) => JSON.parse(extract(name).toString());
  const readManifest = (name) =>
    JSON.parse(fs.readFileSync(path.join(rootDir, "packages", name, "package.json"), "utf8"));
  const expected = Object.fromEntries(
    ["electron", "daemon", "core", "engine", "cli"].map((name) => [
      name,
      readManifest(name).version,
    ]),
  );
  expected.electronRuntime = readManifest("electron").devDependencies.electron;
  assert.deepEqual(
    readJson("dist/desktop-runtime.json"),
    expected,
    "Packaged runtime metadata differs from candidate source",
  );
  assert.equal(
    readJson("package.json").version,
    expected.electron,
    "Packaged desktop version mismatch",
  );
  assert.equal(readJson("node_modules/@todu/core/package.json").version, expected.core);
  assert.equal(readJson("node_modules/@todu/engine/package.json").version, expected.engine);
  assert.equal(readJson("node_modules/@automerge/automerge/package.json").version, "3.5.0");
  const files = asar.listPackage(appPath);
  const affected = files.filter((name) =>
    /node_modules\/(sprintf-js|roarr|global-agent|@electron\/get)(\/|$)/.test(name),
  );
  assert.deepEqual(
    affected,
    [],
    "Affected build-tool packages are present in shipped runtime contents",
  );
  for (const name of files.filter((name) => /\.(?:js|cjs|mjs)$/.test(name))) {
    const relativePath = name.replace(/^\//, "");
    const info = asar.statFile(appPath, relativePath, false);
    if (info.files || info.link) continue;
    assert.ok(
      !/sprintf-js|require\(["'](?:roarr|global-agent)["']\)/.test(
        extract(relativePath).toString(),
      ),
      `Affected build-tool reference in shipped JavaScript: ${name}`,
    );
  }
  for (const name of ["entrypoint.js", "runtime.js", "rpc.js", "transport.js", "process.js"]) {
    assert.deepEqual(
      extract(`dist/daemon/${name}`),
      fs.readFileSync(path.join(rootDir, "packages/daemon/dist", name)),
      `Bundled daemon differs from tested build: ${name}`,
    );
  }
  assert.match(
    extract("node_modules/@automerge/automerge-repo/dist/helpers/throttle.js").toString(),
    /Math\.max\(0, lastCall \+ delay - Date\.now\(\)\)/,
    "Bundled Repo save timer repair is missing",
  );
  return expected;
}

function runExecutable({ executablePath, args, env }) {
  const result = spawnSync(executablePath, args, { env, encoding: "utf8", timeout: 10000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, `Packaged executable probe failed: ${result.stderr}`);
  return result.stdout.trim();
}

export async function waitForCatalog({ request, timeoutMs = 10000 }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hello = await request("daemon.hello", { protocolVersion: "1" });
    assert.equal(hello.protocolVersion, "1");
    if (hello.catalog.id) return hello;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(
    "Packaged daemon did not finish opening its catalog before the readiness deadline",
  );
}

function createRpcClient(socket) {
  let buffer = "";
  let sequence = 0;
  const pending = new Map();
  const failPending = (error) => {
    for (const { reject } of pending.values()) reject(error);
    pending.clear();
  };
  socket.on("error", failPending);
  socket.on("close", () => failPending(new Error("Packaged daemon closed the RPC client")));
  socket.on("data", (chunk) => {
    buffer += chunk.toString();
    let newline;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      let frame;
      try {
        frame = JSON.parse(line);
      } catch (error) {
        failPending(error);
        socket.destroy();
        return;
      }
      const request = pending.get(frame.id);
      if (!request) continue;
      pending.delete(frame.id);
      if (frame.error)
        request.reject(new Error(`Packaged RPC failure: ${JSON.stringify(frame.error)}`));
      else request.resolve(frame.result);
    }
  });
  return (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = String(++sequence);
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`Packaged RPC timed out: ${method}`));
      }, 10000);
      pending.set(id, {
        resolve: (value) => {
          clearTimeout(timer);
          resolve(value);
        },
        reject: (error) => {
          clearTimeout(timer);
          reject(error);
        },
      });
      socket.write(`${JSON.stringify({ id, method, params })}\n`);
    });
}

async function connectWhenReady({ socketPath, child, getStderr }) {
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(`Packaged daemon exited before readiness: ${getStderr()}`);
    const socket = net.createConnection(socketPath);
    const connected = await new Promise((resolve) => {
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 100);
      socket.once("connect", () => {
        clearTimeout(timer);
        resolve(true);
      });
      socket.once("error", () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(false);
      });
    });
    if (connected) return socket;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Packaged daemon readiness timed out: ${getStderr()}`);
}

export async function validatePackagedDesktop({ executablePath, appPath, rootDir }) {
  const versions = validatePackagedContents({ appPath, rootDir });
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "todu-desktop-check-"));
  const env = createValidationEnv({ fixtureDir });
  fs.writeFileSync(
    env.TODU_CONFIG,
    "sync:\n  remote:\n    enabled: false\ndaemon:\n  plugins:\n    paths: []\n  workers:\n    assigned: []\n",
  );
  let catalogId;
  let projectId;
  let logs = "";
  let succeeded = false;
  try {
    const runtime = JSON.parse(
      runExecutable({ executablePath, args: ["-p", "JSON.stringify(process.versions)"], env }),
    );
    assert.equal(
      runtime.electron,
      versions.electronRuntime,
      "Packaged Electron runtime differs from approved dependency",
    );
    const cliPath = path.join(
      path.dirname(appPath),
      "cli",
      process.platform === "win32" ? "todu.exe" : "todu",
    );
    const cliVersion = runExecutable({ executablePath: cliPath, args: ["--version"], env });
    assert.equal(cliVersion, versions.cli, "Packaged CLI version mismatch");
    runExecutable({ executablePath: cliPath, args: ["--help"], env });
    for (const reopened of [false, true]) {
      const child = spawn(executablePath, [path.join(appPath, "dist/daemon/entrypoint.js")], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stderr = "";
      let spawnError;
      child.on("error", (error) => {
        spawnError = error;
      });
      child.stderr.on("data", (chunk) => {
        stderr += chunk.toString();
        logs += chunk.toString();
      });
      child.stdout.on("data", (chunk) => {
        logs += chunk.toString();
      });
      let socket;
      try {
        socket = await connectWhenReady({
          socketPath: env.TODU_DAEMON_SOCKET,
          child,
          getStderr: () => stderr || String(spawnError ?? ""),
        });
        const request = createRpcClient(socket);
        const hello = await waitForCatalog({ request });
        if (reopened) {
          assert.equal(
            hello.catalog.id,
            catalogId,
            "Packaged daemon changed catalog after graceful shutdown",
          );
          const projects = await request("project.list");
          assert.ok(
            projects.some(
              (project) =>
                project.id === projectId && project.name === "Desktop bundle persistence fixture",
            ),
            "Packaged daemon did not persist the accepted mutation",
          );
        } else {
          catalogId = hello.catalog.id;
          const project = await request("project.create", {
            input: { name: "Desktop bundle persistence fixture" },
          });
          projectId = project.id;
          assert.ok(projectId, "Packaged mutation returned no project ID");
        }
        await request("events.subscribe", { events: ["data.changed"] });
      } finally {
        try {
          if (!spawnError) await stopValidatedProcess({ child });
        } finally {
          socket?.destroy();
        }
      }
      assert.ok(
        !fs.existsSync(env.TODU_DAEMON_SOCKET),
        "Packaged daemon left its socket after shutdown",
      );
    }
    assert.ok(
      !/UnhandledPromiseRejection|TimeoutNegativeWarning|ENOENT|storage completion is unconfirmed/.test(
        logs,
      ),
      `Packaged lifecycle failure signature: ${logs}`,
    );
    console.log(
      JSON.stringify({
        versions,
        catalogId,
        checks: ["runtime", "contents", "cli", "subscribed-shutdown", "persisted-reopen"],
      }),
    );
    succeeded = true;
  } catch (error) {
    fs.writeFileSync(path.join(fixtureDir, "validation.log"), logs);
    throw new Error(
      `Packaged desktop validation failed; fixture retained at ${fixtureDir}: ${error instanceof Error ? error.message : String(error)}\n${logs}`,
      { cause: error },
    );
  } finally {
    if (succeeded) fs.rmSync(fixtureDir, { recursive: true });
  }
}
