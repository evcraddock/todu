import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { parse } from "yaml";

const rootDir = path.resolve(import.meta.dirname, "..");
const temporaryDirs: string[] = [];
const workflow = readFileSync(path.join(rootDir, ".github/workflows/release.yml"), "utf8");
const manifest = JSON.parse(
  readFileSync(path.join(rootDir, "packages/electron/package.json"), "utf8"),
);
const rootManifest = JSON.parse(readFileSync(path.join(rootDir, "package.json"), "utf8"));
const config = parse(
  readFileSync(path.join(rootDir, "packages/electron/electron-builder.yml"), "utf8"),
);
const ci = parse(readFileSync(path.join(rootDir, ".github/workflows/ci.yml"), "utf8"));
const release = parse(workflow);
const makefile = readFileSync(path.join(rootDir, "Makefile"), "utf8");

afterEach(() => {
  for (const directory of temporaryDirs.splice(0)) rmSync(directory, { recursive: true });
});

function releaseFixture(): string {
  const directory = mkdtempSync(path.join(os.tmpdir(), "todu-desktop-release-"));
  temporaryDirs.push(directory);
  writeFileSync(
    path.join(directory, "package.json"),
    JSON.stringify({ version: "1.2.3", private: true }),
  );
  for (const name of ["electron", "cli", "daemon", "core", "engine"]) {
    mkdirSync(path.join(directory, "packages", name), { recursive: true });
    writeFileSync(
      path.join(directory, "packages", name, "package.json"),
      JSON.stringify({
        version: name === "electron" ? "1.2.3" : "4.5.6",
        private: name === "electron",
      }),
    );
  }
  return directory;
}

async function packagedFixture() {
  const directory = releaseFixture();
  const appDir = path.join(directory, "app");
  const appPath = path.join(directory, "app.asar");
  const write = (name: string, content: string) => {
    mkdirSync(path.dirname(path.join(appDir, name)), { recursive: true });
    writeFileSync(path.join(appDir, name), content);
  };
  writeFileSync(
    path.join(directory, "packages/electron/package.json"),
    JSON.stringify({ version: "1.2.3", private: true, devDependencies: { electron: "41.10.7" } }),
  );
  write("package.json", JSON.stringify({ version: "1.2.3" }));
  write("node_modules/bignumber.js/index.js", "// Package directories may end in .js\n");
  write(
    "dist/desktop-runtime.json",
    JSON.stringify({
      electron: "1.2.3",
      daemon: "4.5.6",
      core: "4.5.6",
      engine: "4.5.6",
      cli: "4.5.6",
      electronRuntime: "41.10.7",
    }),
  );
  for (const name of ["core", "engine"])
    write(`node_modules/@todu/${name}/package.json`, JSON.stringify({ version: "4.5.6" }));
  write("node_modules/@automerge/automerge/package.json", JSON.stringify({ version: "3.5.0" }));
  write(
    "node_modules/@automerge/automerge-repo/dist/helpers/throttle.js",
    "Math.max(0, lastCall + delay - Date.now())",
  );
  mkdirSync(path.join(directory, "packages/daemon/dist"));
  for (const name of ["entrypoint.js", "runtime.js", "rpc.js", "transport.js", "process.js"]) {
    write(`dist/daemon/${name}`, `// Fixture ${name}\n`);
    writeFileSync(path.join(directory, "packages/daemon/dist", name), `// Fixture ${name}\n`);
  }
  const pack = () => {
    // The ASAR API resolves before its writable finishes; CLI exit drains fixture writes.
    const result = spawnSync(
      process.execPath,
      [path.join(rootDir, "node_modules/@electron/asar/bin/asar.js"), "pack", appDir, appPath],
      { encoding: "utf8" },
    );
    expect(result.status, result.stderr).toBe(0);
  };
  await pack();
  return { directory, appPath, write, pack };
}

function validateTag(tag: string, directory: string) {
  return spawnSync(
    process.execPath,
    [path.join(rootDir, "scripts/validate-desktop-release.mjs"), tag, "--root-dir", directory],
    { encoding: "utf8" },
  );
}

