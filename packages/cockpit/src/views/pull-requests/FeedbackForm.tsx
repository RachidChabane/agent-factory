import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import { useCommand, useSnapshot } from '../../app/hooks.ts';
import type { CommandBody, PullRequestView } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { Field, TextArea, TextInput } from '../../ui/components/Field.tsx';

const BODY_ROWS = 4;
const ICON_SIZE = 14;

/** Pastes the feedback of someone outside the factory onto a pull request; the author is the operator unless said otherwise. */
export function FeedbackForm({ pullRequest }: { readonly pullRequest: Pick<PullRequestView, 'number'> }) {
  const { t } = useI18n();
  const project = useProject();
  const { operator } = useSnapshot().installation;
  const command = useCommand();
  const [author, setAuthor] = useState(operator);
  const [text, setText] = useState('');
  const [attempted, setAttempted] = useState(false);
  const trimmedAuthor = author.trim();
  const trimmedText = text.trim();
  const body: CommandBody<'pr.feedback'> | null =
    trimmedAuthor.length === 0 || trimmedText.length === 0 ? null : { project: project.id, number: pullRequest.number, author: trimmedAuthor, body: trimmedText };
  const submit = async () => {
    setAttempted(true);
    if (body === null) return;
    if (await command.run('pr.feedback', body)) {
      setText('');
      setAttempted(false);
    }
  };
  return (
    <form
      className="feedback__form"
      aria-label={t('pullRequests.feedback.form')}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <Field label={t('pullRequests.feedback.author')} error={attempted && trimmedAuthor.length === 0 ? t('pullRequests.feedback.errorAuthor') : null}>
        {(id, describedBy) => <TextInput id={id} aria-describedby={describedBy} value={author} onChange={(event) => setAuthor(event.currentTarget.value)} />}
      </Field>
      <Field label={t('pullRequests.feedback.body')} hint={t('pullRequests.feedback.bodyHint')} error={attempted && trimmedText.length === 0 ? t('pullRequests.feedback.errorBody') : null}>
        {(id, describedBy) => (
          <TextArea
            id={id}
            aria-describedby={describedBy}
            rows={BODY_ROWS}
            placeholder={t('pullRequests.feedback.bodyPlaceholder')}
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
          />
        )}
      </Field>
      <div className="feedback__actions">
        <Button type="submit" variant="secondary" icon={<MessageSquarePlus size={ICON_SIZE} />} loading={command.pending === 'pr.feedback'}>
          {t('pullRequests.feedback.submit')}
        </Button>
      </div>
    </form>
  );
}
