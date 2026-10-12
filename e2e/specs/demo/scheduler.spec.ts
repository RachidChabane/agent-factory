import type { PauseView } from '../../../packages/cockpit/src/contract/index.ts';
import { projectOf } from '../../support/api.ts';
import { openCockpit, sidebar } from '../../support/cockpit.ts';
import { clickCommand } from '../../support/commands.ts';
import type { RunningFactory } from '../../support/factory.ts';
import { LEDGER, STOREFRONT } from '../../support/story.ts';
import { expect, test } from '../../support/test.ts';

const OPERATOR = 'Alex Morgan';
const OPERATOR_CAUSE = 'operator';
const PAUSE_REASON = `paused by ${OPERATOR}`;

function operatorPauseOf(pauses: readonly PauseView[]): PauseView | undefined {
  return pauses.find((pause) => pause.cause === OPERATOR_CAUSE);
}

async function resumeWhatTheOperatorPaused(factory: RunningFactory): Promise<void> {
  const state = await factory.api.state();
  if (operatorPauseOf(state.installation.pauses) !== undefined) await factory.api.command('scheduler.resume', { project: null });
  for (const project of state.projects) {
    if (operatorPauseOf(project.pauses) !== undefined) await factory.api.command('scheduler.resume', { project: project.id });
  }
}

test.describe('the scheduler of the demonstration', () => {
  test('pauses the whole factory from the sidebar, says so, then resumes it', async ({ page, factory }) => {
    await openCockpit(page, factory, '/');
    const navigation = sidebar(page);
    try {
      await expect(navigation.getByText('Scheduler running')).toBeVisible();
      expect(operatorPauseOf((await factory.api.state()).installation.pauses)).toBeUndefined();
      const pausing = await clickCommand(page, 'scheduler.pause', async () => {
        await navigation.getByRole('button', { name: 'Pause the factory' }).click();
      });
      expect(pausing.effect).toBe('No new work starts for every project; running issues finish their current step');
      const paused = await factory.api.until('the operator pauses the whole factory', (state) => operatorPauseOf(state.installation.pauses) !== undefined);
      expect(operatorPauseOf(paused.installation.pauses)).toMatchObject({ scope: 'installation', cause: OPERATOR_CAUSE, reason: PAUSE_REASON, resumesAt: null });
      expect(paused.projects.map((project) => operatorPauseOf(project.pauses))).toEqual([undefined, undefined]);
      await expect(navigation.getByText('Scheduler paused')).toBeVisible();
      await expect(navigation.getByRole('button', { name: 'Resume the factory' })).toBeVisible();
      await expect(navigation.getByRole('button', { name: 'Pause the factory' })).toHaveCount(0);

      const resuming = await clickCommand(page, 'scheduler.resume', async () => {
        await navigation.getByRole('button', { name: 'Resume the factory' }).click();
      });
      expect(resuming.effect).toBe('Scheduling resumed for every project; the daemon picks it up at its next tick');
      const resumed = await factory.api.until('the operator pause is gone', (state) => operatorPauseOf(state.installation.pauses) === undefined);
      expect(resumed.installation.pauses).toEqual([]);
      await expect(navigation.getByText('Scheduler running')).toBeVisible();
      await expect(navigation.getByRole('button', { name: 'Pause the factory' })).toBeVisible();
    } finally {
      await resumeWhatTheOperatorPaused(factory);
    }
  });

  test('shows the pause of the whole factory on the overview of a project, and resumes it from there', async ({ page, factory }) => {
    await openCockpit(page, factory, `/projects/${STOREFRONT}`);
    const whole = page.getByRole('region', { name: 'Whole installation' });
    try {
      await expect(whole).toContainText('Running');
      const pausing = await clickCommand(page, 'scheduler.pause', async () => {
        await whole.getByRole('button', { name: 'Pause the factory' }).click();
      });
      expect(pausing.effect).toBe('No new work starts for every project; running issues finish their current step');
      await factory.api.until('the operator pauses the whole factory', (state) => operatorPauseOf(state.installation.pauses) !== undefined);
      await expect(whole).toContainText('Paused');
      await expect(whole).toContainText('Operator');
      await expect(whole).toContainText(PAUSE_REASON);
      await expect(whole).toContainText('Stays paused until you resume it.');
      await expect(sidebar(page).getByText('Scheduler paused')).toBeVisible();
      const resuming = await clickCommand(page, 'scheduler.resume', async () => {
        await whole.getByRole('button', { name: 'Resume the factory' }).click();
      });
      expect(resuming.effect).toBe('Scheduling resumed for every project; the daemon picks it up at its next tick');
      await factory.api.until('the operator pause is gone', (state) => operatorPauseOf(state.installation.pauses) === undefined);
      await expect(whole).toContainText('Running');
      await expect(sidebar(page).getByText('Scheduler running')).toBeVisible();
    } finally {
      await resumeWhatTheOperatorPaused(factory);
    }
  });

  test('pauses one project from its overview without pausing the factory, then resumes it', async ({ page, factory }) => {
    await openCockpit(page, factory, `/projects/${LEDGER}`);
    const project = page.getByRole('region', { name: 'This project' });
    try {
      await expect(project).toContainText('Running');
      const pausing = await clickCommand(page, 'scheduler.pause', async () => {
        await project.getByRole('button', { name: 'Pause this project' }).click();
      });
      expect(pausing.effect).toBe(`No new work starts for ${LEDGER}; running issues finish their current step`);
      const paused = await factory.api.until('the operator pauses the ledger', (state) => operatorPauseOf(projectOf(state, LEDGER).pauses) !== undefined);
      expect(operatorPauseOf(projectOf(paused, LEDGER).pauses)).toMatchObject({ scope: 'project', cause: OPERATOR_CAUSE, reason: PAUSE_REASON, resumesAt: null });
      expect(operatorPauseOf(projectOf(paused, STOREFRONT).pauses)).toBeUndefined();
      expect(operatorPauseOf(paused.installation.pauses)).toBeUndefined();
      await expect(project).toContainText('Paused');
      await expect(project).toContainText('Operator');
      await expect(project).toContainText(PAUSE_REASON);
      await expect(project).toContainText('Stays paused until you resume it.');
      await expect(project.getByRole('button', { name: 'Resume this project' })).toBeVisible();
      await expect(page.getByRole('region', { name: 'Whole installation' })).toContainText('Running');
      await expect(sidebar(page).getByText('Scheduler running')).toBeVisible();

      const resuming = await clickCommand(page, 'scheduler.resume', async () => {
        await project.getByRole('button', { name: 'Resume this project' }).click();
      });
      expect(resuming.effect).toBe(`Scheduling resumed for ${LEDGER}; the daemon picks it up at its next tick`);
      const resumed = await factory.api.until('the ledger pause is gone', (state) => projectOf(state, LEDGER).pauses.length === 0);
      expect(projectOf(resumed, LEDGER).pauses).toEqual([]);
      await expect(project).toContainText('Running');
      await expect(project.getByRole('button', { name: 'Pause this project' })).toBeVisible();
    } finally {
      await resumeWhatTheOperatorPaused(factory);
    }
  });
});
