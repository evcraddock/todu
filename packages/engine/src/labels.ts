import crypto from "node:crypto";
import type { DocHandle, DocumentId } from "@automerge/automerge-repo";
import type { Repo } from "@automerge/automerge-repo";
import {
  type CatalogDocument,
  type CreateLabelInput,
  type Label,
  type LabelId,
  type Result,
  type TaskListDocument,
  type UpdateLabelInput,
  createLabelId,
  err,
  notFound,
  ok,
  validateCreateLabelInput,
  validateUpdateLabelInput,
  validationError,
} from "@todu/core";
import type { LabelNamespace } from "./todu.js";

// ============================================================================
// Label namespace — CRUD operations on catalog document
// ============================================================================

export function createLabelNamespace(
  catalog: DocHandle<CatalogDocument>,
  repo: Repo,
): LabelNamespace {
  return {
    async create(input: CreateLabelInput): Promise<Result<Label>> {
      const validationErr = validateCreateLabelInput(input);
      if (validationErr) return err(validationErr);

      // Check name uniqueness
      const doc = catalog.doc();
      if (doc) {
        const existing = doc.labels.find(
          (l) => l.name.toLowerCase() === input.name.trim().toLowerCase(),
        );
        if (existing) {
          return err(validationError("name", `Label "${input.name.trim()}" already exists`));
        }
      }

      const now = new Date().toISOString();
      const id = createLabelId(`lbl-${crypto.randomUUID().slice(0, 8)}`);

      const label: Label = {
        id,
        name: input.name.trim(),
        createdAt: now,
      };
      if (input.color !== undefined) {
        label.color = input.color;
      }

      catalog.change((doc) => {
        doc.labels.push(label);
      });

      return ok(label);
    },

    async list(): Promise<Result<Label[]>> {
      const doc = catalog.doc();
      if (!doc) return ok([]);
      return ok(doc.labels.map(cloneLabel));
    },

    async update(id: LabelId, input: UpdateLabelInput): Promise<Result<Label>> {
      const validationErr = validateUpdateLabelInput(input);
      if (validationErr) return err(validationErr);

      const doc = catalog.doc();
      if (!doc) return err(notFound("label", id));

      const index = doc.labels.findIndex((l) => l.id === id);
      if (index === -1) return err(notFound("label", id));

      // Check name uniqueness if name is changing
      if (input.name !== undefined) {
        const existing = doc.labels.find(
          (l) => l.id !== id && l.name.toLowerCase() === input.name!.trim().toLowerCase(),
        );
        if (existing) {
          return err(validationError("name", `Label "${input.name.trim()}" already exists`));
        }
      }

      catalog.change((doc) => {
        const label = doc.labels[index];
        if (input.name !== undefined) label.name = input.name.trim();
        if (input.color !== undefined) label.color = input.color;
      });

      const updated = catalog.doc()!.labels[index];
      return ok(cloneLabel(updated));
    },

    async delete(id: LabelId): Promise<Result<void>> {
      const doc = catalog.doc();
      if (!doc) return err(notFound("label", id));

      const index = doc.labels.findIndex((l) => l.id === id);
      if (index === -1) return err(notFound("label", id));

      const labelName = doc.labels[index].name;

      // Remove label from all tasks that reference it
      for (const docId of Object.values(doc.taskListDocIds)) {
        const handle = await repo.find<TaskListDocument>(docId as DocumentId);
        const listDoc = handle.doc();
        if (!listDoc) continue;

        const tasksWithLabel = listDoc.tasks
          .map((t, i) => ({ index: i, hasLabel: t.labels.includes(labelName) }))
          .filter((t) => t.hasLabel);

        if (tasksWithLabel.length > 0) {
          handle.change((doc) => {
            for (const { index } of tasksWithLabel) {
              const task = doc.tasks[index];
              const labelIdx = task.labels.indexOf(labelName);
              if (labelIdx !== -1) {
                task.labels.splice(labelIdx, 1);
              }
            }
          });
        }
      }

      // Remove from catalog
      catalog.change((doc) => {
        doc.labels.splice(index, 1);
      });

      return ok(undefined);
    },
  };
}

function cloneLabel(l: Label): Label {
  return {
    id: l.id,
    name: l.name,
    color: l.color,
    createdAt: l.createdAt,
  };
}
