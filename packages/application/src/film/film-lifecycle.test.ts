import { describe, expect, it } from 'vitest';
import { FACTORY_FILM_OPERATOR, PIPELINE_EVENTS } from '../pipeline/journal-events.ts';
import { MergeOnOrder } from '../pipeline/merge-on-order.ts';
import { MergeRefusedError } from '../pipeline/pipeline-errors.ts';
import { loadJournal } from '../pipeline/pipeline-journal.ts';
import { PullRequestFeedback } from '../pipeline/pull-request-feedback.ts';
import { ISSUE_NUMBER } from '../pipeline/testing/pipeline-scenario.ts';
import { FilmRefusedError } from './film-errors.ts';
import type { FilmOrder } from './film-order.ts';
import { FILMS_IN_PROGRESS_REASON } from './film-merge-guard.ts';
import { SCENARIO } from './testing/film-fakes.ts';
import { openPullRequest } from './testing/film-world.ts';

const ORDER: FilmOrder = { issueNumber: ISSUE_NUMBER, scenario: SCENARIO, operator: 'Alex Morgan' };
const SIGNAL = new AbortController().signal;
const PLACEHOLDER = 'are being recorded against the base and the head';

describe('the films a spec declares', () => {
  it('are announced with a placeholder in the pull request body as it opens', async () => {
    const { scenario } = await openPullRequest([SCENARIO]);
    const body = scenario.github.opened[0]?.draft.body ?? '';
    expect(body).toContain('## Behaviour on video');
    expect(body).toContain(`### Scenario \`${SCENARIO}\``);
    expect(body).toContain(PLACEHOLDER);
    expect(body).toContain('expected around 12:20 on 2026-10-12 (UTC)');
  });

  it('link the cockpit once the pull request has a number', async () => {
    const { scenario, services } = await openPullRequest([SCENARIO]);

    await services.queue.orderDeclared();

    expect(scenario.github.bodyUpdates.at(-1)?.body).toContain('[Follow it in the cockpit](https://factory.example.test/projects/storefront/pull-requests/100)');
  });

  it('are ordered once the pull request is open, by the factory, and only once', async () => {
    const { scenario, services } = await openPullRequest([SCENARIO]);

    const first = await services.queue.orderDeclared();
    const second = await services.queue.orderDeclared();

    expect(first).toEqual([{ issueNumber: ISSUE_NUMBER, scenario: SCENARIO, operator: FACTORY_FILM_OPERATOR }]);
    expect(second).toEqual([]);
    const journal = await loadJournal(scenario.events, ISSUE_NUMBER);
    expect(journal.filmOrders.map((order) => [order.scenario, order.status, order.operator])).toEqual([[SCENARIO, 'queued', FACTORY_FILM_OPERATOR]]);
  });

  it('are replaced by the recordings once the film lands, and ordered again for a new head after feedback', async () => {
    const { scenario, services, behaviour } = await openPullRequest([SCENARIO]);
    await services.queue.orderDeclared();
    await behaviour.film({ ...ORDER, operator: FACTORY_FILM_OPERATOR }, SIGNAL);
    const landed = scenario.github.bodyUpdates.at(-1)?.body ?? '';
    expect(landed).not.toContain(PLACEHOLDER);
    expect(landed).toContain('[Watch the recording](');

    const feedback = new PullRequestFeedback({ ...scenario.dependencies(), clock: scenario.clock }, scenario.settings.implementerEscalation);
    await feedback.record({ pullRequestNumber: 100, author: 'Dana Reyes', source: 'cockpit', body: 'The total is wrong.' });

    const journal = await loadJournal(scenario.events, ISSUE_NUMBER);
    expect(journal.films).toEqual([]);
    expect(journal.filmOrders).toEqual([]);
    expect(journal.spec?.films).toEqual([SCENARIO]);
  });
});

