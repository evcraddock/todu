# Phase 6: Plugin System + External Sync

> Post-MVP - Bidirectional sync with GitHub, Forgejo, and other external systems

## Overview

Implement the plugin system that enables external integrations. Create GitHub and Forgejo plugins for bidirectional issue sync.

## Goals

- Open plugin ecosystem for external integrations
- Bidirectional sync with GitHub Issues
- Bidirectional sync with Forgejo Issues
- Foundation for community plugins

## Scope

### Deliverables

1. **Plugin API** (@todu/core)
   - SyncProvider interface
   - Plugin loader
   - Plugin configuration system
   - Plugin lifecycle management

2. **Plugin CLI Commands**
   - `todu plugin install <name>`
   - `todu plugin list`
   - `todu plugin remove <name>`
   - `todu plugin config <name>`

3. **todu-github plugin** (separate repo)
   - Bidirectional sync with GitHub Issues
   - Map tasks ↔ issues
   - Sync comments
   - Handle labels, assignees, milestones

4. **todu-forgejo plugin** (separate repo)
   - Bidirectional sync with Forgejo Issues
   - Same capabilities as GitHub plugin

5. **External Sync Job**
   - Background job that runs plugins
   - Configurable interval per plugin
   - Handles errors gracefully

## Requirements

### Plugin Interface

```typescript
interface SyncProvider {
  readonly name: string;
  readonly version: string;

  initialize(config: PluginConfig): Promise<void>;
  shutdown(): Promise<void>;

  pull(project: Project): Promise<ExternalTask[]>;
  push(tasks: Task[], project: Project): Promise<void>;

  mapToTask(external: ExternalTask): Task;
  mapFromTask(task: Task): ExternalTask;

  // Optional
  handleWebhook?(payload: unknown): Promise<void>;
  backgroundJobs?: BackgroundJob[];
}
```

### Plugin Distribution

- npm packages (`todu-github`, `todu-forgejo`)
- Installed to `~/.toduai/plugins/`
- Version compatibility with @todu/core

### Sync Behavior

- Pull: Fetch from external, create/update local tasks
- Push: Send local changes to external
- Conflict resolution: Last-write-wins based on updatedAt
- Track externalId to link tasks ↔ issues

### Project Configuration

```yaml
# Per-project sync config
projects:
  - name: "my-project"
    sync:
      provider: "github"
      config:
        repo: "owner/repo"
      strategy: "bidirectional" # pull, push, bidirectional
      interval: "10m"
```

### Functional

- Changes in GitHub appear in todu
- Changes in todu appear in GitHub
- Comments sync bidirectionally
- Labels map between systems

### Technical

- Plugins are npm packages
- OAuth for authentication (or API tokens)
- Rate limiting handling
- Offline resilience

## Dependencies

- Phase 5 (Sync Worker + Background Jobs)
- Worker must be running for automatic sync

## Success Criteria

1. Can install GitHub plugin from npm
2. Configure project for GitHub sync
3. Create task in todu → issue appears in GitHub
4. Create issue in GitHub → task appears in todu
5. Comments sync both ways
6. Works reliably over time

## Plugin Ecosystem

### Security Model

- Users explicitly install plugins
- Plugins have access to task data
- OAuth tokens stored securely
- No sandboxing (trust model like npm)

### Discovery

- Initially: document known plugins
- Future: plugin registry / directory

### Community Plugins (Future)

- Linear
- Jira
- Todoist
- Trello
- Notion

## Open Questions

- How to handle merge conflicts with external edits?
- Should plugin credentials be stored in Automerge or separate?
- Webhook support for real-time sync?
- How to test plugins without hitting real APIs?
