import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { scores, show } from './evidence-test-support.tsx';

describe('EvidenceGallery evaluation scores', () => {
  it('states that the evaluation gate passed and on what grounds', async () => {
    await show([scores]);
    expect(screen.getByText('Evaluation gate passed')).toBeInTheDocument();
    expect(screen.getByText('Targeted cases: +0.63 on average')).toBeInTheDocument();
    expect(screen.getByText('No regression beyond the tolerance')).toBeInTheDocument();
    expect(screen.getByText('3 runs per case')).toBeInTheDocument();
    expect(screen.getByText('Minimum gain on targeted cases: +0.10 · regression tolerance: 0.02')).toBeInTheDocument();
  });

  it('lists the targeted cases first, each with its two scores and the change between them', async () => {
    await show([scores]);
    const bars = within(screen.getByRole('list', { name: 'Scores by case' })).getAllByRole('img');
    expect(bars.map((bar) => bar.getAttribute('aria-label'))).toEqual([
      'blue sneakers under 60: base 0.33, branch 1.00',
      'mug over 25,50: base 0.00, branch 1.00',
      'red kettle up to 40: base 0.67, branch 1.00',
      'white trainers less than 35: base 0.50, branch 1.00',
      'garden hose: base 1.00, branch 1.00',
      'tartan scarf: base 1.00, branch 1.00',
    ]);
    const first = within(screen.getByRole('img', { name: 'blue sneakers under 60: base 0.33, branch 1.00' }).closest('li') as HTMLElement);
    expect(first.getByText('+0.67')).toBeInTheDocument();
    expect(first.getByText('Targeted')).toBeInTheDocument();
    const untouched = within(screen.getByRole('img', { name: 'garden hose: base 1.00, branch 1.00' }).closest('li') as HTMLElement);
    expect(untouched.getByText('0.00')).toBeInTheDocument();
    expect(untouched.queryByText('Targeted')).not.toBeInTheDocument();
  });

  it('states that the gate failed and flags the case that regressed', async () => {
    const regressed = { ...scores, cases: scores.cases.map((entry) => (entry.caseId === 'no-filter' ? { ...entry, branchScore: 0.5 } : entry)) };
    await show([regressed]);
    expect(screen.getByText('Evaluation gate failed')).toBeInTheDocument();
    expect(screen.getByText('1 regression beyond the tolerance')).toBeInTheDocument();
    const row = within(screen.getByRole('img', { name: 'garden hose: base 1.00, branch 0.50' }).closest('li') as HTMLElement);
    expect(row.getByText('Regression')).toBeInTheDocument();
    expect(row.getByText('−0.50')).toBeInTheDocument();
  });

  it('names a case by its identifier when the evaluation gives it no label', async () => {
    await show([{ ...scores, cases: scores.cases.map((entry) => (entry.caseId === 'no-filter' ? { ...entry, label: null } : entry)) }]);
    expect(screen.getByRole('img', { name: 'no-filter: base 1.00, branch 1.00' })).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Scores by case' })).getByText('no-filter')).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /^garden hose:/ })).not.toBeInTheDocument();
  });

  it('says so when the number of runs per case was not recorded', async () => {
    await show([{ ...scores, runsPerCase: 0 }]);
    expect(screen.getByText('Runs per case not recorded')).toBeInTheDocument();
    expect(screen.queryByText(/runs? per case$/)).not.toBeInTheDocument();
  });

  it('says that no targeted case was scored', async () => {
    await show([{ ...scores, cases: scores.cases.map((entry) => ({ ...entry, targeted: false })) }]);
    expect(screen.getByText('No targeted case was scored')).toBeInTheDocument();
    expect(screen.getByText('Evaluation gate failed')).toBeInTheDocument();
  });
});

describe('EvidenceGallery scores in French', () => {
  it('writes scores with the decimal comma and counts regressions in the singular for one and none', async () => {
    await show([scores], { locale: 'fr' });
    expect(screen.getByText('Gate d’évaluation réussie')).toBeInTheDocument();
    expect(screen.getByText('Cas ciblés : +0,63 en moyenne')).toBeInTheDocument();
    expect(screen.getByText('Aucune régression au-delà de la tolérance')).toBeInTheDocument();
    expect(screen.getByText('3 exécutions par cas')).toBeInTheDocument();
  });

  it('words one regression in the singular', async () => {
    await show([{ ...scores, cases: scores.cases.map((entry) => (entry.caseId === 'no-filter' ? { ...entry, branchScore: 0.5 } : entry)) }], { locale: 'fr' });
    expect(screen.getByText('Gate d’évaluation en échec')).toBeInTheDocument();
    expect(screen.getByText('1 régression au-delà de la tolérance')).toBeInTheDocument();
    expect(screen.getByText('Régression')).toBeInTheDocument();
  });

  it('words several regressions in the plural', async () => {
    const regressed = new Set(['no-filter', 'unknown-colour']);
    await show([{ ...scores, cases: scores.cases.map((entry) => (regressed.has(entry.caseId) ? { ...entry, branchScore: 0.4 } : entry)) }], { locale: 'fr' });
    expect(screen.getByText('2 régressions au-delà de la tolérance')).toBeInTheDocument();
  });
});
