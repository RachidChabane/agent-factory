import { useState } from 'react';
import { Archive, CircleCheck, FilePen, Pause, Play, RotateCcw } from 'lucide-react';
import { ACTIVE_PIPELINE_STATES, CHECK_REWRITABLE_STATES, ISSUE_ESCALATION_STATE } from '@agent-factory/domain';
import { useCommand } from '../../app/hooks.ts';
import type { IssueView } from '../../contract/index.ts';
import { ISSUE_STATE_LABELS } from '../../i18n/labels.ts';
import { Button } from '../../ui/components/Button.tsx';
import { Dialog } from '../../ui/components/Dialog.tsx';
import { Field, Select, TextArea } from '../../ui/components/Field.tsx';
import { dependenciesMerged } from './issue-model.ts';

export function IssueActions({ issue, issues }: { readonly issue: IssueView; readonly issues: readonly IssueView[] }) {
  const command = useCommand();
  const [rewriteOpen, setRewriteOpen] = useState(false);
  const [abandonOpen, setAbandonOpen] = useState(false);
  const busy = command.pending !== null;
  const active = ACTIVE_PIPELINE_STATES.includes(issue.state);
  return (
    <>
      {issue.state === 'spec-draft' ? (
        <Button
          variant="primary"
          icon={<CircleCheck size={14} />}
          loading={command.pending === 'issue.validate-spec'}
          onClick={() => void command.run('issue.validate-spec', { issueNumber: issue.number }, `Spec #${issue.number} validée`)}
        >
          Valider la spec
        </Button>
      ) : null}
      {issue.state === 'spec-validated' ? (
        <Button
          variant="primary"
          icon={<Play size={14} />}
          disabled={!dependenciesMerged(issue, issues) || busy}
          loading={command.pending === 'issue.start'}
          onClick={() => void command.run('issue.start', { issueNumber: issue.number }, `#${issue.number} démarrée`)}
        >
          Démarrer
        </Button>
      ) : null}
      {issue.state === 'needs-human' && issue.resumeTarget !== null ? (
        <Button
          variant="primary"
          icon={<RotateCcw size={14} />}
          loading={command.pending === 'issue.resume'}
          onClick={() => void command.run('issue.resume', { issueNumber: issue.number }, `#${issue.number} reprend en « ${ISSUE_STATE_LABELS[issue.resumeTarget ?? issue.state]} »`)}
        >
          Reprendre
        </Button>
      ) : null}
      {issue.checks.some((check) => check.sha256 !== null) && (issue.state === ISSUE_ESCALATION_STATE || CHECK_REWRITABLE_STATES.includes(issue.state)) ? (
        <Button variant="secondary" icon={<FilePen size={14} />} onClick={() => setRewriteOpen(true)}>
          Réécrire un check
        </Button>
      ) : null}
      {issue.state === 'needs-human' ? (
        <Button variant="secondary" icon={<Archive size={14} />} onClick={() => setAbandonOpen(true)}>
          Abandonner
        </Button>
      ) : null}
      {active && !issue.paused ? (
        <Button variant="secondary" icon={<Pause size={14} />} loading={command.pending === 'issue.pause'} onClick={() => void command.run('issue.pause', { issueNumber: issue.number }, `#${issue.number} en pause`)}>
          Mettre en pause
        </Button>
      ) : null}
      {issue.paused ? (
        <Button variant="secondary" icon={<Play size={14} />} loading={command.pending === 'issue.resume'} onClick={() => void command.run('issue.resume', { issueNumber: issue.number }, `#${issue.number} reprend`)}>
          Reprendre
        </Button>
      ) : null}
      <RewriteCheckDialog issue={issue} open={rewriteOpen} onClose={() => setRewriteOpen(false)} />
      <AbandonDialog issue={issue} open={abandonOpen} onClose={() => setAbandonOpen(false)} />
    </>
  );
}

function AbandonDialog({ issue, open, onClose }: { readonly issue: IssueView; readonly open: boolean; readonly onClose: () => void }) {
  const command = useCommand();
  const [reason, setReason] = useState('');
  const [attempted, setAttempted] = useState(false);
  const error = attempted && reason.trim().length === 0 ? 'Donnez la raison de l’abandon.' : null;
  const submit = () => {
    setAttempted(true);
    if (reason.trim().length === 0) return;
    void command.run('issue.abandon', { issueNumber: issue.number, reason: reason.trim() }, `#${issue.number} abandonnée`).then((sent) => {
      if (!sent) return;
      setReason('');
      setAttempted(false);
      onClose();
    });
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Abandonner #${issue.number}`}
      description="L’usine arrête de travailler sur cette issue et libère son worktree. L’issue, sa branche et une éventuelle PR restent en l’état sur GitHub ; l’usine ne la redémarrera plus."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="danger" loading={command.pending === 'issue.abandon'} onClick={submit}>
            Abandonner l’issue
          </Button>
        </>
      }
    >
      <Field label="Raison" error={error} hint="Elle est enregistrée dans le journal de l’issue.">
        {(id, describedBy) => (
          <TextArea
            id={id}
            aria-describedby={describedBy}
            rows={3}
            placeholder="Ex. : la décision d’architecture sera prise dans une autre issue."
            value={reason}
            onChange={(event) => setReason(event.currentTarget.value)}
          />
        )}
      </Field>
    </Dialog>
  );
}

function RewriteCheckDialog({ issue, open, onClose }: { readonly issue: IssueView; readonly open: boolean; readonly onClose: () => void }) {
  const command = useCommand();
  const frozen = issue.checks.filter((check) => check.sha256 !== null);
  const [path, setPath] = useState(frozen[0]?.path ?? '');
  const [instruction, setInstruction] = useState('');
  const [attempted, setAttempted] = useState(false);
  const error = attempted && instruction.trim().length === 0 ? 'Décrivez ce que le check doit vérifier.' : null;
  const submit = () => {
    setAttempted(true);
    if (instruction.trim().length === 0 || path.length === 0) return;
    void command.run('issue.rewrite-check', { issueNumber: issue.number, path, instruction: instruction.trim() }, 'Réécriture du check demandée').then((sent) => {
      if (!sent) return;
      setInstruction('');
      setAttempted(false);
      onClose();
    });
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Réécrire un check gelé"
      description="Seul l’opérateur peut faire réécrire un check gelé. L’auteur des checks le réécrit, l’usine vérifie qu’il échoue sur la base puis le regèle."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" loading={command.pending === 'issue.rewrite-check'} onClick={submit}>
            Demander la réécriture
          </Button>
        </>
      }
    >
      <Field label="Check">
        {(id) => (
          <Select id={id} value={path} onChange={(event) => setPath(event.currentTarget.value)}>
            {frozen.map((check) => (
              <option key={check.path} value={check.path}>
                {check.path}
              </option>
            ))}
          </Select>
        )}
      </Field>
      <Field label="Consigne" error={error} hint="Ce que le check doit affirmer, en termes observables.">
        {(id, describedBy) => (
          <TextArea
            id={id}
            aria-describedby={describedBy}
            rows={4}
            placeholder="Ex. : sur un workspace français, le badge affiche « 0,42 € »."
            value={instruction}
            onChange={(event) => setInstruction(event.currentTarget.value)}
          />
        )}
      </Field>
    </Dialog>
  );
}
