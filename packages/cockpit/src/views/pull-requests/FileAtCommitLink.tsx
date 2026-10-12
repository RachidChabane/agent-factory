import { ExternalLink } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { ChangedFile } from '../../contract/index.ts';
import { repositoryFilePath } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import type { FilePatch } from './pull-request-model.ts';
import { offersFileAtCommit } from './pull-request-model.ts';

const LINK_ICON_SIZE = 12;

interface FileAtCommitLinkProps {
  readonly file: ChangedFile;
  /** The head commit of the pull request, at which the file is viewed. */
  readonly headSha: string;
  /** What the diff holds for the file; null while the diff has not been read. */
  readonly found: FilePatch | null;
}

/** A link to the file as the head commit holds it, in a new tab; nothing for a file the commit no longer holds. */
export function FileAtCommitLink({ file, headSha, found }: FileAtCommitLinkProps) {
  const { t } = useI18n();
  const project = useProject();
  if (!offersFileAtCommit(file, found)) return null;
  return (
    <a className="link pr-file__source" href={repositoryFilePath(project.id, headSha, file.path)} target="_blank" rel="noreferrer" aria-label={t('pullRequests.files.viewFileLabel', { path: file.path })}>
      {t('pullRequests.files.viewFile')}
      <ExternalLink size={LINK_ICON_SIZE} aria-hidden="true" />
    </a>
  );
}
