# Task Search

Task title and description search uses task-list metadata so routine searches do not load every `TaskDetailDocument`.

## Approach

Each `TaskListDocument` stores `descriptionSearchTextByTaskId`, a normalized copy of the task description text used only for search matching. Task creation and description updates maintain this index. Task moves transfer the indexed text to the target project task list, and task deletes remove it. Legacy task lists backfill missing search text from detail docs once when a task list is loaded; after backfill, normal `task.search` and `task.list({ search })` calls scan task-list docs only.

## Performance target

The expected near-term scale is hundreds to low thousands of tasks per dataset, with task lists partitioned by project. Indexed title+description search should avoid per-query detail-doc fanout and complete an indexed 1,000-task query in under 250 ms on a developer machine. A local benchmark on 2026-04-28 created 1,000 tasks with descriptions and ran 20 warm indexed description searches for `framework`; average query time was 0.24 ms. Backfill may load detail docs once for missing index entries, but that cost is migration work and is not paid by every later search.
