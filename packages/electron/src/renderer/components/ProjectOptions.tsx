import type { Project } from "@todu/core/browser";

export function ProjectOptions({ projects }: { projects?: readonly Project[] }) {
  return [...(projects ?? [])]
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }))
    .map((project) => (
      <option key={project.id} value={project.id}>
        {project.name}
      </option>
    ));
}
