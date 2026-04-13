# Multi-user Task Assignment Model

## Status

Proposed design direction for `task-24a037dd`.

See also:

- `docs/plans/multi-user-task-assignment-rollout.md`

## Summary

This design keeps todu personal-first while supporting richer assignment, authorship, and integration sync.

Core direction:

- one catalog has one owner
- the owner is also an actor in the catalog
- actors are catalog-wide and may represent humans, bots, or service identities
- tasks use multi-actor assignment
- notes use single-actor authorship
- projects control which actors may be assigned within that project
- integrations map local actors to external identities per binding
- imported content from unknown or untrusted actors requires explicit human approval before agent workflows may treat it as instructions

## Goals

This design should support:

- a single owner using the same catalog on multiple machines
- task assignment to humans and non-humans
- note authorship as a first-class identity
- plugin-first collaboration through systems like GitHub
- graceful handling of partial or missing identity mappings
- safe handling of imported prompt-like content

## Non-goals

This design does not try to add:

- a native shared-catalog multi-user workspace model
- multiple catalog owners
- core authentication or account-management features
- plugin-specific identity fields in the core actor model
- project permissions beyond authorized assignee lists

## Current state

Today the model is string-based:

- `Task.assignees: string[]`
- `Note.author: string`
- sync providers also exchange assignees and authors as strings
- there is no first-class actor model in the catalog

## Core design

### Catalog ownership

A catalog has exactly one owner.

The owner is represented by a catalog-wide actor reference:

```ts
ownerActorId: ActorId
```

Ownership and assignment are separate concepts.

### Actor model

Actors are catalog-wide and reusable across projects and integrations.

```ts
interface Actor {
  id: ActorId;
  displayName: string;
  archived?: boolean;
}
```

Notes:

- `displayName` is the editable human-facing label
- no `kind` field in v1
- no plugin-specific identity data in core
- actors may represent people, bots, service accounts, or similar identities

### Catalog storage

The catalog document should store actors directly in v1.

```ts
actors: Actor[]
ownerActorId: ActorId
```

A separate identity document is unnecessary unless the collection becomes large or contentious enough to justify splitting it out later.

## Task and note model

### Task assignment

Task assignment answers:

> who is working on this?

It does not define a single execution owner.

```ts
assigneeActorIds: ActorId[]
```

Semantics:

- empty list means no one is explicitly assigned
- one actor is the common case
- multiple actors are allowed
- order has no semantic meaning
- duplicates are not allowed
- the catalog owner does not need to assign themselves before working on a task

### Status interaction

Status and assignment are independent.

- `inprogress` means the catalog owner is actively working on the task
- `waiting` means the catalog owner is waiting on someone or something else
- a task may be `waiting` while still assigned to other actors

### Note authorship

Notes use actors too, but with single authorship.

```ts
authorActorId: ActorId
```

Rules:

- every note has exactly one author
- note authorship is separate from task assignment
- notes do not get note-level assignee lists in v1

## Project scoping

Projects control who may be assigned within that project.

```ts
authorizedAssigneeActorIds: ActorId[]
```

Rules:

- actors remain catalog-wide
- the same actor may be authorized in many projects
- task assignment may only use actors authorized for the task's project

### Unauthorized existing assignees

If an actor is removed from a project's authorized list:

- existing task assignments remain
- those assignees become stale or unauthorized for that project
- new assignment edits must enforce project authorization
- non-assignment edits like title or status changes should still work
- UI should warn when removing an authorized actor who is still assigned on tasks

## Integration model

Collaboration is plugin-first and binding-scoped.

A local actor may map to different external identities in different bindings.

Current direction:

- actor mappings live on `IntegrationBinding.options`
- mappings are scoped per binding, not global per provider
- mappings may also store trust metadata for imported content decisions

Conceptual shape:

```ts
binding.options = {
  actorMappings: [
    {
      actorId: "actor-erik",
      externalAccountId: "12345",
      externalLogin: "evcraddock",
      trusted: true
    }
  ]
}
```

## Sync behavior

### Push behavior

When pushing local tasks to an external system:

- local tasks remain valid even if some assigned actors are not mapped in the binding
- only mapped actors are included in outbound assignee data
- unmapped actors are skipped
- sync continues instead of failing the whole task push
- sync surfaces a warning for skipped unmapped assignees

For pushed notes/comments:

- `authorActorId` remains the local source of truth
- providers like GitHub will usually publish comments as the authenticated integration account
- missing actor mappings should not block comment push

### Pull behavior

When pulling external tasks or comments into todu:

- if an external author or assignee matches an existing binding mapping, reuse that actor
- if no mapping exists, create a new local actor
- persist the new mapping on that binding
- pulled task assignees populate `assigneeActorIds`
- pulled note/comment authors populate `authorActorId`
- pulled task assignees should also be added to the project's `authorizedAssigneeActorIds` if missing
- unknown external identities must never collapse to `ownerActorId`

## Imported content trust and approval

Imported content may contain prompt-injection or other unsafe instructions.

Trust is evaluated per binding actor mapping.

- mapped and trusted actor -> no explicit approval gate required
- mapped but untrusted actor -> approval required
- unknown actor -> approval required
- auto-created mappings discovered during pull default to `trusted: false`

Important nuance:

- trusted means the explicit approval gate may be skipped
- trusted does not mean imported content is universally safe or should be obeyed blindly

### Approval model

Approval is content-level, field-level, and revision-aware.

