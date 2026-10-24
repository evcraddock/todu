export function AssigneeOptions({
  assignees,
  showArchived = false,
}: {
  assignees?: readonly { id: string; displayName: string; archived?: boolean }[];
  showArchived?: boolean;
}) {
  return [...(assignees ?? [])]
    .sort(
      (a, b) =>
        a.displayName.localeCompare(b.displayName, undefined, {
          sensitivity: "base",
          numeric: true,
        }) || a.id.localeCompare(b.id),
    )
    .map((assignee) => (
      <option key={assignee.id} value={assignee.id}>
        {assignee.displayName}
        {showArchived && assignee.archived ? " (archived)" : ""}
      </option>
    ));
}
