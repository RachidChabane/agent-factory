import { useId, useState } from 'react';
import { MessageCircleQuestionMark, Send } from 'lucide-react';
import { useCommand } from '../../app/hooks.ts';
import type { PendingQuestion } from '../../contract/index.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { Field, TextArea } from '../../ui/components/Field.tsx';
import { Time } from '../../widgets/Time.tsx';

const ICON_SIZE = 16;
const BUTTON_ICON_SIZE = 13;
const ANSWER_ROWS = 2;

interface QuestionPanelProps {
  readonly runId: string;
  readonly question: PendingQuestion;
}

/** The question an agent stopped to ask: its suggested answers as buttons, and a field to answer in words. */
export function QuestionPanel({ runId, question }: QuestionPanelProps) {
  const { t, rich } = useI18n();
  const command = useCommand();
  const titleId = useId();
  const [answer, setAnswer] = useState('');
  const pending = command.pending === 'run.answer';
  const suggestions = question.options.filter((option) => option.trim().length > 0);
  const typed = answer.trim();

  const send = (text: string) => command.run('run.answer', { runId, questionId: question.id, answer: text });
  const sendTyped = async () => {
    if (typed.length > 0 && (await send(typed))) setAnswer('');
  };

  return (
    <section className="callout callout--waiting run-question" aria-labelledby={titleId}>
      <MessageCircleQuestionMark size={ICON_SIZE} aria-hidden="true" />
      <div className="callout__body">
        <p className="callout__title" id={titleId}>
          {t('runs.question.title')}
        </p>
        <p className="run-question__asked">{rich('runs.question.asked', { when: <Time iso={question.askedAt} /> })}</p>
        <p className="run-question__text">{question.text}</p>
        {suggestions.length === 0 ? null : (
          <div className="run-question__options" role="group" aria-label={t('runs.question.options')}>
            {suggestions.map((option, position) => (
              <Button key={`${position}-${option}`} variant="secondary" size="sm" disabled={pending} onClick={() => void send(option)}>
                {option}
              </Button>
            ))}
          </div>
        )}
        <form
          className="run-question__form"
          onSubmit={(event) => {
            event.preventDefault();
            void sendTyped();
          }}
        >
          <Field label={t('runs.question.field')} hideLabel>
            {(id) => <TextArea id={id} rows={ANSWER_ROWS} placeholder={t('runs.question.placeholder')} value={answer} disabled={pending} onChange={(event) => setAnswer(event.currentTarget.value)} />}
          </Field>
          <Button type="submit" variant="primary" size="sm" icon={<Send size={BUTTON_ICON_SIZE} />} loading={pending} disabled={typed.length === 0}>
            {t('runs.question.send')}
          </Button>
        </form>
      </div>
    </section>
  );
}
