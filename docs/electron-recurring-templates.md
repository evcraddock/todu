# Electron recurring templates: miss policy

Recurring templates in the Electron app let you choose how missed occurrences behave.

## Where to set it

### Create flow

When creating a recurring template, use the **Miss Policy** field in the new-template dialog.

### Edit flow

When viewing an existing recurring template, use the **Miss Policy** control in the detail view to change the behavior later.

## Options

- `accumulate` — missed occurrences stack and catch up
- `rollForward` — only the latest due occurrence stays actionable

## Default behavior

The default is `accumulate`.

If you do not change the setting, the template stays on the backlog-catching-up behavior that existing recurring templates already use.

Older templates without a stored `missPolicy` value are shown in the Electron UI as `accumulate` for backward compatibility.

## Where it is displayed

The current miss policy is shown in:

- the recurring template list
- the recurring template detail view

Use `rollForward` when you want one current actionable occurrence instead of a stack of missed backlog tasks.
