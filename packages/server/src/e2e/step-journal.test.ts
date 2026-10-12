import { describe, expect, it } from 'vitest';
import { StepJournal } from './step-journal.ts';
import { FakeTime } from './testing/fake-time.ts';

const STEP_MS = 2_500;

function journalOn(time: FakeTime): { journal: StepJournal; lines: string[] } {
  const lines: string[] = [];
  return { journal: new StepJournal({ line: (text) => lines.push(text) }, time), lines };
}

describe('StepJournal', () => {
  it('reports a passed step on one line, with what it found', async () => {
    const time = new FakeTime();
    const { journal, lines } = journalOn(time);
    const issue = await journal.step('issue created', () => Promise.resolve(1), (number) => `storefront#${number}`);
    expect(issue).toBe(1);
    expect(lines).toEqual(['ok   issue created: storefront#1']);
  });

  it('reports a step without detail by its name alone', async () => {
    const { journal, lines } = journalOn(new FakeTime());
    await journal.step('configuration validated offline', () => Promise.resolve());
    expect(lines).toEqual(['ok   configuration validated offline']);
  });

  it('reports a failed step and hands its error on', async () => {
    const { journal, lines } = journalOn(new FakeTime());
    await expect(journal.step('pull request merged', () => Promise.reject(new Error('refused')))).rejects.toThrow('refused');
    expect(lines).toEqual(['FAIL pull request merged']);
  });

  it('sums up a run that passed with the steps and the time they took', async () => {
    const time = new FakeTime();
    const { journal } = journalOn(time);
    await journal.step('first', () => Promise.resolve());
    await time.sleep(STEP_MS);
    await journal.step('second', () => Promise.resolve());
    expect(journal.summary()).toBe('e2e-example: 2 steps passed in 2.5 s');
  });

  it('names the first step that failed in the summary of a run that failed', async () => {
    const time = new FakeTime();
    const { journal } = journalOn(time);
    await journal.step('first', () => Promise.resolve());
    await expect(journal.step('second', () => Promise.reject(new Error('no')))).rejects.toThrow('no');
    await expect(journal.step('third', () => Promise.reject(new Error('again')))).rejects.toThrow('again');
    expect(journal.summary()).toBe('e2e-example: failed at "second" after 1 step passed (0.0 s)');
  });
});
