import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { useI18n } from '../i18n/I18nProvider.tsx';
import { paths } from '../model/routes.ts';
import { EmptyState } from '../ui/components/EmptyState.tsx';
import { Page } from '../ui/layout/Page.tsx';

interface NotFoundViewProps {
  /** The identifier of a project that does not exist, when that is what the address named. */
  readonly project?: string | undefined;
}

export function NotFoundView({ project }: NotFoundViewProps) {
  const { t } = useI18n();
  return (
    <Page width="narrow">
      <EmptyState
        icon={<Compass size={16} />}
        headingLevel={1}
        title={project === undefined ? t('shell.notFoundTitle') : t('shell.projectNotFoundTitle', { project })}
        description={project === undefined ? t('shell.notFoundDescription') : t('shell.projectNotFoundDescription')}
        action={
          <Link to={paths.board()} className="link">
            {t('shell.backToBoard')}
          </Link>
        }
      />
    </Page>
  );
}
