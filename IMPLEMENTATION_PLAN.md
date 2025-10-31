# Implementation Plan: Project Registry (Issue #18)

## Overview

Add a project registry system to enable nickname resolution, project tracking,
and bulk sync operations.

## Stage 1: Create resolve-project.py Script

**Goal**: Implement project nickname resolution script
**Success Criteria**:

- Script accepts a project nickname as input
- Returns JSON with found/not found status and project details
- Suggests nickname if not found
- Reads from `~/.local/todu/projects.json`

**Tests**:

- Test with existing project nickname
- Test with non-existent nickname
- Test with empty/missing projects.json

**Status**: Not Started

## Stage 2: Create register-project.py Script

**Goal**: Implement project registration script
**Success Criteria**:

- Script accepts nickname, system, and repo/project-id
- Creates/updates projects.json
- Validates input parameters
- Returns success/error JSON

**Tests**:

- Register new GitHub project
- Register new Forgejo project
- Register new Todoist project
- Update existing project
- Handle invalid parameters

**Status**: Not Started

## Stage 3: Create sync-all.py Script

**Goal**: Implement bulk sync for all registered projects
**Success Criteria**:

- Reads projects.json
- Calls appropriate sync script for each project
- Reports overall sync status
- Handles errors gracefully

**Tests**:

- Sync all projects successfully
- Handle mix of successful/failed syncs
- Handle missing sync scripts
- Handle empty projects.json

**Status**: Not Started

## Stage 4: Update Create Workflows

**Goal**: Integrate registry into create-issue/task skills
**Success Criteria**:

- Skills check registry before creating issues
- Use AskUserQuestion for nickname if not found
- Auto-register new projects
- Maintain backward compatibility

**Tests**:

- Create issue with registered nickname
- Create issue with new project
- Create issue with explicit repo format

**Status**: Not Started

## Stage 5: Testing & Documentation

**Goal**: End-to-end testing and documentation
**Success Criteria**:

- All scripts work together
- Natural language workflows function
- Documentation updated
- Run linting on all files

**Tests**:

- Complete user workflow from registration to sync
- Test all three systems (GitHub, Forgejo, Todoist)
- Edge cases handled

**Status**: Not Started
