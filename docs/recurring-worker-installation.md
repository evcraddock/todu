# Recurring Worker Installation

The optional recurring worker turns due templates into tasks automatically. Without it, templates remain available but occurrences require manual generation.

## Release and compatibility

The `0.2.0` release intentionally restores `@todu/recurring-worker` to the normal Changesets npm flow. Its manifest reports the package version, and stop drains admitted startup/interval processing after cancelling future intervals. It requires the host's explicit `capabilities.awaitableStop === true`; an older host is refused before runtime resources are allocated. Version numbers alone are not the negotiation mechanism. See [Worker Plugin API](worker-plugin-api.md#awaitable-stop-opt-in).

The `0.2.1` release changes dependency metadata only, aligning with the API v7 host release; worker generation/shutdown behavior and explicit `awaitableStop` negotiation remain unchanged from `0.2.0`.

The current release compatibility set is:

| Package | Version |
| --- | --- |
| Node / npm used in local validation | `24.16.0` / `11.13.0` |
| `@todu/cli` (unchanged published CLI) | `0.25.2` |
| `@todu/core` | `0.28.0` |
| `@todu/engine` | `0.24.4` |
| `@todu/daemon` | `0.28.0` |
| `@todu/recurring-worker` | `0.2.1` |

The daemon and worker declare minimum compatible core/engine ranges; engine aligns its core dependency. The host/engine pin Automerge `3.5.0` and Repo `2.5.6`. Do not add the obsolete Automerge `3.3.2` override from the historical `0.1.1` setup. Normal npm installation must run the engine's required Repo repair postinstall script.

**Release metadata is not publication evidence.** Before using the commands below, verify every exact version, registry integrity and dist-tag against the approved release. The local package regression installs the four packed candidates plus the published CLI into a clean temporary npm project, without workspace symlinks; it is candidate-installation evidence, not proof those versions have reached npm or your running daemon.

## Install the verified release

Stop an existing managed daemon gracefully **before** replacing installed files. An affected older daemon may hang, and the stock direct CLI escalates to SIGKILL after ten seconds. The deployment procedure must use a positively identified owned process and a non-escalating graceful stop; if it does not exit, pause rather than force-kill, delete locks/data, or claim storage completion. A later healthy start is not proof that a previously forced stop completed its writes.

Once the existing process has exited, install the exact verified set in the existing Node/npm environment:

```bash
npm install -g \
  @todu/cli@0.25.2 \
  @todu/core@0.28.0 \
  @todu/engine@0.24.4 \
  @todu/daemon@0.28.0 \
  @todu/recurring-worker@0.2.1
```

For a fresh setup only, register the plugin and assign `recurring` to exactly one daemon for the dataset. Preserve other assignments:

```bash
todu plugin install @todu/recurring-worker
todu plugin config recurring-worker --set '{"intervalSeconds":30}'
```

```yaml
daemon:
  workers:
    assigned:
      - recurring
```

An existing npm-installed worker keeps its entrypoint across package replacement; do not add a second source/npm entry with the same worker type. Configuration/assignment/path migrations require their own scoped approval. After the approved installation:

```bash
todu daemon start
todu daemon status
todu plugin list
npm list -g --depth=0 @todu/cli @todu/daemon @todu/recurring-worker
```

Confirm the actual CLI-to-daemon/core/engine module resolution as well as top-level package metadata. The daemon must be healthy on the original catalog/socket, and the worker must be running/OK with manifest `0.2.1`. Runtime version fields may report `dev`; they do not replace artifact/version verification.

## Candidate installation regression

After building the candidate:

```bash
npm run test:all -- scripts/recurring-worker-package.integration.test.ts
```

The regression packs core/engine/daemon/worker, installs their actual archives plus published CLI `0.25.2` in disposable HOME/config/data paths, executes required installation scripts, verifies module resolution and unsupported-host refusal, and runs the real direct CLI lifecycle. It automatically generates an occurrence, restarts with a persistent subscribed client, checks the same catalog/new PID/no duplicate occurrence, stops after client disconnection without forced termination, and reopens exact task/description/note data. It uses no source-checkout plugin, production dataset, real provider, or manual occurrence-generation call. The same clean installation also probes API v7 scoped canonical equality without rewrites, deferred disagreement/approval, legacy-drain blocking, stale push refusal after relinking, legacy registration/unsupported-host negotiation, and actual local operator preview/confirm RPCs with status-only/comment preservation and token-reuse rejection. These use disposable fixture identities only, not real remote-deletion confirmation or adapter adoption. Separate source shutdown/recovery regressions cover admitted work, durable ledgers and cleanup/storage/RPC failure propagation.

Successful local exit/persistence does not establish remote durability or resolve historical startup stalls. Long-running uncooperative work can still exhaust the existing stop allowance; no universal abort support is implied.

## Legacy artifact and source builds

Published `0.1.1` remains historical: its manifest reports `1.0.0` and its synchronous stop does not provide an in-flight completion promise. A daemon upgrade cannot retrofit this guarantee into that already loaded artifact. Explicit worker replacement and restart are required; do not install `0.2.0` into an older unsupported host and expect a safe fallback.

Source version generation reads `packages/recurring-worker/package.json` and writes `src/version.ts` before build/typecheck and repository versioning. The compiled package needs no runtime JSON import or source checkout. Verify source metadata separately with:

```bash
make build
npm test -- scripts/recurring-worker-version.test.ts packages/recurring-worker/src/index.test.ts
```

## Troubleshooting

- **Unsupported host / runtime creation failure:** install the compatible completion-aware host, confirm actual module resolution, and use its negotiated capability; do not remove the worker's check.
- **Not loaded / `IMPORT_FAILED`:** inspect the configured package/absolute entrypoint and prevent duplicate worker registrations.
- **Blocked:** check existing assignment and required `recurring`/`task` domains; changing ownership/assignment is not part of package installation.
- **Running but no occurrence:** confirm an active due template and active project, wait one configured interval, and inspect reported generation errors. Do not use production task creation as a deployment smoke test.
- **Stop timeout or cleanup failure:** pause and preserve evidence; do not force recovery, repeat signals, or claim unconfirmed writes completed.