describe('FilmQueue', () => {
  it('queues a film ordered by hand and shows its placeholder in the body', async () => {
    const { scenario, services } = await openPullRequest();

    await services.queue.order(ORDER);

    const journal = await loadJournal(scenario.events, ISSUE_NUMBER);
    expect(journal.filmOrders.map((order) => [order.scenario, order.status, order.operator])).toEqual([[SCENARIO, 'queued', 'Alex Morgan']]);
    expect(scenario.github.bodyUpdates.at(-1)?.body).toContain(PLACEHOLDER);
  });

  it('refuses a scenario already queued or recording, a bad name and an issue that cannot be filmed', async () => {
    const { scenario, services } = await openPullRequest();
    await services.queue.order(ORDER);
    await expect(services.queue.order(ORDER)).rejects.toThrow(`the film of scenario ${SCENARIO} is already queued`);
    await expect(services.queue.order({ ...ORDER, scenario: 'a b' })).rejects.toBeInstanceOf(FilmRefusedError);
    await expect(services.queue.order({ ...ORDER, issueNumber: 7 })).rejects.toThrow('unknown to the factory');
    await scenario.events.append(PIPELINE_EVENTS.pullRequestMerged, `issue/${ISSUE_NUMBER}`, { mergeSha: 'merge0000' });
    await expect(services.queue.order({ ...ORDER, scenario: 'other' })).rejects.toThrow('already merged');
  });

  it('refuses an order once the merge is prepared and the evidence removed', async () => {
    const { scenario, services, head } = await openPullRequest();
    scenario.github.checkRuns = [{ name: 'ci', conclusion: 'success', url: 'https://ci.example/1', durationMs: null }];
    await scenario.mergeOnOrder().merge({ pullRequestNumber: 100, expectedHeadSha: head }).catch(() => undefined);
    await scenario.events.append(PIPELINE_EVENTS.evidenceRemoved, `issue/${ISSUE_NUMBER}`, { reviewedHeadSha: head, headSha: head });
    await expect(services.queue.order({ ...ORDER, scenario: 'late' })).rejects.toBeInstanceOf(FilmRefusedError);
  });

  it('offers the film ordered first, then the next one', async () => {
    const { services } = await openPullRequest();
    await services.queue.order({ ...ORDER, scenario: 'second-film' });
    await services.queue.order({ ...ORDER, scenario: 'third-film' });

    const first = await services.queue.next();
    expect(first?.order.scenario).toBe('second-film');

    await services.queue.fail(first?.order ?? ORDER, 'no session');
    expect((await services.queue.next())?.order.scenario).toBe('third-film');
  });

  it('offers nothing when no film waits', async () => {
    const { services } = await openPullRequest();
    expect(await services.queue.next()).toBeNull();
  });

  it('tells in the body that a film failed and how to order it again', async () => {
    const { scenario, services } = await openPullRequest();
    await services.queue.order(ORDER);

    await services.queue.fail(ORDER, 'the session expired');

    const body = scenario.github.bodyUpdates.at(-1)?.body ?? '';
    expect(body).toContain('The recording of this scenario failed: the session expired.');
    expect(body).toContain(`agent-factory film ${ISSUE_NUMBER} --scenario ${SCENARIO} --project storefront`);
  });
});

describe('merging with films', () => {
  it('is refused while a film of the pull request is queued, with the expected arrival', async () => {
    const { scenario, services, head } = await openPullRequest();
    await services.queue.order(ORDER);
    scenario.github.checkRuns = [{ name: 'ci', conclusion: 'success', url: 'https://ci.example/1', durationMs: null }];

    const merge = new MergeOnOrder(scenario.dependencies(), scenario.headVisibility, services.guard).merge({ pullRequestNumber: 100, expectedHeadSha: head });

    await expect(merge).rejects.toBeInstanceOf(MergeRefusedError);
    await expect(new MergeOnOrder(scenario.dependencies(), scenario.headVisibility, services.guard).merge({ pullRequestNumber: 100, expectedHeadSha: head })).rejects.toThrow(
      `${FILMS_IN_PROGRESS_REASON}, expected around 12:20 on 2026-10-12 (UTC)`,
    );
    expect(scenario.github.merges).toEqual([]);
  });

  it('goes on the head the film committed, and is not held by a failed film', async () => {
    const { scenario, services, behaviour } = await openPullRequest();
    scenario.github.checkRuns = [{ name: 'ci', conclusion: 'success', url: 'https://ci.example/1', durationMs: null }];
    const outcome = await behaviour.film(ORDER, SIGNAL);
    if (outcome.kind !== 'finished') throw new Error('the film should have finished');
    await services.queue.order({ ...ORDER, scenario: 'broken' });
    await services.queue.fail({ ...ORDER, scenario: 'broken' }, 'no session');

    const merged = await new MergeOnOrder(scenario.dependencies(), scenario.headVisibility, services.guard).merge({ pullRequestNumber: 100, expectedHeadSha: outcome.commitSha });

    expect(merged.pullRequestNumber).toBe(100);
    expect(scenario.github.merges).toHaveLength(1);
  });

  it('is not held when the project films nothing', async () => {
    const { scenario, head } = await openPullRequest();
    scenario.github.checkRuns = [{ name: 'ci', conclusion: 'success', url: 'https://ci.example/1', durationMs: null }];
    await scenario.events.append(PIPELINE_EVENTS.filmQueued, `issue/${ISSUE_NUMBER}`, { scenario: SCENARIO, operator: 'Alex Morgan' });

    await new MergeOnOrder(scenario.dependencies(), scenario.headVisibility, null).merge({ pullRequestNumber: 100, expectedHeadSha: head });

    expect(scenario.github.merges).toHaveLength(1);
  });
});
