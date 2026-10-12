import { useState } from 'react';
import { MessageCircleQuestionMark, Send } from 'lucide-react';
import { useCommand } from '../../app/hooks.ts';
import type { PendingQuestion } from '../../contract/index.ts';
import { Button } from '../../ui/components/Button.tsx';
import { Field, TextArea } from '../../ui/components/Field.tsx';

interface QuestionPanelProps {
  readonly runId: string;
  readonly question: PendingQuestion;
}

export function QuestionPanel({ runId, question }: QuestionPanelProps) {
  const command = useCommand();
  const [answer, setAnswer] = useState('');
  const send = (text: string) => {
    if (text.trim().length === 0) return;
    void command.run('run.answer', { runId, questionId: question.id, answer: text.trim() }, 'Réponse envoyée à l’agent');
  };
  const pending = command.pending === 'run.answer';
  return (
    <section className="callout callout--waiting run-question" aria-labelledby={`question-${question.id}`}>
      <MessageCircleQuestionMark size={16} aria-hidden="true" />
      <div className="callout__body">
        <p className="callout__title" id={`question-${question.id}`}>
          L’agent attend votre réponse
        </p>
        <p className="run-question__text">{question.text}</p>
        {question.options.length === 0 ? null : (
          <div className="run-question__options">
            {question.options.map((option) => (
              <Button key={option} variant="secondary" size="sm" disabled={pending} onClick={() => send(option)}>
                {option}
              </Button>
            ))}
          </div>
        )}
        <form
          className="run-question__form"
          onSubmit={(event) => {
            event.preventDefault();
            send(answer);
          }}
        >
          <Field label="Réponse libre" hideLabel>
            {(id) => (
              <TextArea id={id} rows={2} placeholder="Ou écrivez votre réponse…" value={answer} onChange={(event) => setAnswer(event.currentTarget.value)} />
            )}
          </Field>
          <Button type="submit" variant="primary" size="sm" icon={<Send size={13} />} loading={pending} disabled={answer.trim().length === 0}>
            Répondre
          </Button>
        </form>
      </div>
    </section>
  );
}
