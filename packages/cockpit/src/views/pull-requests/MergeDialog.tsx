import { GitMerge } from 'lucide-react';
import { useCommand } from '../../app/hooks.ts';
import type { PullRequestView } from '../../contract/index.ts';
import { shortSha } from '../../format/format.ts';
import { Button } from '../../ui/components/Button.tsx';
import { PropertyList } from '../../ui/components/Card.tsx';
import { Dialog } from '../../ui/components/Dialog.tsx';

interface MergeDialogProps {
  readonly pullRequest: PullRequestView;
  readonly open: boolean;
  readonly onClose: () => void;
}

export function MergeDialog({ pullRequest, open, onClose }: MergeDialogProps) {
  const command = useCommand();
  const passing = pullRequest.checks.filter((check) => check.conclusion === 'success').length;
  const confirm = () => {
    void command
      .run('pr.merge', { number: pullRequest.number, expectedHeadSha: pullRequest.headSha }, `#${pullRequest.number} mergée`)
      .then((merged) => {
        if (merged) onClose();
      });
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Merger #${pullRequest.number} ?`}
      description="L’usine fusionne la branche en squash sur la branche par défaut, uniquement si sa tête n’a pas bougé depuis cet écran."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Annuler
          </Button>
          <Button variant="primary" icon={<GitMerge size={14} />} loading={command.pending === 'pr.merge'} onClick={confirm}>
            Merger #{pullRequest.number}
          </Button>
        </>
      }
    >
      <PropertyList
        items={[
          { label: 'Pull request', value: pullRequest.title },
          { label: 'Branche', value: <span className="mono">{pullRequest.branch}</span> },
          { label: 'Tête attendue', value: <span className="mono">{shortSha(pullRequest.headSha)}</span> },
          { label: 'Checks', value: `${passing} sur ${pullRequest.checks.length} réussis` },
          { label: 'Preuves', value: pullRequest.evidenceComplete ? 'complètes' : 'incomplètes' },
        ]}
      />
    </Dialog>
  );
}
