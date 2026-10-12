import { useState } from 'react';
import { CheckCheck, Play } from 'lucide-react';
import { useProject } from '../../app/ProjectRoute.tsx';
import type { CommandBody, ProposedSpec, RequestView } from '../../contract/index.ts';
import type { Translate } from '../../i18n/create-i18n.ts';
import { useI18n } from '../../i18n/I18nProvider.tsx';
import { Button } from '../../ui/components/Button.tsx';
import { CommandDialog } from '../../widgets/CommandDialog.tsx';

const ICON_SIZE = 14;

/** What the operator reads on the button and in the confirmation of one way to accept specs. */
interface AcceptCopy {
  readonly button: string;
  readonly title: string;
  readonly description: string;
  readonly confirm: string;
}

/** The issues wait as drafts for the operator to validate their specs. */
function draftCopy(t: Translate, count: number): AcceptCopy {
  return {
    button: t('requests.accept.button'),
    title: t('requests.accept.title', { count }),
    description: t('requests.accept.description'),
    confirm: t('requests.accept.confirm', { count }),
  };
}

/** The operator orders the work to start: the specs are validated as the issues are created. */
function startCopy(t: Translate, count: number): AcceptCopy {
  return {
    button: t('requests.accept.startButton'),
    title: t('requests.accept.startTitle', { count }),
    description: t('requests.accept.startDescription'),
    confirm: t('requests.accept.startConfirm', { count }),
  };
}

interface AcceptActionProps {
  readonly request: Pick<RequestView, 'id'>;
  readonly specs: readonly ProposedSpec[];
  /** Whether the issues are validated and started as they are created. */
  readonly start: boolean;
}

function AcceptAction({ request, specs, start }: AcceptActionProps) {
  const { t } = useI18n();
  const project = useProject();
  const [confirming, setConfirming] = useState(false);
  const count = specs.length;
  const copy = start ? startCopy(t, count) : draftCopy(t, count);
  const body: CommandBody<'request.accept'> | null = count === 0 ? null : { project: project.id, requestId: request.id, specIds: specs.map((spec) => spec.id), start };
  return (
    <>
      <Button variant={start ? 'secondary' : 'primary'} icon={start ? <Play size={ICON_SIZE} /> : <CheckCheck size={ICON_SIZE} />} disabled={count === 0} onClick={() => setConfirming(true)}>
        {copy.button}
      </Button>
      <CommandDialog open={confirming} onClose={() => setConfirming(false)} command="request.accept" body={body} title={copy.title} description={copy.description} confirmLabel={copy.confirm}>
        <ul className="bullets" aria-label={t('requests.accept.chosen')}>
          {specs.map((spec) => (
            <li key={spec.id}>{spec.title}</li>
          ))}
        </ul>
      </CommandDialog>
    </>
  );
}

interface AcceptSpecsProps {
  readonly request: Pick<RequestView, 'id'>;
  readonly specs: readonly ProposedSpec[];
}

/** The two ways to turn the chosen specs into issues: as drafts to validate, or validated and started at once. */
export function AcceptSpecs({ request, specs }: AcceptSpecsProps) {
  return (
    <>
      <AcceptAction request={request} specs={specs} start={false} />
      <AcceptAction request={request} specs={specs} start />
    </>
  );
}
