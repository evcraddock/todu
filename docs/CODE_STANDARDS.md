# Code Standards

Standards for writing and reviewing code in todu. This is a living document — it will grow as project-specific patterns emerge during development.

## Tooling

| Tool | Purpose | Command |
|------|---------|---------|
| **Biome** | Linting + formatting | `make check` or `biome check --write .` |
| **tsgo** or **tsc** | Type checking + compilation | `make build` |
| **Vitest** | Testing | `make test` |
| **Husky** | Pre-commit hook | Runs `make check`, re-stages formatted files |

No ESLint. No Prettier. No bun test. Biome handles both linting and formatting in one pass.

## Imports

- **Relative paths with `.js` extensions.** No path aliases (`@/...`).
- `Node16` module resolution for npm compatibility.

```typescript
// ✅
import { Task } from "../types.js";
import { createTodu } from "../../engine/src/index.js";

// ❌
import { Task } from "@/types";
import { Task } from "../types";  // missing .js
```

## Exports

- Named exports only. No default exports.
- Re-export public API from `index.ts`.

## TypeScript

- Strict mode enabled. No `any`.
- Define types for all function parameters and return values.
- Use branded IDs (`TaskId`, `ProjectId`, etc.) — never raw strings for entity IDs.

## Error Handling

- Engine operations return `Result<T, E>`. No throwing for expected failures.
- Throw only for programmer errors (invariant violations, unreachable code).
- Include context in error messages — what was attempted, what went wrong, what ID/entity was involved.

## Functions

- Small and focused. If it needs a comment explaining what a block does, extract it.
- Use object params for 3+ parameters.

## Testing

- Vitest with `describe`/`it` blocks.
- Test public API, not internals.
- Each acceptance criterion on a task should have a corresponding test.
- Name tests by behavior, not implementation: "creates task in correct project" not "calls addToTaskList".

## Where Logic Belongs

| Layer | Responsibility | Example |
|-------|---------------|---------|
| `@todu/core` | Types, validation, constants | "Is this a valid status transition?" |
| `@todu/engine` | All business logic, Automerge operations | "Create task, update index, return result" |
| `@todu/cli` | Arg parsing, output formatting, exit codes | "Format task list as table" |
| `@todu/electron` | UI rendering, agent wiring | "Show task detail view" |

If you're writing business logic in the CLI or Electron, it belongs in the engine.

## Review Checklist

When reviewing code, check:

- [ ] No `any` types
- [ ] Branded IDs used for entity references (not raw strings)
- [ ] Engine operations return `Result`, not throw
- [ ] Business logic is in the engine, not CLI/Electron
- [ ] Relative `.js` imports (no path aliases)
- [ ] Named exports (no default exports)
- [ ] Tests exist for new functionality
- [ ] Error messages include context
- [ ] Biome passes (`make check`)

## TODO: Patterns to Document After Phase 1

These will be added once we have real code establishing the patterns:

- `Result<T, E>` usage patterns and error type hierarchy
- Engine operation structure (how a typical CRUD function looks)
- Automerge document access patterns
- Test fixtures and helpers
- Multi-document operation patterns (task create touches 3 docs)
