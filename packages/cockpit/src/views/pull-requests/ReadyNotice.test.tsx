import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { ReadyNoticeView } from '../../contract/index.ts';
import { PULL_REQUEST } from '../../test/fixtures/storefront/ids.ts';
import { fixtureSnapshot } from '../../test/render.tsx';
import { minutesAgo, openPullRequest, STOREFRONT, withPullRequest } from './pull-request-test-support.ts';

const SEARCH = PULL_REQUEST.naturalLanguageSearch;
const HEAD_SHA = 'abcdef0123456789abcdef0123456789abcdef01';
const noticeRegion = () => screen.getByRole('region', { name: 'Ready notice' });

function withNotice(notice: ReadyNoticeView) {
  return withPullRequest(STOREFRONT, SEARCH, (pullRequest) => ({ ...pullRequest, readyNotice: notice }), fixtureSnapshot());
}

describe('the ready notice of a pull request', () => {
  it('says when it was sent for which head, and lists the links it carried and the files left out', async () => {
    await openPullRequest(SEARCH);
    const region = noticeRegion();
    expect(region).toHaveTextContent(/Sent .* for head bada550\./);
    const links = within(region).getByRole('list', { name: 'Links in the notice' });
    expect(within(links).getAllByRole('link').map((link) => [link.textContent?.trim(), link.getAttribute('href')])).toEqual([
      ['search-by-colour · before · film.mp4', 'https://files.example.com/search-by-colour/before.mp4'],
      ['search-by-colour · after · film.mp4', 'https://files.example.com/search-by-colour/after.mp4'],
      ['evidence · after · search-results.png', 'https://files.example.com/evidence/search-results.png'],
    ]);
    expect(within(links).getAllByRole('link')[0]).toHaveAttribute('target', '_blank');
    expect(within(region).getByText('Files left out of the notice')).toBeInTheDocument();
    expect(within(region).getByText('search-by-colour · after · final.png: the upload command exited with 3: the storage quota is spent')).toBeInTheDocument();
  });

  it('says that the notice carried no link when none could be made', async () => {
    await openPullRequest(SEARCH, { snapshot: withNotice({ status: 'sent', sentAt: minutesAgo(5), headSha: HEAD_SHA, links: [], failures: [] }) });
    expect(noticeRegion()).toHaveTextContent(/Sent .* for head abcdef0\./);
    expect(within(noticeRegion()).getByText(/The notice carried no link/)).toBeInTheDocument();
    expect(within(noticeRegion()).queryByRole('list', { name: 'Links in the notice' })).not.toBeInTheDocument();
  });

  it('says what holds it while the checks run, with when they were read', async () => {
    await openPullRequest(SEARCH, { snapshot: withNotice({ status: 'held', holds: [{ kind: 'checks-running' }], checksReadAt: minutesAgo(3) }) });
    const region = noticeRegion();
    expect(within(region).getByText('Not sent yet')).toBeInTheDocument();
    expect(within(region).getByRole('list', { name: 'What holds the notice' })).toHaveTextContent('The required checks have not finished.');
    expect(region).toHaveTextContent(/Read 3 min\. ago/);
  });

  it('says that the checks were never read, and names the scenarios of the films that hold it', async () => {
    await openPullRequest(SEARCH, {
      snapshot: withNotice({
        status: 'held',
        holds: [{ kind: 'films-pending', scenarios: ['checkout-flow'] }, { kind: 'films-failed', scenarios: ['order-history', 'refund'] }, { kind: 'checks-failed' }],
        checksReadAt: null,
      }),
    });
    const holds = within(noticeRegion()).getByRole('list', { name: 'What holds the notice' });
    expect(within(holds).getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'The film of scenario checkout-flow is queued or recording.',
      'The films of scenarios order-history, refund failed: order them again, or merge without them.',
      'A required check failed.',
    ]);
    expect(within(noticeRegion()).getByText('The checks were not read')).toBeInTheDocument();
  });

  it('says that everything holds and the notice goes out at the next tick, with when the checks it rests on were read', async () => {
    await openPullRequest(SEARCH, { snapshot: withNotice({ status: 'due', checksReadAt: minutesAgo(2) }) });
    expect(within(noticeRegion()).getByText('Everything holds: the notice goes out at the next tick of the factory.')).toBeInTheDocument();
    expect(noticeRegion()).toHaveTextContent(/Read 2 min\. ago/);
  });

  it('says that the checks it rests on were never read when the factory holds no reading of them', async () => {
    await openPullRequest(SEARCH, { snapshot: withNotice({ status: 'due', checksReadAt: null }) });
    expect(within(noticeRegion()).getByText('The checks were not read')).toBeInTheDocument();
  });

  it('says that none was sent for a pull request that waits for no merge', async () => {
    await openPullRequest(SEARCH, { snapshot: withNotice({ status: 'none' }) });
    expect(within(noticeRegion()).getByText('No ready notice was sent for this pull request.')).toBeInTheDocument();
  });

  it('is written in French when the cockpit is', async () => {
    await openPullRequest(SEARCH, { locale: 'fr' });
    const region = screen.getByRole('region', { name: 'Notification de prête à merger' });
    expect(region).toHaveTextContent(/Envoyée .* pour la tête bada550\./);
    expect(within(region).getByRole('list', { name: 'Liens de la notification' })).toBeInTheDocument();
  });
});