describe("desktop release metadata", () => {
  it("uses one exact Electron dependency without a packaging override", () => {
    expect(manifest.devDependencies.electron).toMatch(/^\d+\.\d+\.\d+$/);
    expect(rootManifest.devDependencies.electron).toBeUndefined();
    expect(config.electronVersion).toBeUndefined();
  });

  it("selects the matching architecture CLI instead of the build host binary", () => {
    expect(config.extraResources).toBeUndefined();
    expect(config.linux.extraResources[0].from).toMatch(
      /^\.\.\/\.\.\/dist\/cli\/todu-cli-linux-\$\{arch\}$/,
    );
    expect(config.mac.extraResources[0].from).toMatch(
      /^\.\.\/\.\.\/dist\/cli\/todu-cli-darwin-\$\{arch\}$/,
    );
  });

  it("uses an installer-safe executable and consistent Linux desktop identity", () => {
    expect(config.linux.executableName).toBe("todu");
    expect(manifest.desktopName).toBe("todu.desktop");
    expect(config.linux.syncDesktopName).toBe(true);
  });

  it("downloads the generated AppImage name and verifies installers before installation", () => {
    const linux = readFileSync(path.join(rootDir, "scripts/install-linux.sh"), "utf8");
    const mac = readFileSync(path.join(rootDir, "scripts/install-mac.sh"), "utf8");
    expect(linux).toContain('APPIMAGE_ARCH="x86_64"');
    for (const script of [linux, mac]) expect(script).toContain("SHA256SUMS.txt");
    expect(linux.indexOf("sha256sum --check")).toBeLessThan(linux.indexOf("install -m 755"));
    expect(mac.indexOf("shasum -a 256 -c")).toBeLessThan(mac.indexOf('rm -rf "$TARGET_PATH"'));
  });

  it("keeps private desktop and root versions aligned", () => {
    expect(rootManifest.version).toBe(manifest.version);
    expect(rootManifest.private).toBe(true);
    expect(manifest.private).toBe(true);
  });

  it("accepts a matching desktop tag with independent companion versions", () => {
    const result = validateTag("v1.2.3", releaseFixture());
    expect(result.status, result.stderr).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      desktop: "1.2.3",
      cli: "4.5.6",
      daemon: "4.5.6",
    });
  });

  it.each([
    "1.2.3",
    "v1.2",
    "v1.2.4",
    "v1.2.3;echo bad",
  ])("rejects invalid or mismatched tag %s", (tag) => {
    expect(validateTag(tag, releaseFixture()).status).not.toBe(0);
  });

  it("rejects mismatched source metadata rather than renaming installers", () => {
    const directory = releaseFixture();
    writeFileSync(
      path.join(directory, "package.json"),
      JSON.stringify({ version: "1.2.4", private: true }),
    );
    const result = validateTag("v1.2.3", directory);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("Root/desktop version mismatch");
  });

  it("validates the requested tag's checkout and builds only its resolved commit", () => {
    expect(workflow).toMatch(/ref: \$\{\{ github\.event\.inputs\.tag \|\| github\.ref \}\}/);
    expect(workflow.match(/ref: \$\{\{ needs.validate.outputs.source_sha \}\}/g)).toHaveLength(4);
    expect(workflow).toContain('node scripts/validate-desktop-release.mjs "$TAG"');
  });

  it("does not invent a matching npm companion version or hide missing installers", () => {
    expect(workflow).not.toMatch(/@todu\/cli@\$\{VERSION\}/);
    expect(workflow).not.toMatch(/cp artifacts\/electron-.*\|\| true/);
    expect(workflow).not.toMatch(/cp artifacts\/electron-.*\*/);
    for (const suffix of ["linux-x86_64.AppImage", "linux-amd64.deb", "mac-arm64.dmg"])
      expect(workflow).toContain(`${suffix}" release-assets/`);
    expect(workflow.match(/cp "artifacts\/electron-/g)).toHaveLength(3);
    expect(workflow).toContain("validate:daemon-bundle:linux");
    expect(workflow).toContain("validate:daemon-bundle:mac");
  });
});

