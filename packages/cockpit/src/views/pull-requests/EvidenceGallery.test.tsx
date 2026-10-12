import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { Evidence } from '../../contract/index.ts';
import { EvidenceItem } from './EvidenceGallery.tsx';

type RedGreenEvidence = Extract<Evidence, { kind: 'red-green' }>;
type AcceptanceTestsEvidence = Extract<Evidence, { kind: 'acceptance-tests' }>;

const FULL_LOG = '$ uv run pytest tests/test_x.py\n============ test session starts ============\nplatform linux -- Python 3.14.7';

const redGreen: RedGreenEvidence = {
  kind: 'red-green',
  id: 'red-green',
  title: 'Acceptance checks',
  command: 'uv run pytest tests/test_x.py',
  before: {
    outcome: 'failed',
    sha: 'c0ffee1',
    log: FULL_LOG,
    summary: {
      passed: 5,
      failed: 2,
      skipped: 0,
      failures: [
        { test: 'test_criterion_1_refuses_the_turn[os-error]', message: 'AssertionError: the turn was let through\nassert False' },
        { test: 'test_criterion_2_logs_once', message: null },
      ],
      missing: [],
    },
  },
  after: { outcome: 'passed', sha: 'a522eda', log: FULL_LOG, summary: { passed: 7, failed: 0, skipped: 0, failures: [], missing: [] } },
};

const acceptanceTests: AcceptanceTestsEvidence = {
  kind: 'acceptance-tests',
  id: 'acceptance-tests',
  title: 'Acceptance tests',
  runner: 'pytest',
  criteria: [
    { criterion: 1, text: 'A new turn is refused when usage cannot be read.' },
    { criterion: 2, text: 'The refusal is logged once.' },
  ],
  rows: [
    { criterion: 1, test: 'tests/t.py::test_criterion_1_refuses', name: 'test_criterion_1_refuses', base: 'red-assertion', branch: 'green' },
    { criterion: 2, test: 'tests/t.py::test_criterion_2_logs', name: 'test_criterion_2_logs', base: 'red-assertion', branch: 'green' },
  ],
};

describe('red-green evidence', () => {
  it('leads the base panel with each failing test and its assertion message', () => {
    render(<EvidenceItem evidence={redGreen} />);
    const failures = screen.getByRole('list', { name: 'Tests en échec' });
    expect(within(failures).getByText('test_criterion_1_refuses_the_turn[os-error]')).toBeInTheDocument();
    expect(within(failures).getByText(/AssertionError: the turn was let through/)).toBeInTheDocument();
    expect(screen.getByText('2 tests en échec · 5 tests réussis')).toBeInTheDocument();
  });

  it('leads the branch panel with the pass count', () => {
    render(<EvidenceItem evidence={redGreen} />);
    expect(screen.getByText('7 tests réussis')).toBeInTheDocument();
  });

  it('lists the tests the branch lost', () => {
    const lost: RedGreenEvidence = { ...redGreen, after: { ...redGreen.after, outcome: 'failed', summary: { passed: 5, failed: 1, skipped: 0, failures: [{ test: 'test_a', message: null }], missing: ['test_b'] } } };
    render(<EvidenceItem evidence={lost} />);
    expect(within(screen.getByRole('list', { name: 'Tests absents' })).getByText('test_b')).toBeInTheDocument();
    expect(screen.getByText('1 test en échec · 5 tests réussis')).toBeInTheDocument();
  });

  it('keeps the full log in a closed disclosure below the summary', () => {
    const { container } = render(<EvidenceItem evidence={redGreen} />);
    const disclosures = container.querySelectorAll('details.red-green__log');
    expect(disclosures).toHaveLength(2);
    for (const disclosure of disclosures) {
      expect(disclosure).not.toHaveAttribute('open');
      expect(within(disclosure as HTMLElement).getByText('Journal complet')).toBeInTheDocument();
      expect(disclosure.textContent).toContain('platform linux');
    }
  });

  it('shows the log alone when no summary is available', () => {
    render(<EvidenceItem evidence={{ ...redGreen, before: { ...redGreen.before, summary: null } }} />);
    expect(screen.queryByText('2 tests en échec · 5 tests réussis')).not.toBeInTheDocument();
    expect(screen.getAllByText('Journal complet')).toHaveLength(2);
  });
});

describe('acceptance tests evidence', () => {
  it('groups the tests under a header row carrying the criterion text', () => {
    render(<EvidenceItem evidence={acceptanceTests} />);
    const table = screen.getByRole('table', { name: 'Tests d’acceptation' });
    const headers = within(table).getAllByRole('columnheader').filter((header) => header.textContent?.startsWith('Critère'));
    expect(headers.map((header) => header.textContent)).toEqual([
      'Critère 1A new turn is refused when usage cannot be read.',
      'Critère 2The refusal is logged once.',
    ]);
    expect(within(table).getAllByText(/test_criterion_/)).toHaveLength(2);
  });

  it('heads a criterion without recorded text by its number', () => {
    render(<EvidenceItem evidence={{ ...acceptanceTests, criteria: [] }} />);
    expect(screen.getAllByRole('columnheader').filter((header) => header.textContent?.startsWith('Critère')).map((header) => header.textContent)).toEqual(['Critère 1', 'Critère 2']);
  });
});
