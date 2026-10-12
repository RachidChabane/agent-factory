import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { HealthCheckView, HealthSample } from '../../contract/index.ts';
import { fixtureSnapshot } from '../../test/render.tsx';
import { clock, environmentCard, LEDGER, openDelivery, panelOf, STOREFRONT, withEnvironment } from './delivery-test-support.ts';

function fixtureCheck(project: string, environment: string, name: string): HealthCheckView {
  const check = fixtureSnapshot()
    .projects.find((candidate) => candidate.id === project)
    ?.environments.find((candidate) => candidate.name === environment)
    ?.health.find((candidate) => candidate.name === name);
  if (check === undefined) throw new Error(`the fixture world has no check ${name} on ${environment}`);
  return check;
}

function sample(minutesAgo: number, patch: Partial<HealthSample> = {}): HealthSample {
  return { at: clock.minutesAgo(minutesAgo), ok: true, statusCode: 200, latencyMs: 100, detail: '200 OK', ...patch };
}

const WORDS = {
  en: { panel: 'Health', list: (environment: string) => `Health checks of ${environment}` },
  fr: { panel: 'Santé', list: (environment: string) => `Contrôles de santé de ${environment}` },
} as const;

/** The list item of one health check, found in the Health part of an environment. */
function checkItem(environment: string, name: string, locale: keyof typeof WORDS = 'en'): HTMLElement {
  const list = within(panelOf(environmentCard(environment), WORDS[locale].panel)).getByRole('list', { name: WORDS[locale].list(environment) });
  const item = within(list)
    .getAllByRole('listitem')
    .find((candidate) => within(candidate).queryByText(name) !== null);
  if (item === undefined) throw new Error(`no health check named ${name} on ${environment}`);
  return item;
}

describe('DeliveryView health: the latest sample', () => {
  it('shows whether the check passes, what it answered, how fast, and when it was sampled', async () => {
    await openDelivery();
    const latest = fixtureCheck(STOREFRONT, 'development', 'healthz').latest;
    const item = checkItem('development', 'healthz');
    expect(item).toHaveTextContent('Passing');
    expect(item).toHaveTextContent('Status 200');
    expect(item).toHaveTextContent(`${latest?.latencyMs ?? 0} ms`);
    expect(item).toHaveTextContent('200 OK');
    expect(within(item).getByText(/^Sampled 3 min/)).toHaveAttribute('title', 'October 12, 2026 at 9:57:00 AM UTC');
    expect(within(item).queryByText('Stale')).not.toBeInTheDocument();
  });

  it('opens the address that is probed in a new tab', async () => {
    await openDelivery();
    const link = within(checkItem('development', 'healthz')).getByRole('link', { name: 'https://dev.storefront.example.com/healthz' });
    expect(link).toHaveAttribute('href', 'https://dev.storefront.example.com/healthz');
    expect(link).toHaveAttribute('target', '_blank');
  });

  it('shows a failing check with the status it answered, and marks an old sample stale', async () => {
    await openDelivery();
    const item = checkItem('staging', 'homepage');
    expect(item).toHaveTextContent('Failing');
    expect(item).toHaveTextContent('Status 503');
    expect(item).toHaveTextContent('5,000 ms');
    expect(item).toHaveTextContent('Service Unavailable');
    expect(within(item).getByText(/^Sampled 30 min/)).toBeInTheDocument();
    expect(within(item).getByText('Stale')).toHaveAttribute('title', 'Read more than 10 min ago, so it may no longer be current.');
  });

  it('says that nothing answered when the probe was refused, instead of showing a status or a latency', async () => {
    await openDelivery(LEDGER);
    const item = checkItem('production', 'api');
    expect(item).toHaveTextContent('Failing');
    expect(item).toHaveTextContent('No response');
    expect(item).toHaveTextContent('Latency not measured');
    expect(item).toHaveTextContent('Connection refused');
    expect(item).not.toHaveTextContent(/Status \d/);
  });

  it('leaves out the detail of a sample that carries none', async () => {
    const snapshot = withEnvironment(STOREFRONT, 'development', (environment) => ({
      ...environment,
      health: [{ name: 'healthz', url: 'https://dev.storefront.example.com/healthz', latest: sample(2, { detail: '' }), series: [sample(2, { detail: '' })] }],
    }));
    await openDelivery(STOREFRONT, { snapshot });
    expect(checkItem('development', 'healthz')).not.toHaveTextContent('200 OK');
  });
});

