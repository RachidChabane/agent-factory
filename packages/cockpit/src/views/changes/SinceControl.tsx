import { Check } from 'lucide-react';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { Field, TextInput } from '../../ui/components/Field.tsx';
import { Segmented } from '../../ui/components/Tabs.tsx';
import type { SinceChoice } from './changes-since.ts';
import { CUSTOM_SINCE, fromLocalInputValue, SINCE_PRESETS, toLocalInputValue } from './changes-since.ts';

const CHOICES: readonly SinceChoice[] = [...SINCE_PRESETS, CUSTOM_SINCE];
const CHECK_SIZE = 14;

interface SinceControlProps {
  readonly since: number;
  readonly choice: SinceChoice;
  readonly seenAt: number | null;
  readonly onChoose: (choice: SinceChoice) => void;
  readonly onCustom: (epoch: number) => void;
  readonly onMarkSeen: () => void;
}

/** Where the changes start: a preset, any date, or the moment the operator last marked the changes as seen. */
export function SinceControl({ since, choice, seenAt, onChoose, onCustom, onMarkSeen }: SinceControlProps) {
  const { t, fmt } = useI18n();
  return (
    <div className="changes-since">
      <Segmented label={t('changes.since.label')} size="sm" value={choice} onChange={onChoose} items={CHOICES.map((id) => ({ id, label: t(`changes.since.choice.${id}`) }))} />
      <Field label={t('changes.since.field')} hideLabel>
        {(id) => (
          <TextInput
            id={id}
            type="datetime-local"
            className="changes-since__input"
            value={toLocalInputValue(since)}
            onChange={(event) => {
              const epoch = fromLocalInputValue(event.target.value);
              if (epoch !== null) onCustom(epoch);
            }}
          />
        )}
      </Field>
      <Button size="sm" variant="secondary" icon={<Check size={CHECK_SIZE} />} onClick={onMarkSeen}>
        {t('changes.since.markSeen')}
      </Button>
      <p className="changes-since__seen">{seenAt === null ? t('changes.since.neverSeen') : t('changes.since.seen', { when: fmt.dateTime(new Date(seenAt).toISOString()) })}</p>
    </div>
  );
}
