# Changesets

Add a changeset in feature PRs that should publish an npm package:

```bash
npm run changeset
```

Choose only the packages changed by the PR. For a TUI-only change, select `@todu/tui` only.

Changesets opens a version PR after changes land on `main`. Merging that version PR publishes the changed packages to npm.