describe("Apple Silicon-only macOS support", () => {
  it("uses explicit native Linux and Apple Silicon desktop runners without losing validation", () => {
    expect(ci.jobs.desktop.strategy.matrix.include).toEqual([
      { os: "ubuntu-latest", platform: "linux", arch: "x64" },
      { os: "macos-15", platform: "mac", arch: "arm64" },
    ]);
    const steps = ci.jobs.desktop.steps as Array<{
      name: string;
      run?: string;
      env?: Record<string, string>;
    }>;
    const guard = steps.find((step) => step.name === "Verify native desktop architecture");
    expect(guard?.env?.EXPECTED_ARCH).toMatch(/^\$\{\{ matrix\.arch \}\}$/);
    expect(guard?.run).toContain("process.arch");
    const build = steps.find((step) => step.name === "Build and validate native desktop package");
    expect(build?.run).toMatch(
      /dist:\$\{\{ matrix\.platform \}\}:dir -- --\$\{\{ matrix\.arch \}\}/,
    );
    expect(build?.run).toMatch(/validate:daemon-bundle:\$\{\{ matrix\.platform \}\}/);
    for (const name of [
      "Device enrollment integration tests",
      "Sync provider checkpoint and field-group integration tests",
      "Unix socket ownership and path boundary tests",
      "LAN sync listener integration tests",
    ])
      expect(steps.some((step) => step.name === name)).toBe(true);
    expect(
      ci.jobs.check.steps.some((step: { run?: string }) => step.run?.includes("make test-all")),
    ).toBe(true);
  });

  it("builds and collects only arm64 macOS artifacts while preserving other platforms", () => {
    expect(release.jobs["build-macos"]["runs-on"]).toBe("macos-15");
    expect(workflow).not.toMatch(/darwin-x64|mac-x64|macos-latest|macos-15-intel/);
    expect(makefile).not.toContain("bun-darwin-x64");
    for (const target of ["linux-x64", "linux-arm64", "darwin-arm64", "windows-x64"])
      expect(workflow).toContain(`todu-cli-${target}`);
    expect(config.mac.target).toEqual([{ target: "dmg", arch: ["arm64"] }]);
    expect(config.linux.target).toEqual([
      { target: "deb", arch: ["x64"] },
      { target: "AppImage", arch: ["x64"] },
    ]);
    expect(config.win.target).toEqual([{ target: "nsis", arch: ["x64"] }]);
    expect(manifest.scripts["dist:mac"]).toMatch(/--mac --arm64$/);
    expect(manifest.scripts["dist:mac:dir"]).toMatch(/--mac dir --arm64$/);
    expect(manifest.scripts["validate:daemon-bundle:mac"]).toContain("mac-arm64/todu.app");
    expect(makefile).toContain("node packages/electron/scripts/macos-support.mjs");
    expect(makefile).not.toContain("dist:mac:dir -- --$$(node -p process.arch)");
    expect(workflow).toContain("sha256sum * > SHA256SUMS.txt");
  });

  it("rejects Intel/universal packaging overrides before packing and permits other targets", async () => {
    const { beforePack, assertSupportedMacArch } = await import(
      "../packages/electron/scripts/macos-support.mjs"
    );
    const { Arch } = await import("builder-util");
    expect(config.beforePack).toBe("./scripts/macos-support.mjs");
    expect(() => beforePack({ electronPlatformName: "darwin", arch: Arch.arm64 })).not.toThrow();
    for (const arch of [Arch.x64, Arch.universal, Arch.ia32])
      expect(() => beforePack({ electronPlatformName: "darwin", arch })).toThrow(
        /Apple Silicon.*arm64/,
      );
    for (const platform of ["linux", "win32"])
      expect(() => beforePack({ electronPlatformName: platform, arch: Arch.x64 })).not.toThrow();
    expect(() => assertSupportedMacArch({ platform: "darwin", arch: "x64" })).toThrow(
      /Apple Silicon/,
    );
    expect(() => assertSupportedMacArch({ platform: "darwin", arch: "arm64" })).not.toThrow();
    expect(() => assertSupportedMacArch({ platform: "linux", arch: "x64" })).not.toThrow();
  });

  it("does not validate an old Intel bundle when the requested arm64 bundle is missing", () => {
    const directory = releaseFixture();
    mkdirSync(path.join(directory, "mac/todu.app"), { recursive: true });
    const result = spawnSync(
      process.execPath,
      [
        path.join(rootDir, "packages/electron/scripts/validate-daemon-bundle.mjs"),
        "--app-bundle",
        path.join(directory, "mac-arm64/todu.app"),
      ],
      { encoding: "utf8" },
    );
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("App bundle not found");
    expect(result.stderr).toContain("mac-arm64/todu.app");
  });
});

