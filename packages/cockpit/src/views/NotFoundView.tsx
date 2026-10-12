import { Link } from 'react-router';
import { Compass } from 'lucide-react';
import { VIEW_PATHS } from '../model/routes.ts';
import { EmptyState } from '../ui/components/EmptyState.tsx';
import { Page } from '../ui/layout/Page.tsx';

export function NotFoundView() {
  return (
    <Page width="narrow">
      <EmptyState
        icon={<Compass size={16} />}
        title="Cette page n’existe pas"
        description="Le lien est peut-être ancien, ou l’élément a été supprimé."
        action={
          <Link to={VIEW_PATHS.board} className="link">
            Revenir au tableau
          </Link>
        }
      />
    </Page>
  );
}
