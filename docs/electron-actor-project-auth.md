# Electron multi-user actor, project authorization, and task assignee management

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

## Task assignees

Open any task detail view and use the **Assignees** section to manage `assigneeActorIds`.

Supported actions:
- inspect current task assignees with actor IDs and archived/unauthorized markers
- add an assignee from the current project's authorized active actors
- remove an existing assignee
- replace one assignee with another authorized active actor without typing raw IDs
- review clear empty states when a project has no currently authorized active actors available for new assignment

Behavior notes:
- multi-actor assignment is supported directly in the shipped UI
- new assignment choices are limited to non-archived actors authorized for the task's current project
- when a task moves between projects, the available assignee choices refresh to match the new project's authorization list
- existing archived or unauthorized assignees remain visible until the user removes or replaces them
