# Phase 4: Pi Extension

> Post-MVP - Native LLM tools for pi coding agent

## Overview

Create `todu-pi-extension` package that registers native LLM tools for the pi coding agent, providing direct Automerge access instead of shelling out to CLI commands.

## Goals

- Replace todu-skills with native pi extension
- Direct Automerge access (no subprocess overhead)
- Typed parameters for better LLM understanding
- Custom UI capabilities (task selectors, confirmations)

## Scope

### Deliverables

1. **todu-pi-extension package** (separate repo)
   - Pi extension that registers tools
   - Uses @todu/core for data access
   - Distributed via npm or pi packages

2. **Tools to implement**
   - `todu_task_list` - List/filter tasks
   - `todu_task_create` - Create task
   - `todu_task_update` - Update task
   - `todu_task_show` - Show task details
   - `todu_project_list` - List projects
   - `todu_project_create` - Create project
   - `todu_recurring_list` - List templates
   - `todu_recurring_process` - Process due templates

3. **Custom commands**
   - `/todu` - Quick task actions
   - `/pick-task` - Interactive task selector

## Requirements

### Functional

- All CLI functionality available as LLM tools
- Tools work with local Automerge (same as CLI)
- Backward compatible (existing todu-skills still work)

### Technical

- TypeScript
- Uses @todu/core for data access
- Follows pi extension patterns
- Published to npm as `todu-pi-extension`

## Dependencies

- MVP complete (Phase 1-3)
- @todu/core published to npm

## Success Criteria

1. Agent can manage tasks without CLI subprocess
2. Response times faster than CLI-based skills
3. Typed parameters improve LLM accuracy
4. Custom UI enhances agent experience

## Open Questions

- Should extension connect to Electron via IPC when available?
- How to handle sync server connection from extension?
- Package distribution: npm, pi packages, or both?
