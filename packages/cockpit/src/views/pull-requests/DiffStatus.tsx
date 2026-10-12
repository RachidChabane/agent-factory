import type { PullRequestDiffState } from '../../data/pull-request-diffs.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { shortSha } from '../../model/identifiers.ts';
import { Button } from '../../ui/components/Button.tsx';
import { ReadStamp } from '../../widgets/ReadStamp.tsx';
import { keptDiff } from './pull-request-model.ts';

interface DiffStatusProps {
  readonly state: PullRequestDiffState;
  /** The head commit the pull request is at. */
  readonly headSha: string;
  readonly onReload: () => void;
}

/** When the diff was read, why a read failed with the diff of the read before it kept in place, and whether the diff is of the head commit the pull request is at. */
export function DiffStatus({ state, headSha, onReload }: DiffStatusProps) {
  const { t } = useI18n();
  const diff = keptDiff(state);
  if (diff === null && state.status !== 'failed') return null;
  return (
    <div className="pr-files__status">
      <ReadStamp readAt={diff?.readAt ?? null} error={state.status === 'failed' ? state.error : null} kind="forge" />
      {state.status === 'loading' ? null : (
        <Button size="sm" onClick={onReload}>
          {t('pullRequests.files.reload')}
        </Button>
      )}
      {diff !== null && diff.headSha !== headSha ? (
        <p className="pr-files__mismatch" role="note">
          {t('pullRequests.files.headMismatch', { read: shortSha(diff.headSha), current: shortSha(headSha) })}
        </p>
      ) : null}
    </div>
  );
}
