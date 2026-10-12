import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ChevronRight, CircleAlert, ExternalLink, GitBranch, GitMerge, ShieldCheck } from 'lucide-react';
import { useNow } from '../../app/context.tsx';
import type { PullRequestView } from '../../contract/index.ts';
import { dateTime, duration, plural, relativeTime } from '../../format/format.ts';
import { CHECK_CONCLUSION_LABELS, ISSUE_TYPE_LABELS, PULL_REQUEST_STATE_LABELS } from '../../i18n/labels.ts';
import { MERGE_QUERY_PARAMETER, QUERY_FLAG } from '../../model/query-flags.ts';
import { paths, VIEW_PATHS } from '../../model/routes.ts';
import { checksSummaryMark, conclusionMark } from '../../model/status.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { DiffViewer } from '../../ui/components/DiffViewer.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { DetailHeader, MetaItem } from '../../ui/layout/Page.tsx';
import { EvidenceGallery } from './EvidenceGallery.tsx';
import { ExternalFeedback } from './ExternalFeedback.tsx';
import { MergeDialog } from './MergeDialog.tsx';
import { ReviewRounds } from './ReviewRounds.tsx';

const NO_CHECKS_LABEL = 'aucun check';
const NO_RECORDED_FILES_LABEL = 'liste des fichiers non enregistrée';
const STATE_TONES = { open: 'running', merged: 'success', closed: 'idle' } as const;

