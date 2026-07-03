# TUI Implementation Specs

These specs break the Ink-based TUI work into small, independently runnable and testable units.

Important rule: **every spec must leave the TUI runnable and useful in its current state**. Do not create hidden plumbing-only PRs unless they also expose a small visible/debuggable UI increment. After each spec, a developer should be able to launch the app, see the new capability or placeholder state, and run focused tests.

Read first for every spec:

- `docs/ARCHITECTURE.md`
- `docs/plans/tui/architecture.md`
- `docs/plans/TASK_EXECUTION_STANDARD.md`

Execution order:

1. `01-package-scaffold.md`
2. `02-daemon-connection.md`
3. `03-daemon-domain-client.md`
4. `04-app-shell-navigation.md`
5. `05-task-read-model.md`
6. `06-projects-screen-filtering.md`
7. `07-task-status-mutations.md`
8. `08-comment-modal.md`
9. `09-events-and-reconnect.md`
10. `10-workspace-integration.md`
11. `11-npm-release.md`
12. `12-full-screen-layout-redesign.md`

Each spec should be implemented in its own PR or focused work session unless the change is demonstrably tiny.
