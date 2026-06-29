#!/usr/bin/env bash
set -euo pipefail

cat >&2 <<'MSG'
The legacy lockstep npm release script has been retired.

NPM package releases now use Changesets:

  npm run changeset          # add package release intent in a feature PR
  npm run version-packages   # apply pending changesets in a version PR
  npm run release-packages   # publish changed packages from CI

See docs/release.md and .pi/skills/release/SKILL.md.

Desktop/binary GitHub releases still use the tag-based Release workflow, but npm publishing is owned by Changesets.
MSG

exit 1
