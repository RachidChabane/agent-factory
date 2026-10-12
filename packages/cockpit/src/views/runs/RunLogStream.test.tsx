import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { openRun, openRunWithLogs, withRun } from './run-render-support.tsx';
import { FINISHED_RUN, LIVE_RUN } from './run-test-support.ts';

const AT = '2026-10-12T10:00:00.000Z';
const NEXT_LINE_INDEX = 29;
const PENDING_TOOL_USE = 'toolu_341fc9ca4d2bdeab5340d3';

const logOf = (article: HTMLElement) => within(article).getByRole('log', { name: 'Run log' });

describe('the log of a run that is going', () => {
  it('shows the lines the agent writes as they arrive, and counts them', async () => {
    const { view, article } = await openRun(LIVE_RUN);
    expect(await within(article).findByText('29 lines')).toBeInTheDocument();
    view.transport.emitRunLog({
      runId: LIVE_RUN,
      index: NEXT_LINE_INDEX,
      at: AT,
      event: { kind: 'assistant-text', text: 'The select takes a label, its options, a value and an onChange.', parentToolUseId: null },
    });
    expect(await within(article).findByText('The select takes a label, its options, a value and an onChange.')).toBeInTheDocument();
    expect(within(article).getByText('30 lines')).toBeInTheDocument();
    expect(within(article).getByRole('tab', { name: /^Log/ })).toHaveTextContent('30');
  });

  it('marks a tool call as done in its row when the result arrives, and the run as using no tool', async () => {
    const { view, article } = await openRun(LIVE_RUN);
    await within(article).findByText('29 lines');
    await view.user.click(within(article).getByRole('radio', { name: /^Tools/ }));
    expect(within(logOf(article)).getAllByRole('img', { name: 'In progress' })).toHaveLength(3);
    expect(within(article).getByRole('group', { name: 'Run figures' })).toHaveTextContent('Read');
    view.transport.emitRunLog({
      runId: LIVE_RUN,
      index: NEXT_LINE_INDEX,
      at: AT,
      event: { kind: 'tool-result', toolUseId: PENDING_TOOL_USE, isError: false, content: 'export function Select({ label, options, value, onChange }: SelectProps) {}' },
    });
    await waitFor(() => expect(within(logOf(article)).getAllByRole('img', { name: 'In progress' })).toHaveLength(2));
    expect(within(logOf(article)).getAllByRole('img', { name: 'Done' })).toHaveLength(8);
    expect(within(within(article).getByRole('group', { name: 'Run figures' })).getByText('No tool in use')).toBeInTheDocument();
  });

  it('updates the cost and the turns of the run from the usage the agent reports', async () => {
    const { view, article } = await openRun(LIVE_RUN);
    const stats = within(article).getByRole('group', { name: 'Run figures' });
    expect(within(stats).getByText('$0.12')).toBeInTheDocument();
    view.transport.emitRunLog({
      runId: LIVE_RUN,
      index: NEXT_LINE_INDEX,
      at: AT,
      event: { kind: 'usage', usage: { inputTokens: 500, outputTokens: 2400, cacheReadTokens: 160000, cacheCreationTokens: 14500 }, costUsd: 0.4321, turns: 9 },
    });
    expect(await within(stats).findByText('$0.43')).toBeInTheDocument();
    expect(within(stats).getByText('9 of 150')).toBeInTheDocument();
    expect(within(stats).getByText('177.4K tokens including cache')).toBeInTheDocument();
    expect(within(stats).getByText('2.9K tokens excluding cache')).toBeInTheDocument();
  });

  it('waits for the first line of a log that is empty so far, then shows it', async () => {
    const snapshot = withRun(LIVE_RUN, (run) => ({ ...run, logLength: 0, subagents: [], currentTool: null, lastLine: null }));
    const { view, article } = await openRunWithLogs(LIVE_RUN, new Map(), snapshot);
    expect(await within(article).findByText('Nothing logged yet')).toBeInTheDocument();
    expect(within(article).queryByRole('log')).not.toBeInTheDocument();
    view.transport.emitRunLog({ runId: LIVE_RUN, index: 0, at: AT, event: { kind: 'assistant-text', text: 'Starting with the frozen journeys.', parentToolUseId: null } });
    expect(await within(article).findByText('Starting with the frozen journeys.')).toBeInTheDocument();
  });
});

describe('the log of a run that ended', () => {
  it('says that no log was recorded for a run that has none, in every tab', async () => {
    const { view, article } = await openRun('run_6e2b95');
    expect(within(article).getByText('No log recorded')).toBeInTheDocument();
    expect(within(article).getByText('The factory holds no log line for this run.')).toBeInTheDocument();
    await view.user.click(within(article).getByRole('tab', { name: /^Subagents/ }));
    expect(within(article).getByText('Subagents started by the agent appear here with their tool calls.')).toBeInTheDocument();
    await view.user.click(within(article).getByRole('tab', { name: 'Gate' }));
    expect(within(article).getByText('The gate has not run yet')).toBeInTheDocument();
  });

  it('says the log could not be loaded when the factory sends a page the cockpit cannot read', async () => {
    const { article } = await openRunWithLogs(FINISHED_RUN, new Map([[FINISHED_RUN, { runId: FINISHED_RUN, total: 'many' }]]));
    expect(await within(article).findByText('The log could not be loaded')).toBeInTheDocument();
    expect(within(article).getByText(/^run log page:/)).toBeInTheDocument();
    expect(screen.queryByRole('log')).not.toBeInTheDocument();
  });

  it('asks the factory for the log of the run only once, from its first line', async () => {
    const { view, article } = await openRun(FINISHED_RUN);
    await within(article).findByRole('log', { name: 'Run log' });
    expect(view.transport.runLogRequests).toEqual([{ runId: FINISHED_RUN, afterIndex: null }]);
  });
});
