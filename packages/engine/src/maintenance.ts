import type { DocHandle, DocumentId, Repo } from "@automerge/automerge-repo/slim";
import type { CatalogDocument, ProjectId, TaskListDocument } from "@todu/core";

export interface TaskListCompactionResult {
  projectId: ProjectId;
  oldDocumentId: DocumentId;
  newDocumentId: DocumentId;
  taskCount: number;
  operationCount?: number;
}

function cloneTaskListDocument(document: TaskListDocument): TaskListDocument {
  return JSON.parse(JSON.stringify(document)) as TaskListDocument;
}

/**
 * Replaces one task-list document with a clean snapshot of its current logical state.
 * The caller must ensure all writers are stopped and must retain a backup for rollback.
 */
export async function compactTaskListDocument(
  repo: Repo,
  catalog: DocHandle<CatalogDocument>,
  projectId: ProjectId,
): Promise<TaskListCompactionResult> {
  const oldDocumentId = catalog.doc()?.taskListDocIds[projectId] as DocumentId | undefined;
  if (!oldDocumentId) {
    throw new Error(`Task-list document not found for project ${projectId}`);
  }

  const oldHandle = await repo.find<TaskListDocument>(oldDocumentId);
  await oldHandle.whenReady();
  const oldDocument = oldHandle.doc();
  if (!oldDocument) {
    throw new Error(`Task-list document ${oldDocumentId} is unavailable for project ${projectId}`);
  }

  const snapshot = cloneTaskListDocument(oldDocument);
  const operationCount = repo.metrics().documents[oldDocumentId]?.size.numOps;
  const replacement = repo.create<TaskListDocument>();
  replacement.change((document) => {
    document.projectId = snapshot.projectId;
    document.tasks = snapshot.tasks;
    document.detailDocIds = snapshot.detailDocIds;
    document.descriptionSearchTextByTaskId = snapshot.descriptionSearchTextByTaskId;
  });

  catalog.change((document) => {
    document.taskListDocIds[projectId] = replacement.documentId;
  });
  await repo.flush([replacement.documentId, catalog.documentId]);

  return {
    projectId,
    oldDocumentId,
    newDocumentId: replacement.documentId,
    taskCount: snapshot.tasks.length,
    operationCount,
  };
}
