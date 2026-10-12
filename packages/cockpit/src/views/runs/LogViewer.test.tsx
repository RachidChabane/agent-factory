import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { RunLogLineSchema } from '../../contract/index.ts';
import systemLines from '../../data/__fixtures__/run-log-system-lines.json' with { type: 'json' };
import type { RunLogView } from '../../data/run-log-store.ts';
import { renderWidget } from '../../test/harness.tsx';
import { LogViewer } from './LogViewer.tsx';
import { entriesOfLines, entriesOfRun, FINISHED_RUN, LIVE_RUN, logViewOf, logViewOfRun, present, REVIEW_RUN } from './run-test-support.ts';

const SYSTEM_VIEW = logViewOf(entriesOfLines(z.array(RunLogLineSchema).parse(systemLines)));
const FINISHED_VIEW = logViewOfRun(FINISHED_RUN);
const LIVE_VIEW = logViewOfRun(LIVE_RUN);
const FINISHED_LINES = 57;

interface LogOptions {
  readonly live?: boolean;
  readonly recordedLines?: number;
  readonly locale?: 'fr';
}

function viewerElement(log: RunLogView, options: LogOptions) {
  return <LogViewer log={log} live={options.live ?? false} recordedLines={options.recordedLines ?? log.lineCount} />;
}

function renderLog(log: RunLogView, options: LogOptions = {}) {
  return renderWidget(viewerElement(log, options), options.locale === undefined ? {} : { locale: options.locale });
}

const logOf = () => screen.getByRole('log', { name: 'Run log' });
const filterButton = (name: RegExp) => screen.getByRole('radio', { name });
const followButton = () => screen.getByRole('button', { name: 'Follow' });

describe('LogViewer system rows', () => {
  it('shows the system lines as typed rows and keeps the noise out of the way', async () => {
    await renderLog(SYSTEM_VIEW);
    const log = within(logOf());
    expect(log.getByText('PreToolUse:Edit').closest('p')).toHaveTextContent('Hook PreToolUse:Edit started');
    expect(log.getByText('Hook SessionStart:startup')).toBeInTheDocument();
    expect(log.getByText('exit code 0')).toBeInTheDocument();
    expect(log.getByText('Succeeded')).toBeInTheDocument();
    expect(log.getByText('Task started')).toBeInTheDocument();
    expect(log.getByText('Task failed')).toBeInTheDocument();
    expect(log.getAllByText('mise run lint')).toHaveLength(2);
    expect(log.getByText('Stop hook error occurred · ctrl+o to see')).toBeInTheDocument();
    expect(log.queryByText('System · status')).not.toBeInTheDocument();
    expect(log.queryByText(/"subtype"/)).not.toBeInTheDocument();
  });

  it('lists the noise under its own filter, each line named by its subtype and a token stream as such', async () => {
    const { user } = await renderLog(SYSTEM_VIEW);
    expect(filterButton(/^Noise/)).toHaveTextContent('3');
    await user.click(filterButton(/^Noise/));
    const log = within(logOf());
    expect(log.getByText('System · status')).toBeInTheDocument();
    expect(log.getByText('System · thinking_tokens')).toBeInTheDocument();
    expect(log.getByText('Token stream')).toBeInTheDocument();
    expect(log.queryByText('Task started')).not.toBeInTheDocument();
  });

  it('names the noise in French', async () => {
    const { user } = await renderLog(SYSTEM_VIEW, { locale: 'fr' });
    await user.click(screen.getByRole('radio', { name: /^Bruit/ }));
    const log = within(screen.getByRole('log', { name: 'Journal du run' }));
    expect(log.getByText('Système · status')).toBeInTheDocument();
    expect(log.getByText('Flux de jetons')).toBeInTheDocument();
  });

  it('shows the line a system row was read from only when the raw view is on', async () => {
    const { user } = await renderLog(SYSTEM_VIEW);
    const raw = screen.getByRole('button', { name: 'Raw' });
    expect(raw).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText(/"subtype":"task_started"/)).not.toBeInTheDocument();
    await user.click(raw);
    expect(raw).toHaveAttribute('aria-pressed', 'true');
    expect(within(logOf()).getByText(/"subtype":"task_started"/)).toBeInTheDocument();
    expect(within(logOf()).getByText(/"subtype":"hook_started"/)).toBeInTheDocument();
    await user.click(raw);
    expect(screen.queryByText(/"subtype":"task_started"/)).not.toBeInTheDocument();
  });

  it('does not repeat the line of a raw row in the raw view', async () => {
    const entries = entriesOfLines([{ runId: 'run_000000', index: 0, at: '2026-10-12T09:00:00.000Z', event: { kind: 'raw', line: 'plain text from the CLI' } }]);
    const { user } = await renderLog(logViewOf(entries));
    await user.click(screen.getByRole('button', { name: 'Raw' }));
    expect(within(logOf()).getAllByText('plain text from the CLI')).toHaveLength(1);
  });
});