```ts
type ContentApprovalState = "notRequired" | "pendingApproval" | "approved";

interface ImportedContentApproval {
  state: ContentApprovalState;
  sourceBindingId?: IntegrationBindingId;
  sourceActorId?: ActorId;
  sourceFingerprint?: string;
  reviewedAt?: string;
  reviewedByActorId?: ActorId;
}
```

Rules:

- applies to imported task descriptions and imported note/comment bodies
- tracked separately per imported content field revision
- local content defaults to `notRequired`
- imported content from trusted mapped actors uses `notRequired`
- imported content from unknown or untrusted actors uses `pendingApproval`
- explicit human approval of the current revision sets `approved`
- if imported content changes later, approval is re-evaluated using a fingerprint or equivalent revision signal
- local edits do not auto-approve or auto-trust imported content
- titles, labels, assignees, status, and similar structured fields are not part of this approval gate in v1

### Approval storage

Approval metadata should live next to the content it governs.

- task description approval metadata belongs in `TaskDetailDocument`
- note approval metadata belongs on each `Note`

### Approval behavior

If content is pending approval:

- humans can still read it
- humans can still manually work with it
- sync continues normally
- agent workflows must ignore it as trusted instructions until explicitly approved

Approval must remain an explicit human action.

## Sync-provider contract direction

The provider boundary should move from string-based assignees and authors to normalized import/export payloads using structured external actor references.

```ts
interface ExternalActorRef {
  externalAccountId?: string;
  externalLogin?: string;
  displayName?: string;
  raw?: unknown;
}

interface ImportedTaskInput {
  externalId: string;
  title: string;
  description?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  labels?: string[];
  assignees?: ExternalActorRef[];
  sourceUrl?: string;
  createdAt?: string;
  updatedAt?: string;
  raw?: unknown;
}

interface ImportedCommentInput {
  externalId: string;
  externalTaskId: string;
  body: string;
  author?: ExternalActorRef;
  createdAt: string;
  updatedAt?: string;
  raw?: unknown;
}

interface ExportedCommentInput {
  localNoteId: NoteId;
  body: string;
  createdAt: string;
  updatedAt?: string;
  sourceUrl?: string;
}

interface ExportedTaskInput {
  localTaskId: TaskId;
  externalId?: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  labels: string[];
  assignees: ExternalActorRef[];
  sourceUrl?: string;
  comments: ExportedCommentInput[];
}
```

Direction:

- providers do not consume or return local `ActorId`s
- providers normalize provider-specific fields and extract external identity data
- runtime resolves and creates local actors
- runtime updates binding mappings
- runtime computes approval state
- runtime prepares outbound external actor refs from local `assigneeActorIds`

This replaces the current tightly coupled `mapToTask(...)` and `mapFromTask(...)` style.

## Migration

Migration should unify legacy task assignees and note authors into the new actor model.

Steps:

1. Add catalog-wide `actors[]` and `ownerActorId`
2. Scan all tasks for legacy `assignees: string[]`
3. Scan all notes for legacy `author: string`
4. Normalize names using `trim + lowercase`
5. Create one actor per unique normalized name across the catalog
6. Preserve a human-facing `displayName` from the first seen non-magic value
7. Rewrite task assignees to `assigneeActorIds`
8. Rewrite note authors to required `authorActorId`
9. Backfill each project's `authorizedAssigneeActorIds` from assigned actors in that project plus `ownerActorId`

Rules:

- use one shared normalization rule for tasks and notes
- legacy note author `"user"` maps to `ownerActorId`
- missing or empty note authors map to `ownerActorId`
- if legacy task assignees contain `"user"`, map that to `ownerActorId`
- case-insensitive merging is considered safe for the known current data set
- this is a migration rule, not necessarily a permanent future import rule

Examples:

- `"erik "` and `"erik"` become the same actor
- `"Erik"` and `"erik"` become the same actor
- note author `"user"` becomes `ownerActorId`
- note with no author becomes `ownerActorId`

## UX direction

The same core workflows should exist in Electron and CLI.

Electron should provide richer discovery. CLI should provide explicit command-driven control.

### Electron surfaces

- global actors list
- project authorized assignee editor
- task assignee picker
- integration binding actor-mapping screen with trust controls
- approval-needed list/filter plus detail badges or banners

### CLI surfaces

- `todu actor list|create|rename|archive|unarchive`
- `todu project actors list|add|remove <project> ...`
- `todu task assign add|remove|set <task> ...`
- `todu integration actor-mapping list|set|trust|untrust <binding> ...`
- `todu approval list|show|approve ...`

### UX rules

- actor management should stay lightweight
- actor creation should be primarily project-driven, with inline creation while managing project authorization
- archived actors remain visible in historical data and existing assignments, but are not offered for new assignment
- binding mapping screens should show local actor, external identity, and trust state
- approval-needed indicators should be visible but non-blocking for normal human work
- skipped unmapped assignees should appear as binding-scoped warnings, with task-specific detail where possible

## Implementation checklist

1. Add actor types and catalog storage
2. Add task assignment and note authorship schema changes
3. Add project authorized assignee lists
4. Add binding-scoped actor mappings and trust flags
5. Add imported content approval metadata to task descriptions and notes
6. Redesign sync-provider contracts around normalized import/export payloads
7. Implement migration from legacy string assignees and authors
8. Add CLI and Electron flows for actor management, assignment, mapping, trust, and approval
