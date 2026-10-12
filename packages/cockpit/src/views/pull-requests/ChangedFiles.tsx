import './pull-request-files.css';
import { useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import { usePullRequestDiff } from '../../app/hooks.ts';
import type { ChangedFile, PullRequestView } from '../../contract/index.ts';
import type { PullRequestDiffState } from '../../data/pull-request-diffs.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { DiffStatus } from './DiffStatus.tsx';
import { FilePatchPanel } from './FilePatchPanel.tsx';
import { fileTotals, toggledPath } from './pull-request-model.ts';

const ICON_SIZE = 14;

function FileStats({ file }: { readonly file: ChangedFile }) {
  return (
    <span className="pr-file__stats num">
      <span className="ds-diff__add">+{file.additions}</span>
      <span className="ds-diff__del">−{file.deletions}</span>
    </span>
  );
}

interface ChangedFileRowProps {
  readonly file: ChangedFile;
  readonly open: boolean;
  readonly state: PullRequestDiffState;
  /** The head commit of the pull request, at which the file can be viewed. */
  readonly headSha: string;
  readonly onToggle: () => void;
}

function ChangedFileRow({ file, open, state, headSha, onToggle }: ChangedFileRowProps) {
  const { t } = useI18n();
  const panelId = useId();
  return (
    <li className="pr-file">
      <button type="button" className="pr-file__row pr-file__toggle" aria-expanded={open} aria-controls={panelId} aria-label={t('pullRequests.files.toggle', { path: file.path })} onClick={onToggle}>
        <ChevronRight size={ICON_SIZE} className={open ? 'is-rotated' : undefined} aria-hidden="true" />
        <span className="pr-file__path mono">{file.path}</span>
        <FileStats file={file} />
      </button>
      <div id={panelId}>{open ? <FilePatchPanel file={file} state={state} headSha={headSha} /> : null}</div>
    </li>
  );
}

/** The files a pull request changes, each with its patch one click away; the patches are read from the factory when the first one is asked for. */
export function ChangedFiles({ pullRequest }: { readonly pullRequest: PullRequestView }) {
  const { t } = useI18n();
  const project = useProject();
  const { files } = pullRequest;
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const { state, reload } = usePullRequestDiff(open.size === 0 ? null : { project: project.id, pullRequestNumber: pullRequest.number, headSha: pullRequest.headSha });
  const totals = fileTotals(files);
  const allOpen = files.length > 0 && files.every((file) => open.has(file.path));
  return (
    <Section
      title={t('pullRequests.files.title')}
      id="pull-request-files"
      description={files.length === 0 ? undefined : t('pullRequests.files.summary', { count: totals.files, additions: totals.additions, deletions: totals.deletions })}
      actions={
        files.length === 0 ? undefined : (
          <Button size="sm" variant="ghost" onClick={() => setOpen(allOpen ? new Set() : new Set(files.map((file) => file.path)))}>
            {allOpen ? t('pullRequests.files.hideAll') : t('pullRequests.files.showAll')}
          </Button>
        )
      }
    >
      {files.length === 0 ? (
        <EmptyState compact title={t('pullRequests.files.none')} />
      ) : (
        <>
          {open.size === 0 ? null : <DiffStatus state={state} headSha={pullRequest.headSha} onReload={reload} />}
          <ul className="pr-files" aria-label={t('pullRequests.files.list')}>
            {files.map((file) => (
              <ChangedFileRow key={file.path} file={file} open={open.has(file.path)} state={state} headSha={pullRequest.headSha} onToggle={() => setOpen(toggledPath(open, file.path))} />
            ))}
          </ul>
        </>
      )}
    </Section>
  );
}