describe('LogViewer filters and search', () => {
  it('counts what each filter holds', async () => {
    await renderLog(FINISHED_VIEW);
    expect(filterButton(/^All/)).toHaveTextContent('33');
    expect(filterButton(/^Text/)).toHaveTextContent('9');
    expect(filterButton(/^Tools/)).toHaveTextContent('13');
    expect(filterButton(/^Hooks and gate/)).toHaveTextContent('10');
    expect(filterButton(/^Errors/)).toHaveTextContent('5');
    expect(filterButton(/^Noise/)).toHaveTextContent('1');
    expect(screen.getByText(`${FINISHED_LINES} lines`)).toBeInTheDocument();
  });

  it('keeps what the agent wrote under the text filter', async () => {
    const { user } = await renderLog(FINISHED_VIEW);
    await user.click(filterButton(/^Text/));
    const log = within(logOf());
    expect(log.getByText(/Reading the frozen unit tests of #58 first/)).toBeInTheDocument();
    expect(log.queryByText('Grep')).not.toBeInTheDocument();
    expect(log.queryByText(/Permission denied/)).not.toBeInTheDocument();
  });

  it('keeps what went wrong under the errors filter', async () => {
    const { user } = await renderLog(FINISHED_VIEW);
    await user.click(filterButton(/^Errors/));
    const log = within(logOf());
    expect(log.getByText(/Permission denied for/)).toHaveTextContent('Permission denied for Bash: curl https://staging.storefront.example.com/api/cart/promo was refused');
    expect(log.getByText('Gate failed · 1 of 6 steps')).toBeInTheDocument();
    expect(log.getByText('exit code 2')).toBeInTheDocument();
    expect(log.getAllByText('Failed')).not.toHaveLength(0);
    expect(log.getAllByRole('button', { name: /^Bash/ })).toHaveLength(2);
    expect(log.queryByText(/Reading the frozen unit tests/)).not.toBeInTheDocument();
  });

  it('shows a pass of the gate with every step and what the failed ones said', async () => {
    const { user } = await renderLog(FINISHED_VIEW);
    await user.click(filterButton(/^Hooks and gate/));
    const log = within(logOf());
    expect(log.getByText('Gate passed · 6 of 7 steps')).toBeInTheDocument();
    expect(log.getByText("lint: web/src/cart/PromoField.tsx 3:10 error 'Fragment' is defined but never used @typescript-eslint/no-unused-vars", { normalizer: (text) => text.replace(/\s+/g, ' ') })).toBeInTheDocument();
    expect(log.getAllByRole('img', { name: 'Passed' }).length).toBeGreaterThan(0);
    expect(log.getAllByRole('img', { name: 'Skipped' })).not.toHaveLength(0);
  });

  it('words the hooks by their exit code, the subscription windows, and the refusals', async () => {
    const { user } = await renderLog(FINISHED_VIEW);
    await user.click(filterButton(/^Hooks and gate/));
    const log = within(logOf());
    expect(log.getAllByText('Hook PreToolUse')).toHaveLength(1);
    expect(log.getAllByText('Hook Stop')).toHaveLength(2);
    expect(log.getAllByText('Succeeded').length).toBeGreaterThan(0);
    expect(log.getByText('Subscription: 5-hour window: 42% · 7-day window: 63%')).toBeInTheDocument();
    expect(log.getByText('prettier: formatted 3 files')).toBeInTheDocument();
  });

  it('searches the text, the tool calls and their results, whatever the case', async () => {
    const { user } = await renderLog(FINISHED_VIEW);
    await user.type(screen.getByRole('searchbox', { name: 'Search the log' }), 'FRAGMENT');
    const log = within(logOf());
    expect(log.getByText('Gate failed · 1 of 6 steps')).toBeInTheDocument();
    expect(log.getByText('Hook Stop')).toBeInTheDocument();
    expect(log.queryByText(/Reading the frozen unit tests/)).not.toBeInTheDocument();
  });

  it('says when no line matches, and shows every line again once the search is cleared', async () => {
    const { user } = await renderLog(FINISHED_VIEW);
    const search = screen.getByRole('searchbox', { name: 'Search the log' });
    await user.type(search, 'no line says this');
    expect(screen.getByText('No line matches')).toBeInTheDocument();
    expect(screen.getByText('Change the filter or the search to see more lines.')).toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    await user.clear(search);
    expect(logOf()).toBeInTheDocument();
  });

  it('keeps the search when the filter changes', async () => {
    const { user } = await renderLog(FINISHED_VIEW);
    await user.type(screen.getByRole('searchbox', { name: 'Search the log' }), 'fragment');
    await user.click(filterButton(/^Hooks and gate/));
    expect(within(logOf()).getByText('Gate failed · 1 of 6 steps')).toBeInTheDocument();
    expect(within(logOf()).queryByText('Gate passed · 6 of 7 steps')).not.toBeInTheDocument();
  });

  it('moves between the filters with the arrow keys', async () => {
    const { user } = await renderLog(FINISHED_VIEW);
    filterButton(/^All/).focus();
    await user.keyboard('{ArrowRight}');
    expect(filterButton(/^Text/)).toHaveAttribute('aria-checked', 'true');
  });
});

describe('LogViewer rows', () => {
  it('opens a tool call onto its input and its result, and closes it again', async () => {
    const { user } = await renderLog(FINISHED_VIEW);
    const call = within(logOf()).getAllByRole('button', { name: /^Read/ })[0];
    const tool = present(call, 'a Read tool call');
    expect(tool).toHaveAttribute('aria-expanded', 'false');
    expect(within(logOf()).queryByText('Input')).not.toBeInTheDocument();
    await user.click(tool);
    expect(tool).toHaveAttribute('aria-expanded', 'true');
    const log = within(logOf());
    expect(log.getByText('Input')).toBeInTheDocument();
    expect(log.getByText(/"file_path": "web\/src\/cart\/promo-messages\.test\.ts"/)).toBeInTheDocument();
    expect(log.getByText('Result')).toBeInTheDocument();
    expect(log.getByText(/import \{ describe, expect, it \} from 'vitest';/)).toBeInTheDocument();
    await user.click(tool);
    expect(tool).toHaveAttribute('aria-expanded', 'false');
    expect(within(logOf()).queryByText('Input')).not.toBeInTheDocument();
  });

  it('opens a tool call from the keyboard', async () => {
    const { user } = await renderLog(FINISHED_VIEW);
    const tool = present(within(logOf()).getAllByRole('button', { name: /^Read/ })[0], 'a Read tool call');
    tool.focus();
    await user.keyboard('{Enter}');
    expect(tool).toHaveAttribute('aria-expanded', 'true');
    await user.keyboard(' ');
    expect(tool).toHaveAttribute('aria-expanded', 'false');
  });

  it('names the result of a tool call that failed as an error', async () => {
    const { user } = await renderLog(FINISHED_VIEW);
    await user.click(filterButton(/^Errors/));
    const [call] = within(logOf()).getAllByRole('button', { name: /^Bash/ });
    await user.click(present(call, 'a failed Bash call'));
    expect(within(logOf()).getByText('Permission denied: this command runs without network access.')).toBeInTheDocument();
    expect(within(logOf()).getAllByText('Error').length).toBeGreaterThan(0);
  });

  it('says that the result of a tool call is pending while the call has none', async () => {
    const { user } = await renderLog(LIVE_VIEW, { live: true });
    await user.click(filterButton(/^Tools/));
    const calls = within(logOf()).getAllByRole('button', { name: /^Read/ });
    await user.click(present(calls.at(-1), 'the last Read call'));
    expect(within(logOf()).getByText('Result pending')).toBeInTheDocument();
  });

  it('marks a tool call as in progress, done or failed', async () => {
    const { user } = await renderLog(LIVE_VIEW, { live: true });
    await user.click(filterButton(/^Tools/));
    expect(within(logOf()).getAllByRole('img', { name: 'In progress' })).toHaveLength(3);
    expect(within(logOf()).getAllByRole('img', { name: 'Done' })).toHaveLength(7);
  });

  it('writes a session start, the model and the time of each row', async () => {
    await renderLog(FINISHED_VIEW);
    const log = within(logOf());
    expect(log.getByText('claude-sonnet-5-5').closest('p')).toHaveTextContent('Session started · claude-sonnet-5-5');
    expect(log.getAllByText('05:10:26 AM')[0]).toHaveAttribute('datetime', expect.stringMatching(/^2026-10-12T05:10:26/));
  });

  it('draws a block of code the agent wrote as code', async () => {
    const { user } = await renderLog(logViewOf(entriesOfRun(REVIEW_RUN)));
    await user.click(filterButton(/^Text/));
    expect(within(logOf()).getByText(/"findings"/).closest('pre')).not.toBeNull();
  });
});

describe('LogViewer following', () => {
  it('offers to follow a log that is going, and follows it from the start', async () => {
    const { user } = await renderLog(LIVE_VIEW, { live: true });
    expect(followButton()).toHaveAttribute('aria-pressed', 'true');
    expect(logOf()).toHaveAttribute('aria-live', 'polite');
    await user.click(followButton());
    expect(followButton()).toHaveAttribute('aria-pressed', 'false');
    expect(logOf()).toHaveAttribute('aria-live', 'off');
    await user.click(followButton());
    expect(followButton()).toHaveAttribute('aria-pressed', 'true');
    expect(logOf()).toHaveAttribute('aria-live', 'polite');
  });

  it('offers nothing to follow in a log that cannot grow, and announces nothing', async () => {
    await renderLog(FINISHED_VIEW);
    expect(screen.queryByRole('button', { name: 'Follow' })).not.toBeInTheDocument();
    expect(logOf()).toHaveAttribute('aria-live', 'off');
  });

  it('stops following when the operator scrolls away from the end', async () => {
    await renderLog(LIVE_VIEW, { live: true });
    const log = logOf();
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 3000 });
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 640 });
    log.scrollTop = 2360;
    fireEvent.scroll(log);
    log.scrollTop = 2350;
    fireEvent.scroll(log);
    expect(followButton()).toHaveAttribute('aria-pressed', 'true');
    log.scrollTop = 500;
    fireEvent.scroll(log);
    expect(followButton()).toHaveAttribute('aria-pressed', 'false');
    expect(logOf()).toHaveAttribute('aria-live', 'off');
  });

  it('keeps following while the list moves down', async () => {
    await renderLog(LIVE_VIEW, { live: true });
    const log = logOf();
    Object.defineProperty(log, 'scrollHeight', { configurable: true, value: 3000 });
    Object.defineProperty(log, 'clientHeight', { configurable: true, value: 640 });
    log.scrollTop = 100;
    fireEvent.scroll(log);
    log.scrollTop = 2000;
    fireEvent.scroll(log);
    expect(followButton()).toHaveAttribute('aria-pressed', 'true');
  });
});

