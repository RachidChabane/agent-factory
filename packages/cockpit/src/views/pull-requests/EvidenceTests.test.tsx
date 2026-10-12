import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { acceptance, BEFORE_SHA, CHIPS_TITLE, redGreen, show } from './evidence-test-support.tsx';

describe('EvidenceGallery red to green', () => {
  it('shows the command that was run, with a button to copy it', async () => {
    await show([redGreen]);
    expect(screen.getByText(redGreen.command)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy the command' })).toBeInTheDocument();
  });

  it('shows the run on the base with its short commit, its outcome and the tests that failed', async () => {
    await show([redGreen]);
    const before = screen.getByRole('region', { name: 'Before, on the base' });
    expect(within(before).getByText('17f331e')).toHaveAttribute('title', BEFORE_SHA);
    expect(within(before).getByText('Failed')).toBeInTheDocument();
    expect(within(before).getByText('3 tests failed')).toBeInTheDocument();
    const failures = within(before).getByRole('list', { name: 'Failed tests' });
    expect(within(failures).getByText('price phrases > reads "under 60" as a maximum of 60 euros')).toBeInTheDocument();
    expect(within(failures).getAllByText('parsePriceBound is not a function')).toHaveLength(2);
  });

  it('shows the run on the branch as passed', async () => {
    await show([redGreen]);
    const after = screen.getByRole('region', { name: 'After, on the branch' });
    expect(within(after).getByText('Passed')).toBeInTheDocument();
    expect(within(after).getByText('3 tests passed')).toBeInTheDocument();
    expect(within(after).queryByRole('list', { name: 'Failed tests' })).not.toBeInTheDocument();
  });

  it('keeps the full log of each run in a code block under a closed disclosure', async () => {
    await show([redGreen]);
    const disclosures = screen.getAllByText('Full log').map((summary) => summary.closest('details'));
    expect(disclosures).toHaveLength(2);
    for (const disclosure of disclosures) expect(disclosure).not.toHaveAttribute('open');
    expect(screen.getByText(/TypeError: parsePriceBound is not a function/)).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Copy the content' })).toHaveLength(2);
  });

  it('lists the tests that went missing from the branch, and says that no test ran', async () => {
    await show([{ ...redGreen, before: { ...redGreen.before, summary: { passed: 0, failed: 0, skipped: 0, failures: [], missing: ['promo-messages'] } } }]);
    const before = screen.getByRole('region', { name: 'Before, on the base' });
    expect(within(before).getByText('No test ran')).toBeInTheDocument();
    const list = within(before).getByRole('list', { name: 'Tests missing from the branch' });
    expect(within(list).getByText('promo-messages')).toBeInTheDocument();
    expect(within(list).getByText('Missing from the branch')).toBeInTheDocument();
  });

  it('opens the log, which is then all there is, when the run has no summary', async () => {
    await show([{ ...redGreen, before: { ...redGreen.before, summary: null } }]);
    const before = screen.getByRole('region', { name: 'Before, on the base' });
    expect(within(before).getByText('No summary of this run is recorded.')).toBeInTheDocument();
    expect(within(before).getByText('Full log').closest('details')).toHaveAttribute('open');
    expect(within(screen.getByRole('region', { name: 'After, on the branch' })).getByText('Full log').closest('details')).not.toHaveAttribute('open');
  });

  it('says that a log is empty instead of showing an empty block', async () => {
    await show([{ ...redGreen, after: { ...redGreen.after, log: '  ' } }]);
    expect(within(screen.getByRole('region', { name: 'After, on the branch' })).getByText('The log is empty.')).toBeInTheDocument();
  });

  it('shows no commit for a run whose commit was not recorded', async () => {
    await show([{ ...redGreen, before: { ...redGreen.before, sha: '' } }]);
    expect(within(screen.getByRole('region', { name: 'Before, on the base' })).queryByText('17f331e')).not.toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'After, on the branch' })).getByText('7d59d45')).toBeInTheDocument();
  });
});

