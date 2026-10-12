import type { ReactNode } from 'react';
import { useState } from 'react';
import { Link } from 'react-router';
import { CalendarClock, CircleAlert, ExternalLink, FileText, GitBranch, GitCommitHorizontal, Lightbulb, Send, ShieldCheck, User } from 'lucide-react';
import type { AuditReason } from '@agent-factory/domain';
import { useCommand } from '../../app/hooks.ts';
import type { AuditFindingLevel, AuditView, CockpitSnapshot } from '../../contract/index.ts';
import { AUDIT_FINDING_LEVELS } from '../../contract/index.ts';
import { dateTime, plural, shortSha } from '../../format/format.ts';
import { AUDIT_FINDING_LEVEL_LABELS, AUDIT_REASON_LABELS, AUDIT_STATE_LABELS, issueTypeLabel } from '../../i18n/labels.ts';
import { paths, VIEW_PATHS } from '../../model/routes.ts';
import { auditMark } from '../../model/status.ts';
import { Badge } from '../../ui/components/Badge.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { CodeBlock } from '../../ui/components/CodeBlock.tsx';
import { CopyButton } from '../../ui/components/CopyButton.tsx';
import { Dialog } from '../../ui/components/Dialog.tsx';
import { EmptyState } from '../../ui/components/EmptyState.tsx';
import { Field, TextArea } from '../../ui/components/Field.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { DetailHeader, MetaItem } from '../../ui/layout/Page.tsx';

const REASON_EXPLANATIONS: Readonly<Record<AuditReason, (audit: AuditView) => string>> = {
  'direct-push': () => 'Le commit a été poussé directement sur la branche par défaut, sans pull request.',
  'bot-author': (audit) => `La pull request a été ouverte par un robot (${audit.authorLogin ?? 'inconnu'}).`,
  'branch-not-factory': (audit) => `La pull request vient de la branche ${audit.branch ?? 'inconnue'}, pas d’une branche factory/*.`,
  'missing-factory-label': () => 'La pull request vient d’une branche factory/* mais ne porte pas le label factory.',
  'on-demand': () => 'L’opérateur a demandé cet audit pour ce commit.',
};

const LEVEL_ICONS: Readonly<Record<AuditFindingLevel, ReactNode>> = {
  intent: <User size={14} />,
  idea: <Lightbulb size={14} />,
  method: <ShieldCheck size={14} />,
};

function ResolveDialog({ audit, open, onClose }: { readonly audit: AuditView; readonly open: boolean; readonly onClose: () => void }) {
  const command = useCommand();
  const [note, setNote] = useState('');
  const [attempted, setAttempted] = useState(false);
  const error = attempted && note.trim().length === 0 ? 'Notez comment l’audit a été résolu.' : null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={`Marquer ${audit.id} comme résolu ?`}
      description={audit.releaseId === null ? 'La note est conservée avec l’audit.' : `Le gate de la release ${audit.releaseId} sera réévalué.`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="primary"
            loading={command.pending === 'audit.resolve'}
            onClick={() => {
              setAttempted(true);
              if (note.trim().length === 0) return;
              void command.run('audit.resolve', { auditId: audit.id, note: note.trim() }, `${audit.id} résolu`).then((sent) => {
                if (sent) onClose();
              });
            }}
          >
            Marquer résolu
          </Button>
        </>
      }
    >
      <Field label="Note de résolution" error={error}>
        {(id, describedBy) => (
          <TextArea
            id={id}
            aria-describedby={describedBy}
            rows={3}
            placeholder="Ex. : section de ton revertée par #313, cas d’évaluation ajoutés."
            value={note}
            onChange={(event) => setNote(event.currentTarget.value)}
          />
        )}
      </Field>
    </Dialog>
  );
}

