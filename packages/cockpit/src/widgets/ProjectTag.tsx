import { useMaybeSnapshot } from '../app/hooks.ts';

interface ProjectTagProps {
  readonly project: string;
}

/** The name of the project an item belongs to, for the lists that mix several projects. */
export function ProjectTag({ project }: ProjectTagProps) {
  const name = useMaybeSnapshot()?.projects.find((candidate) => candidate.id === project)?.name ?? project;
  return <span className="project-tag">{name}</span>;
}