export function PullRequestDetail({ pullRequest }: { readonly pullRequest: PullRequestView }) {
  const now = useNow();
  const [searchParams, setSearchParams] = useSearchParams();
  const [mergeOpen, setMergeOpen] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const noChecks = pullRequest.checks.length === 0;
  const filesRecorded = pullRequest.files.length > 0;
  const canMerge = pullRequest.state === 'open' && pullRequest.mergeable;
  const additions = pullRequest.files.reduce((sum, file) => sum + file.additions, 0);
  const deletions = pullRequest.files.reduce((sum, file) => sum + file.deletions, 0);

  useEffect(() => {
    if (searchParams.get(MERGE_QUERY_PARAMETER) !== QUERY_FLAG) return;
    if (canMerge) setMergeOpen(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams, canMerge]);

  return (
    <article className="detail pr-detail">
      <DetailHeader
        back={{ to: VIEW_PATHS['pull-requests'], label: 'Toutes les pull requests' }}
        eyebrow={
          <>
            <Badge tone={STATE_TONES[pullRequest.state]}>{PULL_REQUEST_STATE_LABELS[pullRequest.state]}</Badge>
            <span className="num">#{pullRequest.number}</span>
            <span>{ISSUE_TYPE_LABELS[pullRequest.type]}</span>
            <span>·</span>
            <Link to={paths.issue(pullRequest.issueNumber)} className="link">
              issue #{pullRequest.issueNumber}
            </Link>
          </>
        }
        title={pullRequest.title}
        actions={
          <>
            <a className="ds-button ds-button--secondary ds-button--md" href={pullRequest.url} target="_blank" rel="noreferrer">
              <ExternalLink size={14} aria-hidden="true" />
              <span className="ds-button__label">Ouvrir sur GitHub</span>
            </a>
            {pullRequest.state === 'open' ? (
              <Button variant="primary" icon={<GitMerge size={14} />} disabled={!canMerge} onClick={() => setMergeOpen(true)} title={canMerge ? undefined : pullRequest.mergeBlockers.join(', ')}>
                Merger
              </Button>
            ) : null}
          </>
        }
        meta={
          <>
            <MetaItem icon={<GitBranch size={13} />}>
              <span className="mono truncate">{pullRequest.branch}</span>
            </MetaItem>
            <MetaItem>{pullRequest.mergedAt === null ? `ouverte le ${dateTime(pullRequest.openedAt)}` : `mergée le ${dateTime(pullRequest.mergedAt)}`}</MetaItem>
            {noChecks ? (
              <MetaItem>{NO_CHECKS_LABEL}</MetaItem>
            ) : (
              <MetaItem icon={<StatusMark mark={checksSummaryMark(pullRequest.checks.map((check) => check.conclusion))} size={13} />}>
                {pullRequest.checks.filter((check) => check.conclusion === 'success').length}/{pullRequest.checks.length} checks
              </MetaItem>
            )}
            <MetaItem icon={<ShieldCheck size={13} />}>{pullRequest.evidenceComplete ? 'preuves complètes' : 'preuves incomplètes'}</MetaItem>
          </>
        }
      />

      {pullRequest.state === 'open' && !pullRequest.mergeable ? (
        <div className="callout callout--running">
          <CircleAlert size={16} aria-hidden="true" />
          <div className="callout__body">
            <p className="callout__title">Pas encore mergeable</p>
            <p>{pullRequest.mergeBlockers.join(' · ')}</p>
          </div>
        </div>
      ) : null}
      {pullRequest.missingEvidence.length > 0 ? (
        <div className="callout callout--failed">
          <CircleAlert size={16} aria-hidden="true" />
          <div className="callout__body">
            <p className="callout__title">Preuves manquantes</p>
            <ul className="bullets">
              {pullRequest.missingEvidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}

      <Section title="Preuves" description="Ce que la pull request démontre, avant le code.">
        {pullRequest.evidence.length === 0 ? <EmptyState compact title="Aucune preuve attachée" /> : <EvidenceGallery evidence={pullRequest.evidence} />}
      </Section>

      <div className="pr-detail__columns">
        <Section title="Revue" description="Constats du relecteur, passe par passe.">
          <ReviewRounds rounds={pullRequest.reviewRounds} />
        </Section>
        <Section title="Checks">
          {noChecks ? (
            <EmptyState compact title="Aucun check CI configuré" />
          ) : (
            <ul className="pr-checks">
              {pullRequest.checks.map((check) => (
                <li key={check.name} className="pr-check">
                  <StatusMark mark={conclusionMark(check.conclusion)} size={14} />
                  <span className="pr-check__name mono">{check.name}</span>
                  <span className="pr-check__conclusion">{CHECK_CONCLUSION_LABELS[check.conclusion]}</span>
                  <span className="pr-check__duration num">{check.durationMs === null ? '' : duration(check.durationMs)}</span>
                  <a className="pr-check__link" href={check.url} target="_blank" rel="noreferrer" aria-label={`Ouvrir le check ${check.name}`}>
                    <ExternalLink size={13} />
                  </a>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <Section title="Retours externes" description="Un retour collé ici relance un cycle d’implémentation sur cette pull request.">
        <ExternalFeedback pullRequest={pullRequest} />
      </Section>

      <Section
        title="Code"
        description={`${filesRecorded ? `${plural(pullRequest.files.length, 'fichier', 'fichiers')} · +${additions} −${deletions}` : NO_RECORDED_FILES_LABEL} · ouverte il y a ${relativeTime(pullRequest.openedAt, now)}`}
        actions={
          filesRecorded ? (
            <Button size="sm" variant="ghost" icon={<ChevronRight size={14} className={showCode ? 'is-rotated' : undefined} />} aria-expanded={showCode} onClick={() => setShowCode((value) => !value)}>
              {showCode ? 'Masquer les changements' : 'Afficher les changements'}
            </Button>
          ) : undefined
        }
      >
        {showCode ? (
          <div className="pr-detail__diffs">
            {pullRequest.files.map((file) => (
              <DiffViewer key={file.path} path={file.path} patch={file.patch} additions={file.additions} deletions={file.deletions} />
            ))}
          </div>
        ) : null}
      </Section>

      <MergeDialog pullRequest={pullRequest} open={mergeOpen} onClose={() => setMergeOpen(false)} />
    </article>
  );
}