describe('LogViewer states', () => {
  it('shows a placeholder while the first lines of a log load', async () => {
    await renderLog(logViewOf([], 'loading'), { recordedLines: 29 });
    expect(screen.getByText('Loading the log')).toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('treats a log that was not asked for yet like one that loads', async () => {
    await renderLog(logViewOf([], 'idle'), { recordedLines: 29 });
    expect(screen.getByText('Loading the log')).toBeInTheDocument();
  });

  it('says the log could not be loaded and why', async () => {
    await renderLog(logViewOf([], 'error', 'run log page: invalid'), { recordedLines: 29 });
    expect(screen.getByText('The log could not be loaded')).toBeInTheDocument();
    expect(screen.getByText('run log page: invalid')).toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  it('says that no log was recorded for a finished run that has none, without waiting for the page', async () => {
    await renderLog(logViewOf([], 'loading'), { recordedLines: 0 });
    expect(screen.getByText('No log recorded')).toBeInTheDocument();
    expect(screen.getByText('The factory holds no log line for this run.')).toBeInTheDocument();
    expect(screen.queryByText('Loading the log')).not.toBeInTheDocument();
  });

  it('says that a run that is going has not written anything yet', async () => {
    await renderLog(logViewOf([], 'ready'), { live: true, recordedLines: 0 });
    expect(screen.getByText('Nothing logged yet')).toBeInTheDocument();
    expect(screen.getByText('New lines appear here as the agent writes them.')).toBeInTheDocument();
  });

  it('keeps the lines that did load and reports the failure above them', async () => {
    await renderLog(logViewOf(entriesOfRun(REVIEW_RUN), 'error', 'run log page: invalid'), { recordedLines: 15 });
    expect(screen.getByText('Part of the log could not be loaded: run log page: invalid')).toHaveAttribute('role', 'alert');
    expect(within(logOf()).getByText(/Reviewing the correction of #52/)).toBeInTheDocument();
  });

  it('marks the log as busy while more lines load', async () => {
    await renderLog(logViewOf(entriesOfRun(REVIEW_RUN), 'loading'), { recordedLines: 15 });
    expect(logOf()).toHaveAttribute('aria-busy', 'true');
  });

  it('is not busy once the log is loaded', async () => {
    await renderLog(logViewOf(entriesOfRun(REVIEW_RUN), 'ready'), { recordedLines: 15 });
    expect(logOf()).not.toHaveAttribute('aria-busy');
  });
});

describe('LogViewer in French', () => {
  it('words the filters, the counts and the rows in French', async () => {
    const { user } = await renderLog(FINISHED_VIEW, { locale: 'fr' });
    const log = screen.getByRole('log', { name: 'Journal du run' });
    for (const name of [/^Tout/, /^Texte/, /^Outils/, /^Hooks et gate/, /^Erreurs/, /^Bruit/]) expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Brut' })).toBeInTheDocument();
    expect(screen.getByText(`${FINISHED_LINES} lignes`)).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Rechercher dans le journal' })).toBeInTheDocument();
    expect(within(log).getByText('claude-sonnet-5-5').closest('p')).toHaveTextContent('Session démarrée · claude-sonnet-5-5');
    await user.click(screen.getByRole('radio', { name: /^Hooks et gate/ }));
    expect(within(log).getByText('Gate en échec · 1 sur 6 étapes')).toBeInTheDocument();
    expect(within(log).getByText('Gate réussie · 6 sur 7 étapes')).toBeInTheDocument();
    expect(within(log).getByText(/Abonnement : fenêtre de 5 h : 42\s%/)).toBeInTheDocument();
    expect(within(log).getByText('code de sortie 2')).toBeInTheDocument();
  });

  it('counts one line in the singular', async () => {
    await renderLog(logViewOf(entriesOfRun(REVIEW_RUN).slice(0, 1)), { locale: 'fr' });
    expect(screen.getByText('1 ligne')).toBeInTheDocument();
  });

  it('words the states of the log in French', async () => {
    await renderLog(logViewOf([], 'ready'), { live: true, recordedLines: 0, locale: 'fr' });
    expect(screen.getByText('Rien n’est encore journalisé')).toBeInTheDocument();
  });
});
