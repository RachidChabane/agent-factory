import { useState } from 'react';
import { Link } from 'react-router';
import { Ban, CalendarClock, CheckCheck, Loader, MessageSquare, Paperclip, Scale, User } from 'lucide-react';
import { useNow } from '../../app/context.tsx';
import { useCommand } from '../../app/hooks.ts';
import type { CockpitSnapshot, RequestView } from '../../contract/index.ts';
import { dateTime, plural, relativeTime } from '../../format/format.ts';
import { ISSUE_STATE_LABELS, REQUEST_STATE_LABELS } from '../../i18n/labels.ts';
import { paths, VIEW_PATHS } from '../../model/routes.ts';
import { issueMark, requestMark } from '../../model/status.ts';
import { Button } from '../../ui/components/Button.tsx';
import { Section } from '../../ui/components/Card.tsx';
import { CopyButton } from '../../ui/components/CopyButton.tsx';
import { Dialog } from '../../ui/components/Dialog.tsx';
import { Field, TextArea } from '../../ui/components/Field.tsx';
import { StatusMark } from '../../ui/components/StatusMark.tsx';
import { DetailHeader, MetaItem } from '../../ui/layout/Page.tsx';
import { ChallengeItems, VerdictSummary } from './ChallengeReport.tsx';
import { SpecCard } from './SpecCard.tsx';

const CHALLENGEABLE: readonly RequestView['state'][] = ['received', 'waiting-requester'];
const DECLINABLE: readonly RequestView['state'][] = ['received', 'challenged', 'waiting-requester'];

function DeclineDialog({ request, open, onClose }: { readonly request: RequestView; readonly open: boolean; readonly onClose: () => void }) {
  const command = useCommand();
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const error = attempted && reason.trim().length === 0 ? 'Expliquez pourquoi la demande est déclinée.' : null;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={`Décliner ${request.id} ?`}
      description="La raison est conservée avec la demande ; aucune issue ne sera créée."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button
            variant="danger"
            loading={command.pending === 'request.decline'}
            onClick={() => {
              setAttempted(true);
              if (reason.trim().length === 0) return;
              void command.run('request.decline', { requestId: request.id, reason: reason.trim() }, `${request.id} déclinée`).then((sent) => {
                if (sent) onClose();
              });
            }}
          >
            Décliner la demande
          </Button>
        </>
      }
    >
      <Field label="Raison" error={error}>
        {(id, describedBy) => <TextArea id={id} aria-describedby={describedBy} rows={3} value={reason} onChange={(event) => setReason(event.currentTarget.value)} />}
      </Field>
    </Dialog>
  );
}