describe('DeliveryView health: states without a sample', () => {
  it('says that a check has no sample yet and that there is nothing to chart', async () => {
    await openDelivery();
    const item = checkItem('staging', 'checkout-api');
    expect(within(item).getByText('No sample yet')).toBeInTheDocument();
    expect(within(item).getByText('Nothing to chart until a first sample is taken. Check the health of this environment to take one.')).toBeInTheDocument();
    expect(within(item).queryByRole('figure')).not.toBeInTheDocument();
    expect(within(item).queryByText('Passing')).not.toBeInTheDocument();
    expect(within(item).queryByText('Failing')).not.toBeInTheDocument();
  });

  it('says that an environment has no health check configured, which is not the same as no sample', async () => {
    await openDelivery(LEDGER);
    const health = panelOf(environmentCard('staging'), 'Health');
    expect(within(health).getByText('No health check configured')).toBeInTheDocument();
    expect(within(health).getByText('This environment declares no health check, so the factory samples nothing.')).toBeInTheDocument();
    expect(within(health).queryByText('No sample yet')).not.toBeInTheDocument();
    expect(within(health).queryByRole('list')).not.toBeInTheDocument();
  });

  it('says that the last day holds no sample to chart when the latest sample has no series', async () => {
    const snapshot = withEnvironment(STOREFRONT, 'development', (environment) => ({
      ...environment,
      health: [{ name: 'healthz', url: 'https://dev.storefront.example.com/healthz', latest: sample(2), series: [] }],
    }));
    await openDelivery(STOREFRONT, { snapshot });
    const item = checkItem('development', 'healthz');
    expect(within(item).getByText('Passing')).toBeInTheDocument();
    expect(within(item).getByText('No sample of the last 24 hours to chart.')).toBeInTheDocument();
    expect(within(item).queryByRole('figure')).not.toBeInTheDocument();
  });
});