describe('EvidenceGallery acceptance tests', () => {
  it('groups the tests under their criterion with its wording, and shows how each fared on the base and on the branch', async () => {
    await show([acceptance]);
    const table = screen.getByRole('table', { name: 'Acceptance tests' });
    const headings = within(table)
      .getAllByRole('columnheader')
      .map((heading) => heading.textContent);
    expect(headings.slice(0, 3)).toEqual(['Test', 'On the base', 'On the branch']);
    expect(headings.slice(3)).toEqual([
      'Criterion 1A colour word of the catalogue filters the results to that colour.',
      expect.stringMatching(/^Criterion 2"under 60"/),
      'Criterion 3The active filters are shown as removable chips above the results.',
      'Criterion 4A word that is neither a catalogue colour nor a price phrase stays in the search terms.',
    ]);
    expect(within(table).getAllByText('Red (assertion)')).toHaveLength(2);
    expect(within(table).getAllByText('Red (error)')).toHaveLength(3);
    expect(within(table).getAllByText('Green')).toHaveLength(5);
  });

  it('keeps a test that serves two criteria under each of them', async () => {
    await show([acceptance]);
    expect(within(screen.getByRole('table')).getAllByText('turns a sentence into filters the customer can see and remove')).toHaveLength(2);
  });

  it('shows the file and the name of the test, the file on hover', async () => {
    await show([acceptance]);
    const row = screen.getAllByText('price phrases > reads "under 60" as a maximum of 60 euros')[0];
    expect(row).toHaveAttribute('title', 'web/src/search/filter-chips.test.ts');
  });

  it('names the runner of the tests, or says that none is named', async () => {
    await show([{ ...acceptance, runner: 'playwright' }]);
    expect(screen.getByText('Run with Playwright')).toBeInTheDocument();
  });

  it('says that no runner is named when the manifest names none', async () => {
    await show([acceptance]);
    expect(screen.getByText('No test runner is named')).toBeInTheDocument();
    expect(screen.queryByText(/^Run with/)).not.toBeInTheDocument();
  });

  it('keeps a criterion that no test covers and says so', async () => {
    await show([{ ...acceptance, criteria: [...acceptance.criteria, { criterion: 5, text: 'The chips can be removed with the keyboard.' }] }]);
    const table = screen.getByRole('table');
    expect(within(table).getByText('The chips can be removed with the keyboard.')).toBeInTheDocument();
    expect(within(table).getByText('No test covers this criterion')).toBeInTheDocument();
  });

  it('heads a criterion whose wording was not recorded by its number alone', async () => {
    await show([{ ...acceptance, criteria: [] }]);
    const headings = within(screen.getByRole('table'))
      .getAllByRole('columnheader')
      .map((heading) => heading.textContent)
      .slice(3);
    expect(headings).toEqual(['Criterion 1', 'Criterion 2', 'Criterion 3', 'Criterion 4']);
  });
});

describe('EvidenceGallery tests in French', () => {
  it('words the frames, the runs and the counts in French', async () => {
    await show([redGreen, acceptance], { locale: 'fr' });
    expect(within(screen.getByRole('figure', { name: CHIPS_TITLE })).getByText('Du rouge au vert')).toBeInTheDocument();
    const before = screen.getByRole('region', { name: 'Avant, sur la base' });
    expect(within(before).getByText('3 tests en échec')).toBeInTheDocument();
    expect(within(before).getByRole('list', { name: 'Tests en échec' })).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Après, sur la branche' })).getByText('3 tests réussis')).toBeInTheDocument();
    expect(screen.getAllByText('Journal complet')).toHaveLength(2);
    expect(screen.getByRole('table', { name: 'Tests d’acceptation' })).toBeInTheDocument();
    expect(screen.getByText('Critère 1')).toBeInTheDocument();
    expect(screen.getByText('Aucun lanceur de tests n’est indiqué')).toBeInTheDocument();
  });
});
