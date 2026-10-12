import { screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { clickAndExpectCommand, clickConfirmAndExpectCommand, expectCommand } from '../../test/commands.ts';
import { openRun, withRun } from './run-render-support.tsx';
import { CHALLENGER_RUN, FAILED_RUN, FINISHED_RUN, INSTALLATION_RUN, LIVE_RUN, STOPPED_RUN, WAITING_QUESTION_ID, WAITING_RUN } from './run-test-support.ts';

const STOP_DIALOG = 'Stop this run?';
const ISSUE_STOP_NOTE = 'The agent is interrupted and issue #45 is paused until you resume it.';
const OPTIONS = ['Rewrite the check to expect "-4,20 €"', 'Keep the dollars and change the spec', 'Abandon this issue'];

const stopButton = (article: HTMLElement) => within(article).getByRole('button', { name: 'Stop' });

describe('run.stop', () => {
  it('asks first, and says that stopping the run of an issue pauses the issue', async () => {
    const { view, article } = await openRun(LIVE_RUN);
    await view.user.click(stopButton(article));
    const dialog = await screen.findByRole('dialog', { name: STOP_DIALOG });
    expect(dialog).toHaveTextContent(ISSUE_STOP_NOTE);
    expect(view.transport.commands).toEqual([]);
  });

  it('sends nothing when the operator cancels', async () => {
    const { view, article } = await openRun(LIVE_RUN);
    await view.user.click(stopButton(article));
    const dialog = await screen.findByRole('dialog', { name: STOP_DIALOG });
    await view.user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(view.transport.commands).toEqual([]);
  });

  it('stops the run once the operator confirms', async () => {
    const { view, article } = await openRun(LIVE_RUN);
    await clickConfirmAndExpectCommand(view.user, stopButton(article), STOP_DIALOG, 'Stop the run', view.transport, 'run.stop', { runId: LIVE_RUN });
  });

  it('stops a run that waits for an answer', async () => {
    const { view, article } = await openRun(WAITING_RUN);
    await clickConfirmAndExpectCommand(view.user, stopButton(article), STOP_DIALOG, 'Stop the run', view.transport, 'run.stop', { runId: WAITING_RUN });
  });

  it('words the question differently for a run whose subject is not an issue', async () => {
    const snapshot = withRun(LIVE_RUN, (run) => ({ ...run, subject: { kind: 'request', id: 'R-18' } }));
    const { view, article } = await openRun(LIVE_RUN, { snapshot });
    await view.user.click(stopButton(article));
    const dialog = await screen.findByRole('dialog', { name: STOP_DIALOG });
    expect(dialog).toHaveTextContent('The agent is interrupted. To run it again, ask for the work again.');
    expect(dialog).not.toHaveTextContent('is paused');
  });

  it('shows what the factory did, and its refusal', async () => {
    const { view, article } = await openRun(LIVE_RUN);
    view.transport.effects.set('run.stop', 'Run run_7f3a2c stopped and issue #45 paused');
    await clickConfirmAndExpectCommand(view.user, stopButton(article), STOP_DIALOG, 'Stop the run', view.transport, 'run.stop', { runId: LIVE_RUN });
    expect(await screen.findByText('Run run_7f3a2c stopped and issue #45 paused')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the question open when the factory refuses', async () => {
    const { view, article } = await openRun(LIVE_RUN);
    view.transport.commandFailure = 'run run_7f3a2c is not running';
    await view.user.click(stopButton(article));
    const dialog = await screen.findByRole('dialog', { name: STOP_DIALOG });
    await view.user.click(within(dialog).getByRole('button', { name: 'Stop the run' }));
    expect(await within(screen.getByRole('alert')).findByText('run run_7f3a2c is not running')).toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: STOP_DIALOG })).toBeInTheDocument();
  });

  it('is busy while the command is in flight', async () => {
    const { view, article } = await openRun(LIVE_RUN);
    const release = view.transport.holdCommands();
    await view.user.click(stopButton(article));
    const dialog = await screen.findByRole('dialog', { name: STOP_DIALOG });
    await view.user.click(within(dialog).getByRole('button', { name: 'Stop the run' }));
    await waitFor(() => expect(within(dialog).getByRole('button', { name: 'Stop the run' })).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(view.transport.commands).toHaveLength(1);
  });

  it.each([FINISHED_RUN, FAILED_RUN, STOPPED_RUN, CHALLENGER_RUN, INSTALLATION_RUN])('offers no stop for run %s, which ended', async (runId) => {
    const { article } = await openRun(runId);
    expect(within(article).queryByRole('button', { name: 'Stop' })).not.toBeInTheDocument();
  });
});

