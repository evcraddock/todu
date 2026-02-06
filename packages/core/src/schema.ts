// Automerge document schemas
// These define the structure of documents stored in Automerge

import type { Task, Project } from "./types";

// Root document containing all tasks and projects
export type TodoDocument = {
  tasks: Record<string, Task>;
  projects: Record<string, Project>;
  version: number;
};

// Initial empty document
export function createEmptyDocument(): TodoDocument {
  return {
    tasks: {},
    projects: {},
    version: 1,
  };
}