describe('DeliveryView health: the chart of the last day', () => {
  it('states the numbers in words, so that the picture is never the only source', async () => {
    await openDelivery();
    const latencies = fixtureCheck(STOREFRONT, 'development', 'healthz')
      .series.map((entry) => entry.latencyMs)
      .filter((latency): latency is number => latency !== null);
    const figure = within(checkItem('development', 'healthz')).getByRole('figure');
    expect(figure).toHaveAccessibleName(`Last 24 hours: 24 samples, 21 passing, 3 failing. Latency from ${Math.min(...latencies)} ms to 5,000 ms.`);
  });

  it('draws one cell per sample, each saying when and whether it passed', async () => {
    await openDelivery();
    const figure = within(checkItem('development', 'healthz')).getByRole('figure');
    expect(within(figure).getAllByTitle(/: Passing$/)).toHaveLength(21);
    expect(within(figure).getAllByTitle(/: Failing$/)).toHaveLength(3);
    expect(within(figure).getAllByTitle('Oct 11, 2026, 10:57 AM: Passing')).toHaveLength(1);
  });

  it('draws the latency over time and names the last value', async () => {
    await openDelivery();
    const latest = fixtureCheck(STOREFRONT, 'development', 'healthz').latest;
    const figure = within(checkItem('development', 'healthz')).getByRole('figure');
    expect(within(figure).getByRole('img', { name: `Latency: ${latest?.latencyMs ?? 0} ms` })).toBeInTheDocument();
  });

  it('labels the two ends of the time axis with how long ago they are', async () => {
    await openDelivery();
    const figure = within(checkItem('development', 'healthz')).getByRole('figure');
    expect(within(figure).getByText('23 hr. ago')).toBeInTheDocument();
    expect(within(figure).getByText('3 min. ago')).toBeInTheDocument();
  });

  it('counts every sample of a check that failed all day, and draws no latency where none was measured', async () => {
    await openDelivery(LEDGER);
    const figure = within(checkItem('production', 'api')).getByRole('figure');
    expect(figure).toHaveAccessibleName('Last 24 hours: 24 samples, 0 passing, 24 failing. No sample measured a latency.');
    expect(within(figure).getAllByTitle(/: Failing$/)).toHaveLength(24);
    expect(within(figure).queryByRole('img')).not.toBeInTheDocument();
  });

  it('groups a day of frequent samples into a strip that fits, and still counts every sample', async () => {
    const series = Array.from({ length: 288 }, (_, index) => sample((287 - index) * 5 + 2, index === 100 ? { ok: false, statusCode: 503, detail: 'Service Unavailable' } : {}));
    const snapshot = withEnvironment(STOREFRONT, 'development', (environment) => ({
      ...environment,
      health: [{ name: 'healthz', url: 'https://dev.storefront.example.com/healthz', latest: series.at(-1) ?? null, series }],
    }));
    await openDelivery(STOREFRONT, { snapshot });
    const figure = within(checkItem('development', 'healthz')).getByRole('figure');
    expect(figure).toHaveAccessibleName('Last 24 hours: 288 samples, 287 passing, 1 failing. Latency from 100 ms to 100 ms.');
    expect(within(figure).getAllByTitle(/ to .*: \d+ passing, \d+ failing$/)).toHaveLength(48);
    expect(within(figure).getAllByTitle(/: 5 passing, 1 failing$/)).toHaveLength(1);
  });

  it('writes a single sample in the singular and draws no trend from it', async () => {
    const snapshot = withEnvironment(STOREFRONT, 'development', (environment) => ({
      ...environment,
      health: [{ name: 'healthz', url: 'https://dev.storefront.example.com/healthz', latest: sample(2), series: [sample(2)] }],
    }));
    await openDelivery(STOREFRONT, { snapshot });
    const figure = within(checkItem('development', 'healthz')).getByRole('figure');
    expect(figure).toHaveAccessibleName('Last 24 hours: 1 sample, 1 passing, 0 failing. Latency from 100 ms to 100 ms.');
    expect(within(figure).queryByRole('img')).not.toBeInTheDocument();
  });

  it('draws no trend from a single latency, however many samples got no answer', async () => {
    const series = [sample(30, { ok: false, statusCode: null, latencyMs: null, detail: 'Connection refused' }), sample(2, { latencyMs: 80 })];
    const snapshot = withEnvironment(STOREFRONT, 'development', (environment) => ({
      ...environment,
      health: [{ name: 'healthz', url: 'https://dev.storefront.example.com/healthz', latest: series[1] ?? null, series }],
    }));
    await openDelivery(STOREFRONT, { snapshot });
    const figure = within(checkItem('development', 'healthz')).getByRole('figure');
    expect(within(figure).queryByRole('img')).not.toBeInTheDocument();
    expect(figure).toHaveAccessibleName('Last 24 hours: 2 samples, 1 passing, 1 failing. Latency from 80 ms to 80 ms.');
  });
});

describe('DeliveryView health in French', () => {
  it('writes the sample, the chart and the empty states in French', async () => {
    await openDelivery(STOREFRONT, { locale: 'fr' });
    const item = checkItem('staging', 'homepage', 'fr');
    expect(item).toHaveTextContent('En échec');
    expect(item).toHaveTextContent('Statut 503');
    expect(item).toHaveTextContent(/Mesuré il y a 30 min/);
    expect(within(item).getByRole('figure')).toHaveAccessibleName(/^Dernières 24 h : 24 relevés \(réussis : 20, en échec : 4\)\. Latence de 246 ms à 5\s000 ms\.$/);
    expect(within(checkItem('staging', 'checkout-api', 'fr')).getByText('Aucun relevé pour l’instant')).toBeInTheDocument();
  });

  it('writes one sample in the singular in French', async () => {
    const snapshot = withEnvironment(STOREFRONT, 'development', (environment) => ({
      ...environment,
      health: [{ name: 'healthz', url: 'https://dev.storefront.example.com/healthz', latest: sample(2), series: [sample(2)] }],
    }));
    await openDelivery(STOREFRONT, { snapshot, locale: 'fr' });
    expect(within(checkItem('development', 'healthz', 'fr')).getByRole('figure')).toHaveAccessibleName('Dernières 24 h : 1 relevé (réussis : 1, en échec : 0). Latence de 100 ms à 100 ms.');
    expect(screen.getByRole('region', { name: 'Environnements' })).toBeInTheDocument();
  });
});