describe('run.resume', () => {
  const resumeButton = (article: HTMLElement) => within(article).getByRole('button', { name: 'Resume' });

  it('resumes a stopped run of an issue, without asking', async () => {
    const { view, article } = await openRun(STOPPED_RUN);
    await clickAndExpectCommand(view.user, resumeButton(article), view.transport, 'run.resume', { runId: STOPPED_RUN });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('resumes a failed run of an issue', async () => {
    const { view, article } = await openRun(FAILED_RUN);
    await clickAndExpectCommand(view.user, resumeButton(article), view.transport, 'run.resume', { runId: FAILED_RUN });
  });

  it('says what resuming lets happen', async () => {
    const { article } = await openRun(STOPPED_RUN);
    expect(resumeButton(article)).toHaveAccessibleDescription('Lets issue #64 run again.');
  });

  it('shows what the factory did, and its refusal', async () => {
    const { view, article } = await openRun(STOPPED_RUN);
    view.transport.effects.set('run.resume', 'Issue #64 may run again');
    await view.user.click(resumeButton(article));
    expect(await screen.findByText('Issue #64 may run again')).toBeInTheDocument();
    view.transport.commandFailure = 'issue #64 is not paused';
    await view.user.click(resumeButton(article));
    expect(await within(screen.getByRole('alert')).findByText('issue #64 is not paused')).toBeInTheDocument();
  });

  it('is disabled while the command is in flight', async () => {
    const { view, article } = await openRun(STOPPED_RUN);
    const release = view.transport.holdCommands();
    await view.user.click(resumeButton(article));
    await waitFor(() => expect(resumeButton(article)).toBeDisabled());
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(resumeButton(article)).toBeEnabled());
    expect(view.transport.commands).toHaveLength(1);
  });

  it.each([
    ['is going', LIVE_RUN],
    ['waits for an answer', WAITING_RUN],
    ['succeeded', FINISHED_RUN],
    ['failed on a request, which is asked for again', CHALLENGER_RUN],
    ['belongs to the installation and succeeded', INSTALLATION_RUN],
  ])('offers no resume for a run that %s', async (_case, runId) => {
    const { article } = await openRun(runId);
    expect(within(article).queryByRole('button', { name: 'Resume' })).not.toBeInTheDocument();
  });
});

describe('run.answer', () => {
  const panelOf = (article: HTMLElement) => within(article).getByRole('region', { name: 'The agent is waiting for your answer' });
  const answerField = (article: HTMLElement) => within(panelOf(article)).getByRole('textbox', { name: 'Your answer' });
  const sendButton = (article: HTMLElement) => within(panelOf(article)).getByRole('button', { name: 'Send the answer' });
  const answer = (text: string) => ({ runId: WAITING_RUN, questionId: WAITING_QUESTION_ID, answer: text });

  it('shows the question, when it was asked and the answers it suggests', async () => {
    const { article } = await openRun(WAITING_RUN);
    const panel = within(panelOf(article));
    expect(panel.getByText(/Should the check be rewritten to expect/)).toBeInTheDocument();
    expect(panel.getByText('21 min. ago')).toHaveAttribute('datetime', '2026-10-12T09:39:00.000Z');
    const suggestions = within(panel.getByRole('group', { name: 'Suggested answers' }));
    expect(suggestions.getAllByRole('button').map((button) => button.textContent)).toEqual(OPTIONS);
  });

  it.each(OPTIONS)('sends the suggested answer %j exactly as it is written', async (option) => {
    const { view, article } = await openRun(WAITING_RUN);
    await clickAndExpectCommand(view.user, within(panelOf(article)).getByRole('button', { name: option }), view.transport, 'run.answer', answer(option));
  });

  it('sends the answer typed, without the blanks around it', async () => {
    const { view, article } = await openRun(WAITING_RUN);
    await view.user.type(answerField(article), '  Keep the dollars.{Enter}Update the spec.  ');
    await clickAndExpectCommand(view.user, sendButton(article), view.transport, 'run.answer', answer('Keep the dollars.\nUpdate the spec.'));
  });

  it('empties the field once the factory accepted the answer', async () => {
    const { view, article } = await openRun(WAITING_RUN);
    await view.user.type(answerField(article), 'Keep the dollars.');
    await view.user.click(sendButton(article));
    await waitFor(() => expect(answerField(article)).toHaveValue(''));
  });

  it('submits the typed answer from the keyboard with the send button', async () => {
    const { view, article } = await openRun(WAITING_RUN);
    await view.user.type(answerField(article), 'Keep the dollars.');
    await view.user.tab();
    expect(sendButton(article)).toHaveFocus();
    await view.user.keyboard('{Enter}');
    await expectCommand(view.transport, 'run.answer', answer('Keep the dollars.'));
  });

  it('keeps what was typed when the factory refuses it', async () => {
    const { view, article } = await openRun(WAITING_RUN);
    view.transport.commandFailure = 'question decision-run_5d0911 does not belong to run run_5d0911';
    await view.user.type(answerField(article), 'Keep the dollars.');
    await view.user.click(sendButton(article));
    expect(await within(screen.getByRole('alert')).findByText('question decision-run_5d0911 does not belong to run run_5d0911')).toBeInTheDocument();
    expect(answerField(article)).toHaveValue('Keep the dollars.');
  });

  it('shows what the factory did with a suggested answer', async () => {
    const { view, article } = await openRun(WAITING_RUN);
    view.transport.effects.set('run.answer', 'The answer is recorded and issue #49 resumes at implementing');
    await view.user.click(within(panelOf(article)).getByRole('button', { name: OPTIONS[1] ?? '' }));
    expect(await screen.findByText('The answer is recorded and issue #49 resumes at implementing')).toBeInTheDocument();
  });

  it('cannot send a blank answer', async () => {
    const { view, article } = await openRun(WAITING_RUN);
    expect(sendButton(article)).toBeDisabled();
    await view.user.type(answerField(article), '   ');
    expect(sendButton(article)).toBeDisabled();
    expect(view.transport.commands).toEqual([]);
  });

  it('disables every way to answer while the command is in flight', async () => {
    const { view, article } = await openRun(WAITING_RUN);
    const release = view.transport.holdCommands();
    await view.user.click(within(panelOf(article)).getByRole('button', { name: OPTIONS[0] ?? '' }));
    await waitFor(() => expect(sendButton(article)).toBeDisabled());
    for (const option of OPTIONS) expect(within(panelOf(article)).getByRole('button', { name: option })).toBeDisabled();
    expect(answerField(article)).toBeDisabled();
    expect(view.transport.commands).toHaveLength(1);
    release();
    await waitFor(() => expect(within(panelOf(article)).getByRole('button', { name: OPTIONS[0] ?? '' })).toBeEnabled());
    expect(view.transport.commands).toHaveLength(1);
  });

  it('offers the field alone when the question suggests no answer', async () => {
    const snapshot = withRun(WAITING_RUN, (run) => ({ ...run, pendingQuestion: run.pendingQuestion === null ? null : { ...run.pendingQuestion, options: [] } }));
    const { article } = await openRun(WAITING_RUN, { snapshot });
    expect(within(panelOf(article)).queryByRole('group', { name: 'Suggested answers' })).not.toBeInTheDocument();
    expect(answerField(article)).toBeInTheDocument();
  });

  it('leaves out a suggested answer that says nothing', async () => {
    const snapshot = withRun(WAITING_RUN, (run) => ({ ...run, pendingQuestion: run.pendingQuestion === null ? null : { ...run.pendingQuestion, options: ['', '  ', 'Yes'] } }));
    const { article } = await openRun(WAITING_RUN, { snapshot });
    const suggestions = within(within(panelOf(article)).getByRole('group', { name: 'Suggested answers' }));
    expect(suggestions.getAllByRole('button').map((button) => button.textContent)).toEqual(['Yes']);
  });

  it('shows no question for a run that asks none', async () => {
    const { article } = await openRun(LIVE_RUN);
    expect(within(article).queryByRole('region', { name: 'The agent is waiting for your answer' })).not.toBeInTheDocument();
  });

  it('words the question in French', async () => {
    const { article } = await openRun(WAITING_RUN, { locale: 'fr' });
    const panel = within(within(article).getByRole('region', { name: 'L’agent attend votre réponse' }));
    expect(panel.getByRole('textbox', { name: 'Votre réponse' })).toBeInTheDocument();
    expect(panel.getByRole('button', { name: 'Envoyer la réponse' })).toBeDisabled();
    expect(panel.getByRole('group', { name: 'Réponses suggérées' })).toBeInTheDocument();
  });
});
