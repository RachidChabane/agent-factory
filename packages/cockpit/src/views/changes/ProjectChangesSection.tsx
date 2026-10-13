import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { paths } from '../../model/routes.ts';
import { Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import type { ProjectChanges } from './changes-model.ts';
import { isQuiet } from './changes-model.ts';
import { DeploymentLane } from './DeploymentLane.tsx';
import { PullRequestLane } from './PullRequestLane.tsx';

interface ProjectChangesSectionProps {
  readonly project: ProjectChanges;
  readonly baseBranch: string;
}

/** What changed in one project: its pull requests, then one lane for each of its environments. */
export function ProjectChangesSection({ project, baseBranch }: ProjectChangesSectionProps) {
  const { t } = useI18n();
  return (
    <Section
      title={project.name}
      id={`changes-project-${project.id}`}
      actions={
        <Link to={paths.project(project.id)} className="link">
          {t('changes.project.open', { project: project.name })}
        </Link>
      }
    >
      {isQuiet(project) && project.lanes.length === 0 ? (
        <EmptyState compact title={t('changes.project.quiet', { project: project.name })} />
      ) : (
        <div className="changes-lanes">
          <PullRequestLane project={project.id} pullRequests={project.pullRequests} />
          {project.lanes.map((lane) => (
            <DeploymentLane key={lane.name} project={project.id} baseBranch={baseBranch} lane={lane} />
          ))}
        </div>
      )}
    </Section>
  );
}
