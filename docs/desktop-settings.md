# Desktop settings

Settings groups preferences into General, AI, Sync, and Status.

## General

Theme changes apply immediately. Journal timezone is free-form text: enter a valid
IANA timezone and click Save. An invalid value is not persisted.

## AI

The Assistant model selectors show providers with saved credentials. Selecting a
provider or model saves the choice and applies it to the agent immediately. API
key presence is labeled Key saved; this is not verification that the key works.

Connected providers appear first. Expand Other providers to search for a new
connection. Connect and Manage open a dialog with the provider's supported
subscription and API key methods. Subscription credentials take priority over a
separately saved key. Login progress and errors stay in the dialog. ChatGPT login
uses a persistent UUID stored in the desktop app's machine-local userData folder,
independently of the synced dataset.

## Sync

The overview shows the current catalog ID and available connection methods.
Both computers need a running daemon and access to the same dataset through a
server, Direct Sync, or both.

- **Connect another computer to this data** shows sharing information and incoming
  enrollment requests. Approve or deny the intended device locally.
- **Connect this computer to existing data** offers direct enrollment through a
  known HTTP(S) listening address, or catalog validation/join through an existing
  connection. Direct enrollment exchanges the catalog ID through the protocol;
  it refuses to replace or merge a different initialized dataset.
- **Direct Sync** saves the listener's enabled state and reuses or automatically
  selects its bind address. Restart the daemon from Status to apply the change.
  This transport is for trusted local networks and is unencrypted and
  unauthenticated; local approval is not authentication.
- **Sync Server** saves and applies enablement and an editable server URL without
  restarting the daemon. Disabling retains the URL for later use.

A listed device is enrolled metadata, not proof that it is online or fully synced.
Enrollment progress distinguishes pending approval, attachment, and activation.
See [CLI daemon usage](cli-daemon-usage.md) for pristine-installation preparation
and the underlying sync commands.

## Status

Status displays daemon health, runtime state, role, start time, and socket. Restart
daemon waits for a new healthy instance before refreshing the view. The isolated
dev app restarts its Overmind daemon process. Other contexts use the bundled CLI's
lifecycle controls. A custom unmanaged daemon must be restarted through its own
process manager; the app reports the failure rather than targeting an unrelated
global service.

## Journal editor

The editor uses the standard list-page width, with optional tags on the left and
Cancel/Save below the editor on the right. Cancel asks before discarding unsaved
changes. The journal detail page keeps its existing navigation and metadata.