function runMacInstaller({
  arch,
  hardwareArm64 = "0",
  sysctlFails = false,
}: {
  arch: string;
  hardwareArm64?: string;
  sysctlFails?: boolean;
}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), "todu-mac-installer-"));
  temporaryDirs.push(directory);
  const bin = path.join(directory, "bin");
  const download = path.join(directory, "download");
  const log = path.join(directory, "commands.log");
  mkdirSync(bin);
  mkdirSync(download);
  writeFileSync(log, "");
  const mock = (name: string, body: string) =>
    writeFileSync(
      path.join(bin, name),
      `#!/bin/bash\nprintf '%s\\n' "${name} $*" >> "$COMMAND_LOG"\n${body}\n`,
      { mode: 0o755 },
    );
  mock("uname", `printf '%s\\n' '${arch}'`);
  mock("sysctl", sysctlFails ? "exit 1" : `printf '%s\\n' '${hardwareArm64}'`);
  mock("mktemp", 'printf "%s\\n" "$DOWNLOAD_DIR"');
  mock("curl", "exit 91");
  for (const command of ["rm", "hdiutil", "ditto", "shasum"]) mock(command, "exit 0");
  const result = spawnSync("bash", [path.join(rootDir, "scripts/install-mac.sh"), "1.2.3"], {
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      HOME: directory,
      COMMAND_LOG: log,
      DOWNLOAD_DIR: download,
    },
    encoding: "utf8",
  });
  return { result, commands: readFileSync(log, "utf8") };
}

describe("macOS installer architecture eligibility", () => {
  it.each([
    { arch: "arm64", hardwareArm64: "1" },
    { arch: "x86_64", hardwareArm64: "1" },
  ])("selects arm64 on native or translated Apple Silicon: $arch", (options) => {
    const { result, commands } = runMacInstaller(options);
    expect(result.status).toBe(91);
    expect(commands).toContain("todu-1.2.3-mac-arm64.dmg");
    expect(commands).not.toContain("mac-x64");
    expect(commands).not.toMatch(/^hdiutil|^ditto|^shasum/m);
  });

  it.each([
    { arch: "x86_64", hardwareArm64: "0" },
    { arch: "x86_64", sysctlFails: true },
    { arch: "unknown" },
  ])("rejects unsupported or unverified hardware before side effects: $arch $sysctlFails", (options) => {
    const { result, commands } = runMacInstaller(options);
    expect(result.status).toBe(1);
    expect(result.stdout + result.stderr).toMatch(/Apple Silicon.*arm64/);
    expect(commands).not.toMatch(/^(curl|mktemp|rm|hdiutil|ditto|shasum)\b/m);
  });
});

