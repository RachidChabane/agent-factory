import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { useNow } from '../../app/context.tsx';
import { useCommand, useSnapshot } from '../../app/hooks.ts';
import type { PullRequestView } from '../../contract/index.ts';
import { relativeTime } from '../../format/format.ts';
import { Avatar } from '../../ui/components/Avatar.tsx';
import { Badge } from '../../ui/components/Badge.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { Field, TextArea, TextInput } from '../../ui/components/Field.tsx';

export function ExternalFeedback({ pullRequest }: { readonly pullRequest: PullRequestView }) {
  const now = useNow();
  const snapshot = useSnapshot();
  const command = useCommand();
  const [author, setAuthor] = useState('');
  const [body, setBody] = useState('');
  const [attempted, setAttempted] = useState(false);
  const bodyError = attempted && body.trim().length === 0 ? 'Collez le retour à transmettre.' : null;
  const authorError = attempted && author.trim().length === 0 ? 'Indiquez qui a fait ce retour.' : null;
  const submit = () => {
    setAttempted(true);
    if (body.trim().length === 0 || author.trim().length === 0) return;
    void command
      .run('pr.feedback', { number: pullRequest.number, author: author.trim(), body: body.trim() }, 'Retour transmis : nouveau cycle lancé')
      .then((sent) => {
        if (!sent) return;
        setBody('');
        setAttempted(false);
      });
  };
  return (
    <div className="feedback">
      {pullRequest.externalFeedback.length === 0 ? (
        <p className="feedback__empty">Aucun retour externe sur cette pull request.</p>
      ) : (
        <ul className="feedback__list">
          {pullRequest.externalFeedback.map((feedback) => (
            <li key={feedback.id} className="feedback__item">
              <Avatar name={feedback.author} size="md" />
              <div className="feedback__content">
                <p className="feedback__meta">
                  <strong>{feedback.author}</strong> · {feedback.source} · il y a {relativeTime(feedback.receivedAt, now)}
                  {feedback.cycleStarted ? <Badge tone="accent">nouveau cycle lancé</Badge> : null}
                </p>
                <p className="feedback__body">{feedback.body}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {pullRequest.state === 'open' ? (
        <form
          className="feedback__form"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <Field label="Auteur du retour" error={authorError}>
            {(id, describedBy) => (
              <TextInput
                id={id}
                aria-describedby={describedBy}
                placeholder={snapshot?.factory.operator ?? 'Nom'}
                value={author}
                onChange={(event) => setAuthor(event.currentTarget.value)}
              />
            )}
          </Field>
          <Field label="Retour externe" error={bodyError} hint="Collé tel quel : l’usine en fait la consigne d’un nouveau cycle d’implémentation.">
            {(id, describedBy) => (
              <TextArea
                id={id}
                aria-describedby={describedBy}
                rows={3}
                placeholder="Collez ici le retour du demandeur, d’un relecteur ou de la recette…"
                value={body}
                onChange={(event) => setBody(event.currentTarget.value)}
              />
            )}
          </Field>
          <div className="feedback__actions">
            <Button type="submit" variant="secondary" icon={<MessageSquarePlus size={14} />} loading={command.pending === 'pr.feedback'}>
              Lancer un nouveau cycle
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