export function RequestDetail({ request, snapshot }: { readonly request: RequestView; readonly snapshot: CockpitSnapshot }) {
  const now = useNow();
  const command = useCommand();
  const [declineOpen, setDeclineOpen] = useState(false);
  const pendingSpecs = request.challenge?.specs.filter((spec) => spec.issueNumber === null) ?? [];
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set(pendingSpecs.map((spec) => spec.id)));
  const challengeRun = snapshot.runs.find((run) => run.subject.kind === 'request' && run.subject.id === request.id && run.status === 'running');
  const issues = snapshot.issues.filter((issue) => request.issueNumbers.includes(issue.number));
  const canAccept = request.state === 'challenged' && selected.size > 0;
  const toggle = (specId: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(specId)) next.delete(specId);
      else next.add(specId);
      return next;
    });
  return (
    <article className="detail request-detail">
      <DetailHeader
        back={{ to: VIEW_PATHS.requests, label: 'Toutes les demandes' }}
        eyebrow={
          <>
            <StatusMark mark={requestMark(request.state)} />
            <span>{REQUEST_STATE_LABELS[request.state]}</span>
            <span className="mono">{request.id}</span>
          </>
        }
        title={request.title}
        actions={
          <>
            {DECLINABLE.includes(request.state) ? (
              <Button variant="ghost" icon={<Ban size={14} />} onClick={() => setDeclineOpen(true)}>
                Décliner
              </Button>
            ) : null}
            {CHALLENGEABLE.includes(request.state) ? (
              <Button
                variant="primary"
                icon={<Scale size={14} />}
                loading={command.pending === 'request.challenge'}
                onClick={() => void command.run('request.challenge', { requestId: request.id }, `Challenge de ${request.id} lancé`)}
              >
                Lancer le challenge
              </Button>
            ) : null}
            {request.state === 'challenged' ? (
              <Button
                variant="primary"
                icon={<CheckCheck size={14} />}
                disabled={!canAccept}
                loading={command.pending === 'request.accept'}
                onClick={() => void command.run('request.accept', { requestId: request.id, specIds: [...selected] }, `${plural(selected.size, 'issue créée', 'issues créées')} en brouillon`)}
              >
                Créer {selected.size} issue{selected.size > 1 ? 's' : ''}
              </Button>
            ) : null}
          </>
        }
        meta={
          <>
            <MetaItem icon={<User size={13} />}>{request.requester}</MetaItem>
            <MetaItem icon={<MessageSquare size={13} />}>{request.channel}</MetaItem>
            <MetaItem icon={<CalendarClock size={13} />}>reçue le {dateTime(request.receivedAt)}</MetaItem>
          </>
        }
      />

      {challengeRun === undefined ? null : (
        <Link to={paths.run(challengeRun.id)} className="callout callout--running request-detail__running">
          <Loader size={16} aria-hidden="true" />
          <div className="callout__body">
            <p className="callout__title">Le challengeur examine la demande</p>
            <p>{challengeRun.lastLine ?? 'Lecture du dépôt et de la base de connaissances…'}</p>
          </div>
        </Link>
      )}
      {request.declineReason === null ? null : (
        <div className="callout">
          <Ban size={16} aria-hidden="true" />
          <div className="callout__body">
            <p className="callout__title">Demande déclinée</p>
            <p>{request.declineReason}</p>
          </div>
        </div>
      )}

      <Section title="Demande d’origine" description={`Reçue il y a ${relativeTime(request.receivedAt, now)}`}>
        <blockquote className="request-body">{request.body}</blockquote>
        {request.attachments.length === 0 ? null : (
          <ul className="request-attachments">
            {request.attachments.map((attachment) => (
              <li key={attachment.name} className="request-attachment">
                <Paperclip size={13} aria-hidden="true" />
                <span className="truncate">{attachment.name}</span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {request.challenge === null ? null : (
        <>
          <Section title={`Rapport de challenge · ${request.challenge.items.length} points`} description={request.challenge.summary} actions={<VerdictSummary report={request.challenge} />}>
            <ChallengeItems report={request.challenge} />
          </Section>
          {request.challenge.reply.length === 0 ? null : (
            <Section title="Réponse proposée au demandeur" actions={<CopyButton text={request.challenge.reply} label="Copier la réponse" withText />}>
              <div className="request-reply">{request.challenge.reply}</div>
            </Section>
          )}
          {request.challenge.specs.length === 0 ? null : (
            <Section
              title="Spécifications proposées"
              description={request.state === 'challenged' ? 'Cochez les specs à transformer en issues ; chacune reste à valider avant planification.' : undefined}
            >
              <div className="spec-list">
                {request.challenge.specs.map((spec) => (
                  <SpecCard
                    key={spec.id}
                    requestId={request.id}
                    spec={spec}
                    selected={selected.has(spec.id)}
                    selectable={request.state === 'challenged' && spec.issueNumber === null}
                    onToggle={toggle}
                  />
                ))}
              </div>
            </Section>
          )}
        </>
      )}

      {issues.length === 0 ? null : (
        <Section title="Issues créées">
          <ul className="request-issues">
            {issues.map((issue) => (
              <li key={issue.number}>
                <Link to={paths.issue(issue.number)} className="request-issue">
                  <StatusMark mark={issueMark(issue.state)} size={14} />
                  <span className="num subtle">#{issue.number}</span>
                  <span className="truncate">{issue.title}</span>
                  <span className="request-issue__state">{ISSUE_STATE_LABELS[issue.state]}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <DeclineDialog request={request} open={declineOpen} onClose={() => setDeclineOpen(false)} />
    </article>
  );
}