export function AuditDetail({ audit, snapshot }: { readonly audit: AuditView; readonly snapshot: CockpitSnapshot }) {
  const command = useCommand();
  const [resolveOpen, setResolveOpen] = useState(false);
  const needsOperator = (audit.state === 'challenge' || audit.state === 'rewrite') && !audit.resolved;
  const release = audit.releaseId === null ? undefined : snapshot.releases.find((entry) => entry.id === audit.releaseId);
  const blocksRelease = needsOperator && release !== undefined && release.state === 'blocked';
  const repositoryUrl = `https://github.com/${snapshot.factory.repository}`;
  const findingsByLevel = AUDIT_FINDING_LEVELS.map((level) => ({ level, findings: audit.conclusion?.findings.filter((finding) => finding.level === level) ?? [] }));
  return (
    <article className="detail audit-detail">
      <DetailHeader
        back={{ to: VIEW_PATHS.audits, label: 'Tous les audits' }}
        eyebrow={
          <>
            <StatusMark mark={auditMark(audit)} />
            <span>{AUDIT_STATE_LABELS[audit.state]}</span>
            {audit.resolved ? <Badge tone="success">Résolu</Badge> : null}
            <span className="mono">{audit.id}</span>
            <Badge>{AUDIT_REASON_LABELS[audit.reason]}</Badge>
          </>
        }
        title={audit.commitMessage}
        actions={
          <>
            {audit.draft !== null && audit.publishedIssueNumber === null && needsOperator ? (
              <Button
                variant="secondary"
                icon={<Send size={14} />}
                loading={command.pending === 'audit.publish-issue'}
                onClick={() => void command.run('audit.publish-issue', { auditId: audit.id }, 'Issue d’audit publiée')}
              >
                Publier l’issue d’audit
              </Button>
            ) : null}
            {needsOperator ? (
              <Button variant="primary" onClick={() => setResolveOpen(true)}>
                Marquer résolu
              </Button>
            ) : null}
          </>
        }
        meta={
          <>
            <MetaItem icon={<User size={13} />}>
              {audit.authorName ?? audit.authorLogin ?? 'Auteur inconnu'}
              {audit.authorName !== null && audit.authorLogin !== null ? <span className="subtle"> · {audit.authorLogin}</span> : null}
            </MetaItem>
            <MetaItem icon={<GitCommitHorizontal size={13} />}>
              <span className="mono">{shortSha(audit.commitSha)}</span>
              <CopyButton text={audit.commitSha} label="Copier le SHA" />
            </MetaItem>
            {audit.branch === null ? null : (
              <MetaItem icon={<GitBranch size={13} />}>
                <span className="mono">{audit.branch}</span>
              </MetaItem>
            )}
            {audit.pullRequestNumber === null ? null : (
              <MetaItem icon={<ExternalLink size={13} />}>
                <a className="link" href={`${repositoryUrl}/pull/${audit.pullRequestNumber}`} target="_blank" rel="noreferrer">
                  PR #{audit.pullRequestNumber}
                </a>
              </MetaItem>
            )}
            <MetaItem icon={<CalendarClock size={13} />}>détecté le {dateTime(audit.detectedAt)}</MetaItem>
          </>
        }
      />

      <div className="callout">
        <GitBranch size={16} aria-hidden="true" />
        <div className="callout__body">
          <p className="callout__title">{AUDIT_REASON_LABELS[audit.reason]}</p>
          <p>{REASON_EXPLANATIONS[audit.reason](audit)}</p>
        </div>
      </div>
      {blocksRelease && release !== undefined ? (
        <Link to={paths.release(release.id)} className="callout callout--failed audit-detail__release">
          <CircleAlert size={16} aria-hidden="true" />
          <div className="callout__body">
            <p className="callout__title">Bloque la release {release.id}</p>
            <p>La release n’est pas promouvable tant que cet audit n’est pas résolu.</p>
          </div>
        </Link>
      ) : null}
      {audit.resolutionNote === null ? null : (
        <div className="callout callout--success">
          <ShieldCheck size={16} aria-hidden="true" />
          <div className="callout__body">
            <p className="callout__title">Résolu</p>
            <p>{audit.resolutionNote}</p>
          </div>
        </div>
      )}
      {audit.failureCount === 0 ? null : (
        <div className="callout callout--running">
          <CircleAlert size={16} aria-hidden="true" />
          <div className="callout__body">
            <p className="callout__title">{plural(audit.failureCount, 'tentative d’audit en échec', 'tentatives d’audit en échec')}</p>
            {audit.lastFailure === null ? null : <p className="mono">{audit.lastFailure}</p>}
          </div>
        </div>
      )}

      <Section title="Verdict de l’auditeur" description={audit.conclusion?.summary}>
        {audit.conclusion === null ? (
          <EmptyState compact title={audit.state === 'auditing' ? 'Audit en cours' : 'En attente de l’auditeur'} description="L’auditeur juge l’intention, l’idée et la méthode, sources à l’appui." />
        ) : audit.conclusion.findings.length === 0 ? (
          <p className="audit-detail__clean">Aucun constat : le changement est conservé tel quel.</p>
        ) : (
          <div className="audit-findings">
            {findingsByLevel
              .filter((group) => group.findings.length > 0)
              .map((group) => (
                <div key={group.level} className="audit-findings__group">
                  <p className="audit-findings__level">
                    {LEVEL_ICONS[group.level]}
                    {AUDIT_FINDING_LEVEL_LABELS[group.level]}
                  </p>
                  {group.findings.map((finding) => (
                    <div key={finding.statement} className="audit-finding">
                      <p className="audit-finding__statement">{finding.statement}</p>
                      <p className="audit-finding__evidence mono">{finding.evidence}</p>
                    </div>
                  ))}
                </div>
              ))}
          </div>
        )}
      </Section>

      {audit.conclusion?.proposedFix === undefined || audit.conclusion.proposedFix === null ? null : (
        <Section title="Correction proposée">
          <p className="audit-detail__fix">{audit.conclusion.proposedFix}</p>
        </Section>
      )}

      <div className="audit-detail__grid">
        <Section title="Fichiers modifiés" description={audit.suggestedType === null ? undefined : `Type déduit : ${issueTypeLabel(audit.suggestedType)}`}>
          <ul className="audit-files">
            {audit.changedFiles.map((file) => (
              <li key={file} className="audit-file mono">
                <FileText size={13} aria-hidden="true" />
                <span className="audit-file__path">{file}</span>
              </li>
            ))}
          </ul>
        </Section>
        {audit.draft === null ? null : (
          <Section
            title="Issue d’audit"
            description={audit.publishedIssueNumber === null ? 'Brouillon prêt à publier sur le dépôt cible.' : undefined}
            actions={
              audit.publishedIssueNumber === null ? undefined : (
                <a className="link" href={`${repositoryUrl}/issues/${audit.publishedIssueNumber}`} target="_blank" rel="noreferrer">
                  Publiée : #{audit.publishedIssueNumber}
                </a>
              )
            }
          >
            <div className="audit-draft">
              <p className="audit-draft__title">{audit.draft.title}</p>
              <CodeBlock code={audit.draft.body} wrap copyable={false} maxHeight={280} />
            </div>
          </Section>
        )}
      </div>
      <ResolveDialog audit={audit} open={resolveOpen} onClose={() => setResolveOpen(false)} />
    </article>
  );
}
