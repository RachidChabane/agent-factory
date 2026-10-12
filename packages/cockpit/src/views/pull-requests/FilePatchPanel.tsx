import type { ChangedFile } from '../../contract/index.ts';
import type { PullRequestDiffState } from '../../data/pull-request-diffs.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { CodeBlock } from '../../ui/components/CodeBlock.tsx';
import { DiffViewer } from '../../ui/components/DiffViewer.tsx';
import { FileAtCommitLink } from './FileAtCommitLink.tsx';
import type { FilePatch } from './pull-request-model.ts';
import { keptDiff, patchOf } from './pull-request-model.ts';

interface PatchContentProps {
  readonly file: ChangedFile;
  readonly state: PullRequestDiffState;
  readonly found: FilePatch | null;
}

/** The patch itself, or what stands in its place while the diff is read or when it holds none. A patch without hunks, such as a binary file's, is shown as written. */
function PatchContent({ file, state, found }: PatchContentProps) {
  const { t } = useI18n();
  if (found === null) return state.status === 'failed' ? null : <p className="pr-file__note subtle">{t('pullRequests.files.reading')}</p>;
  if (found.kind === 'missing') return <p className="pr-file__note subtle">{t('pullRequests.files.noPatch')}</p>;
  return (
    <>
      {found.hunks ? <DiffViewer path={file.path} patch={found.patch} additions={file.additions} deletions={file.deletions} /> : <CodeBlock code={found.patch} wrap copyable={false} />}
      {found.truncated ? <p className="pr-file__note subtle">{t('pullRequests.files.truncated')}</p> : null}
    </>
  );
}

interface FilePatchPanelProps {
  readonly file: ChangedFile;
  readonly state: PullRequestDiffState;
  /** The head commit of the pull request, at which the file can be viewed. */
  readonly headSha: string;
}

/** What an opened file shows: the link to the file at the head commit and its patch out of the diff of the pull request. */
export function FilePatchPanel({ file, state, headSha }: FilePatchPanelProps) {
  const diff = keptDiff(state);
  const found = diff === null ? null : patchOf(diff, file.path);
  return (
    <>
      <FileAtCommitLink file={file} headSha={headSha} found={found} />
      <PatchContent file={file} state={state} found={found} />
    </>
  );
}
