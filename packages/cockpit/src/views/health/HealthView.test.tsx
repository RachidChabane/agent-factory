import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { compact, usd } from '../../format/format.ts';
import { fixtureSnapshot, renderWithCockpit } from '../../test/render.tsx';
import { formatErrorRate, formatLatency } from './health-metrics.ts';
import { HealthView } from './HealthView.tsx';

function productionEnvironment() {
  const environment = fixtureSnapshot().health.environments.find((candidate) => candidate.environment === 'prod');
  if (environment === undefined) throw new Error('fixture must contain the production environment');
  return environment;
}

async function findKpi(name: string): Promise<HTMLElement> {
  return screen.findByLabelText(name, { selector: '.health-kpi' });
}

describe('HealthView', () => {
  it('shows a loading state until the snapshot arrives', () => {
    renderWithCockpit(<HealthView />);
    expect(screen.getByLabelText('Chargement de la santé')).toBeInTheDocument();
  });

  it('shows the production KPIs with their thresholds', async () => {
    const prod = productionEnvironment();
    renderWithCockpit(<HealthView />);
    const errors = await findKpi('Taux d’erreur');
    expect(within(errors).getByText(formatErrorRate(prod.errorRate.current))).toBeInTheDocument();
    expect(within(errors).getByText('seuil 2 %')).toBeInTheDocument();
    const latency = screen.getByLabelText('Latence p95', { selector: '.health-kpi' });
    expect(within(latency).getByText(formatLatency(prod.latencyP95.current))).toBeInTheDocument();
    expect(within(latency).getByText('seuil 3 s')).toBeInTheDocument();
    const cost = screen.getByLabelText('Coût LLM', { selector: '.health-kpi' });
    expect(within(cost).getByText(usd(prod.llmCost.current))).toBeInTheDocument();
    const requests = screen.getByLabelText('Requêtes', { selector: '.health-kpi' });
    expect(within(requests).getByText(compact(prod.requests.current))).toBeInTheDocument();
  });

  it('links to Datadog for the selected environment', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<HealthView />);
    const link = await screen.findByRole('link', { name: /Ouvrir dans Datadog/ });
    expect(link).toHaveAttribute('href', productionEnvironment().datadogUrl);
    expect(link).toHaveAttribute('target', '_blank');
    await user.click(screen.getByRole('radio', { name: 'PREP' }));
    expect(screen.getByRole('link', { name: /Ouvrir dans Datadog/ })).toHaveAttribute('href', expect.stringContaining('env=prep'));
  });

  it('shows the user feedback with its satisfaction and recent comments', async () => {
    renderWithCockpit(<HealthView />);
    await findKpi('Requêtes');
    expect(screen.getByRole('meter', { name: 'Satisfaction des utilisateurs' })).toBeInTheDocument();
    expect(screen.getByText('184')).toBeInTheDocument();
    expect(screen.getByText('23')).toBeInTheDocument();
    const recent = screen.getByRole('list', { name: 'Retours récents' });
    expect(within(recent).getByText('Perfect delivery update email, I knew exactly when to expect my parcel.')).toBeInTheDocument();
    expect(within(recent).getByText('Sans commentaire')).toBeInTheDocument();
    expect(within(recent).getAllByRole('img', { name: 'Retour négatif' })).toHaveLength(2);
  });

  it('lists the production pods and highlights restarts', async () => {
    renderWithCockpit(<HealthView />);
    const pods = await screen.findByRole('table', { name: 'Pods' });
    expect(within(pods).getByText('storefront-worker-5f4b7d9c8-m2jqs')).toBeInTheDocument();
    expect(within(pods).getAllByText('En marche')).toHaveLength(5);
    expect(within(pods).getByText('2')).toHaveClass('ds-badge--running');
    expect(within(pods).getAllByText('storefront-v2.3.0')).toHaveLength(5);
  });

  it('switches to PREP and shows its pods and the empty alert state', async () => {
    const user = userEvent.setup();
    renderWithCockpit(<HealthView />);
    await screen.findByRole('table', { name: 'Pods' });
    await user.click(screen.getByRole('radio', { name: 'PREP' }));
    const pods = screen.getByRole('table', { name: 'Pods' });
    expect(within(pods).getByText('storefront-web-58d6c9b7f-ab12c')).toBeInTheDocument();
    expect(within(pods).queryByText('storefront-worker-5f4b7d9c8-m2jqs')).not.toBeInTheDocument();
    expect(screen.getByText('Aucune alerte')).toBeInTheDocument();
  });

  it('puts triggered alerts first and links to the monitors', async () => {
    renderWithCockpit(<HealthView />);
    const alerts = await screen.findByRole('list', { name: 'Alertes' });
    const items = within(alerts).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    const first = items[0];
    if (first === undefined) throw new Error('expected a first alert');
    expect(within(first).getByText('Checkout API p95 latency > 3 s')).toBeInTheDocument();
    expect(within(first).getByText('Avertissement')).toHaveClass('ds-badge--running');
    expect(within(first).getByText(/Déclenchée/)).toBeInTheDocument();
    expect(within(alerts).getByText('Critique')).toHaveClass('ds-badge--failed');
    expect(within(alerts).getByText('Info')).toHaveClass('ds-badge--neutral');
    const monitors = within(alerts).getAllByRole('link', { name: /Voir le moniteur/ });
    expect(monitors[0]).toHaveAttribute('href', expect.stringContaining('/monitors/52816'));
  });
});
