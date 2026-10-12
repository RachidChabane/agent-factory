import { createContext, useContext } from 'react';
import { Outlet, useParams } from 'react-router';
import type { ProjectView } from '../contract/index.ts';
import { findProject } from '../model/projects.ts';
import { NotFoundView } from '../views/NotFoundView.tsx';
import { useSnapshot } from './hooks.ts';

const ProjectContext = createContext<ProjectView | null>(null);

/** The project of the page being drawn, resolved from the address by `ProjectRoute`. */
export function useProject(): ProjectView {
  const project = useContext(ProjectContext);
  if (project === null) throw new Error('useProject must be used inside a project route');
  return project;
}

/** Layout of every `/projects/:project/...` page: resolves the project, or says that it does not exist. */
export function ProjectRoute() {
  const snapshot = useSnapshot();
  const { project: id } = useParams();
  const project = id === undefined ? null : findProject(snapshot, id);
  if (project === null) return <NotFoundView project={id ?? ''} />;
  return (
    <ProjectContext.Provider value={project}>
      <Outlet />
    </ProjectContext.Provider>
  );
}
