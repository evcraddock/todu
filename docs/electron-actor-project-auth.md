# Electron actor and project authorization management

The Electron app includes lightweight multi-user management surfaces backed by the local daemon.

## Actors

Open **Settings → Actors** to manage catalog-wide actors.

Supported actions:
- list actors with display name, actor ID, and active/archived state
- create a new actor
- rename an existing actor
- archive an actor
- unarchive an actor

Behavior notes:
- actor IDs stay stable after creation
- archived actors remain visible for historical/admin context
- archived actors are not offered for new project authorization choices

## Project authorization

Open any project detail view and use the **Authorized assignees** section to manage `authorizedAssigneeActorIds`.

Supported actions:
- inspect current authorized actors
- add an active actor to the project authorization list
- remove an actor from the project authorization list
- review any stale or unauthorized task assignees still attached to tasks in that project

Behavior notes:
- existing stale or unauthorized assignees remain visible instead of being silently removed
- task detail views also mark archived or unauthorized assignees clearly
- all actions go through daemon-backed core actor and project APIs