describe("packaged desktop contents", () => {
  it("accepts source-matching component metadata and daemon modules", async () => {
    const fixture = await packagedFixture();
    const { validatePackagedContents } = await import(
      "../packages/electron/scripts/desktop-validation.mjs"
    );
    expect(
      validatePackagedContents({ appPath: fixture.appPath, rootDir: fixture.directory }),
    ).toMatchObject({ electronRuntime: "41.10.7", daemon: "4.5.6" });
  });

  it.each([
    ["node_modules/sprintf-js/index.js", "// affected package"],
    ["node_modules/roarr/index.js", "// affected package"],
    ["node_modules/global-agent/index.js", "// affected package"],
    ["node_modules/@electron/get/index.js", "// affected package"],
    ["dist/main/index.js", 'require("global-agent")'],
  ])("rejects affected packaging-tool code at %s", async (name, content) => {
    const fixture = await packagedFixture();
    fixture.write(name, content);
    await fixture.pack();
    const { validatePackagedContents } = await import(
      "../packages/electron/scripts/desktop-validation.mjs"
    );
    expect(() =>
      validatePackagedContents({ appPath: fixture.appPath, rootDir: fixture.directory }),
    ).toThrow(/Affected build-tool/);
  });

  it("rejects a stale compiled daemon despite matching version metadata", async () => {
    const fixture = await packagedFixture();
    fixture.write("dist/daemon/runtime.js", "// Stale runtime\n");
    await fixture.pack();
    const { validatePackagedContents } = await import(
      "../packages/electron/scripts/desktop-validation.mjs"
    );
    expect(() =>
      validatePackagedContents({ appPath: fixture.appPath, rootDir: fixture.directory }),
    ).toThrow("Bundled daemon differs");
  });
});

describe("packaged desktop validation isolation", () => {
  it("waits beyond socket admission until the catalog is actually ready", async () => {
    const { waitForCatalog } = await import("../packages/electron/scripts/desktop-validation.mjs");
    let calls = 0;
    const request = async () => ({
      protocolVersion: "1",
      catalog: { id: ++calls === 1 ? null : "ready-catalog" },
    });
    expect(await waitForCatalog({ request })).toMatchObject({ catalog: { id: "ready-catalog" } });
    expect(calls).toBe(2);
  });

  it("fails bounded readiness when an admitted connection never gets a catalog", async () => {
    const { waitForCatalog } = await import("../packages/electron/scripts/desktop-validation.mjs");
    await expect(
      waitForCatalog({
        request: async () => ({ protocolVersion: "1", catalog: { id: null } }),
        timeoutMs: 1,
      }),
    ).rejects.toThrow("readiness deadline");
  });

  it("ignores host daemon/plugin/sync overrides and supplies explicit fixture config", async () => {
    const { createValidationEnv } = await import(
      "../packages/electron/scripts/desktop-validation.mjs"
    );
    const directory = releaseFixture();
    const env = createValidationEnv({
      fixtureDir: directory,
      parentEnv: {
        HOME: "/host/home",
        XDG_CONFIG_HOME: "/host/config",
        TODU_CONFIG: "/host/config.yaml",
        TODU_DAEMON_SOCKET: "/host/daemon.sock",
        TODU_DAEMON_PLUGIN_PATHS: "/host/plugin.mjs",
        TODU_SYNC_SERVER: "wss://host.example",
        TODU_SYNC_ENABLED: "true",
        TODU_DAEMON_VERSION: "host-version",
        PATH: process.env.PATH,
      },
    });
    expect(env.HOME).toBe(directory);
    expect(env.XDG_CONFIG_HOME).toBe(path.join(directory, "config"));
    expect(env.TODU_CONFIG).toBe(path.join(directory, "config.yaml"));
    expect(env.TODU_DAEMON_SOCKET).toBe(path.join(directory, "daemon.sock"));
    expect(env.TODU_SYNC_ENABLED).toBe("false");
    expect(env.TODU_SYNC_SERVER).toBe("");
    expect(env.TODU_DAEMON_PLUGIN_PATHS).toBeUndefined();
    expect(env.TODU_DAEMON_VERSION).toBeUndefined();
  });

  it("rejects forced termination rather than certifying storage completion", async () => {
    const { stopValidatedProcess } = await import(
      "../packages/electron/scripts/desktop-validation.mjs"
    );
    const child = (await import("node:child_process")).spawn(
      process.execPath,
      ["-e", "process.on('SIGTERM',()=>{});console.log('ready');setInterval(()=>{},1000)"],
      { stdio: ["ignore", "pipe", "pipe"] },
    );
    await new Promise<void>((resolve) => child.stdout.once("data", () => resolve()));
    await expect(stopValidatedProcess({ child, timeoutMs: 50 })).rejects.toThrow(
      "forced termination",
    );
    expect(child.signalCode).toBe("SIGKILL");
  });
});
