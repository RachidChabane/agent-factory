import { Link } from 'react-router';
import { CircleCheck, CircleX, ExternalLink, GitBranch, RefreshCw, Rocket, Scissors } from 'lucide-react';
import { useNow } from '../../app/context.tsx';
import { useCommand } from '../../app/hooks.ts';
import type { CockpitSnapshot, ReleaseView } from '../../contract/index.ts';
import { dateTime, relativeTime, shortSha } from '../../format/format.ts';
import { AUDIT_STATE_LABELS, RELEASE_STATE_LABELS } from '../../i18n/labels.ts';
import { translateGateReason } from '../../i18n/reasons.ts';
import { paths, VIEW_PATHS } from '../../model/routes.ts';
import { auditMark, releaseMark } from '../../model/status.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { CodeBlock } from '../../ui/components/CodeBlock.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { DetailHeader, MetaItem } from '../../ui/layout/Page.tsx';
import { gateConditions } from './release-model.ts';

const EVALUABLE: readonly ReleaseView['state'][] = ['open', 'auditing', 'blocked', 'promotable'];
const SHOWS_PRODUCTION_LINK: readonly ReleaseView['state'][] = ['promotable', 'blocked', 'auditing', 'promoted', 'verified'];

export function ReleaseDetail({ release, snapshot }: { readonly release: ReleaseView; readonly snapshot: CockpitSnapshot }) {
  const now = useNow();
  const command = useCommand();
  const conditions = gateConditions(release, snapshot.audits);
  const auditsById = new Map(snapshot.audits.map((audit) => [audit.id, audit]));
  const promotable = release.gate.promotable;
  const evaluated = release.gate.evaluatedAt !== null;
  return (
    <article className="detail release-detail">
      <DetailHeader
        back={{ to: VIEW_PATHS.releases, label: 'Toutes les releases' }}
        eyebrow={
          <>
            <StatusMark mark={releaseMark(release.state)} />
            <span>{RELEASE_STATE_LABELS[release.state]}</span>
          </>
        }
        title={`Release ${release.id}`}
        actions={
          <>
            {release.state === 'open' ? (
              <Button
                variant="primary"
                icon={<Scissors size={14} />}
                disabled={release.commits.length === 0}
                loading={command.pending === 'release.cut'}
                onClick={() => void command.run('release.cut', { releaseId: release.id }, `Release ${release.id} coupée`)}
              >
                Couper la release
              </Button>
            ) : null}
            {EVALUABLE.includes(release.state) ? (
              <Button
                variant="secondary"
                icon={<RefreshCw size={14} />}
                loading={command.pending === 'release.evaluate'}
                onClick={() => void command.run('release.evaluate', { releaseId: release.id }, 'Gate réévalué')}
              >
                Réévaluer le gate
              </Button>
            ) : null}
          </>
        }
        meta={
          <>
            <MetaItem icon={<GitBranch size={13} />}>
              <span className="mono">{release.branch}</span>
            </MetaItem>
            <MetaItem>{release.cutAt === null ? `ouverte le ${dateTime(release.createdAt)}` : `coupée le ${dateTime(release.cutAt)}`}</MetaItem>
            {release.promotedAt === null ? null : <MetaItem>promue le {dateTime(release.promotedAt)}</MetaItem>}
            {release.verifiedAt === null ? null : <MetaItem>vérifiée le {dateTime(release.verifiedAt)}</MetaItem>}
          </>
        }
      />

      {release.state === 'open' ? null : (
        <section className={`release-gate${promotable ? ' is-promotable' : ' is-blocked'}`} aria-label="Gate de release">
          <div className="release-gate__status">
            {promotable ? <CircleCheck size={22} aria-hidden="true" /> : <CircleX size={22} aria-hidden="true" />}
            <div>
              <p className="release-gate__title">{promotable ? 'Promouvable en production' : 'Non promouvable'}</p>
              <p className="release-gate__meta">{evaluated && release.gate.evaluatedAt !== null ? `Gate évalué il y a ${relativeTime(release.gate.evaluatedAt, now)}` : 'Gate pas encore évalué'}</p>
            </div>
          </div>
          {release.gate.blockingReasons.length === 0 ? null : (
            <ul className="release-gate__reasons" aria-label="Raisons bloquantes">
              {release.gate.blockingReasons.map((reason) => (
                <li key={reason}>{translateGateReason(reason)}</li>
              ))}
            </ul>
          )}
          <ul className="release-gate__conditions">
            {conditions.map((condition) => (
              <li key={condition.label} className="release-gate__condition">
                <StatusMark mark={condition.mark} size={14} />
                <span className="release-gate__condition-label">{condition.label}</span>
                <span className="release-gate__condition-detail">{condition.detail}</span>
              </li>
            ))}
          </ul>
          {SHOWS_PRODUCTION_LINK.includes(release.state) ? (
            <div className="release-gate__production">
              <a className={`ds-button ds-button--md ${promotable ? 'ds-button--secondary' : 'ds-button--ghost'}`} href={release.productionWorkflowUrl} target="_blank" rel="noreferrer">
                <Rocket size={14} aria-hidden="true" />
                <span className="ds-button__label">Ouvrir le workflow de production</span>
                <ExternalLink size={13} aria-hidden="true" />
              </a>
              <p className="release-gate__note">L’usine ne déploie jamais en production : vous lancez le workflow vous-même depuis GitHub Actions.</p>
            </div>
          ) : null}
        </section>
      )}

      <Section title={`Commits · ${release.commits.length}`}>
        {release.commits.length === 0 ? (
          <EmptyState compact title="Aucun commit pour l’instant" description="Les merges sur la branche par défaut alimentent la prochaine release." />
        ) : (
          <ul className="release-commits">
            {release.commits.map((commit) => {
              const audit = commit.auditId === null ? undefined : auditsById.get(commit.auditId);
              return (
                <li key={commit.sha} className="release-commit">
                  <span className="release-commit__sha mono">{shortSha(commit.sha)}</span>
                  <span className="release-commit__message">
                    <span className="truncate">{commit.message}</span>
                    <span className="release-commit__author">{commit.author}</span>
                  </span>
                  <span className="release-commit__tags">
                    {commit.attribution === 'factory-merge' ? <Badge tone="accent">Usine</Badge> : <Badge>Hors usine</Badge>}
                    {commit.evidenceComplete === null ? null : (
                      <Badge tone={commit.evidenceComplete ? 'success' : 'failed'}>{commit.evidenceComplete ? 'Preuves complètes' : 'Preuves incomplètes'}</Badge>
                    )}
                    {audit === undefined ? null : (
                      <Link to={paths.audit(audit.id)} className="release-commit__audit">
                        <StatusMark mark={auditMark(audit)} size={13} />
                        {audit.id} · {AUDIT_STATE_LABELS[audit.state]}
                        {audit.resolved ? ' (résolu)' : ''}
                      </Link>
                    )}
                    {commit.issueNumber === null ? null : (
                      <Link to={paths.issue(commit.issueNumber)} className="release-commit__issue num">
                        #{commit.issueNumber}
                      </Link>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      {release.prepHealth.length === 0 ? null : (
        <Section title="Santé PREP">
          <ul className="release-health">
            {release.prepHealth.map((check) => (
              <li key={check.name} className="release-health__item">
                <StatusMark mark={check.passed ? 'success' : 'failed'} size={14} />
                <span className="mono">{check.name}</span>
                <span className="release-health__detail">{check.detail}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {release.report.length === 0 ? null : (
        <Section title="Rapport d’audit de release">
          <CodeBlock code={release.report} wrap title="report.md" />
        </Section>
      )}
    </article>
  );
}
