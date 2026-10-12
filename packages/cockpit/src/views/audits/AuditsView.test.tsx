import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderRoute } from '../../test/render.tsx';
import { AUDIT, auditsPath, LEDGER, minutesAgo, openAudit, short, STOREFRONT, withProject } from './audit-test-support.ts';

const PROMO_BANNER_MESSAGE = 'feat(cart): announce 20% off everything on the promo banner (#48)';

const hrefsIn = (region: HTMLElement) => within(region).getAllByRole('link').map((link) => link.getAttribute('href'));
const auditLink = (project: string, auditId: string) => `/projects/${project}/audits/${auditId}`;
const listItem = (message: string) => screen.getByRole('link', { name: new RegExp(message.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&')) });

describe('AuditsView list', () => {
  it('groups the audits as to handle, in progress and settled, each from the most recent', async () => {
    await renderRoute(auditsPath(STOREFRONT));
    const toHandle = await screen.findByRole('region', { name: 'To handle' });
    expect(hrefsIn(toHandle)).toEqual([auditLink(STOREFRONT, AUDIT.promoBanner)]);
    expect(hrefsIn(screen.getByRole('region', { name: 'In progress' }))).toEqual([AUDIT.apiReference, AUDIT.lockfile, AUDIT.doubleSubmit].map((id) => auditLink(STOREFRONT, id)));
    expect(hrefsIn(screen.getByRole('region', { name: 'Settled' }))).toEqual([AUDIT.footerLinks, AUDIT.httpClient].map((id) => auditLink(STOREFRONT, id)));
  });

  it('counts the audits of the project in the title of the list', async () => {
    await renderRoute(auditsPath(STOREFRONT));
    expect(await screen.findByRole('heading', { level: 1, name: /^Audits\s*6$/ })).toBeInTheDocument();
  });

  it('shows for each audit its mark, its short commit, why it was made, its state and when it was detected', async () => {
    await renderRoute(auditsPath(STOREFRONT));
    const link = listItem(PROMO_BANNER_MESSAGE);
    expect(within(link).getByRole('img', { name: 'To challenge' })).toBeInTheDocument();
    expect(within(link).getByText(short(AUDIT.promoBanner))).toBeInTheDocument();
    expect(within(link).getByText('Factory label missing')).toBeInTheDocument();
    expect(within(link).getByText('To challenge')).toBeInTheDocument();
    expect(within(link).getByText(/ago$/)).toHaveAttribute('datetime', minutesAgo(1190));
  });

  it('says that a verdict has been resolved', async () => {
    await renderRoute(auditsPath(STOREFRONT));
    const link = listItem('build(deps): update the HTTP client to its latest minor release (#22)');
    expect(within(link).getByText('To rewrite · Resolved')).toBeInTheDocument();
    expect(within(link).getByRole('img', { name: 'To rewrite' })).toBeInTheDocument();
  });

  it('reads the state of an audit that is still under way as it is', async () => {
    await renderRoute(auditsPath(STOREFRONT));
    expect(within(listItem('fix(checkout): stop the payment form from submitting twice')).getByText('Auditing')).toBeInTheDocument();
    expect(within(listItem('build(deps): refresh the lockfile (#54)')).getByText('Detected')).toBeInTheDocument();
  });

  it('opens the audit that needs the operator first when none is named', async () => {
    await renderRoute(auditsPath(STOREFRONT));
    expect(await screen.findByRole('heading', { level: 1, name: PROMO_BANNER_MESSAGE })).toBeInTheDocument();
    expect(listItem(PROMO_BANNER_MESSAGE)).toHaveAttribute('aria-current', 'page');
  });

  it('selects the audit named in the address and marks it in the list', async () => {
    await openAudit(AUDIT.footerLinks);
    expect(screen.getByRole('heading', { level: 1, name: /^fix\(footer\): point the delivery and returns links/ })).toBeInTheDocument();
    const current = screen.getAllByRole('link').filter((link) => link.getAttribute('aria-current') === 'page');
    expect(current.map((link) => link.getAttribute('href'))).toEqual([auditLink(STOREFRONT, AUDIT.footerLinks)]);
  });

  it('lists only the audits of the project of the address', async () => {
    await renderRoute(auditsPath(LEDGER));
    const toHandle = await screen.findByRole('region', { name: 'To handle' });
    expect(hrefsIn(toHandle)).toEqual([auditLink(LEDGER, AUDIT.ledgerRewrite)]);
    expect(hrefsIn(screen.getByRole('region', { name: 'Settled' }))).toEqual([auditLink(LEDGER, AUDIT.ledgerKept)]);
    expect(screen.queryByRole('region', { name: 'In progress' })).not.toBeInTheDocument();
  });

  it('does not find the audit of one project in another', async () => {
    await renderRoute(auditsPath(STOREFRONT, AUDIT.ledgerRewrite));
    expect(await screen.findByRole('heading', { level: 2, name: 'Audit not found' })).toBeInTheDocument();
    expect(screen.getByText('The project holds no audit with this identifier.')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('says that the audit does not exist', async () => {
    await renderRoute(auditsPath(STOREFRONT, 'ffffffffffffffffffffffffffffffffffffffff'));
    expect(await screen.findByText('Audit not found')).toBeInTheDocument();
  });

  it('says that the project has no audit yet, and draws no detail', async () => {
    await renderRoute(auditsPath(STOREFRONT), { snapshot: withProject(STOREFRONT, (project) => ({ ...project, audits: [] })) });
    expect(await screen.findByText('No audit yet')).toBeInTheDocument();
    expect(screen.getByText('A change that reaches the base branch outside the factory is audited and appears here.')).toBeInTheDocument();
    expect(screen.queryByRole('article')).not.toBeInTheDocument();
  });

  it('explains which changes are audited and which are not', async () => {
    await renderRoute(auditsPath(STOREFRONT));
    expect(await screen.findByText('Changes that reach the base branch outside the factory are audited, except those of the automations the project names.')).toBeInTheDocument();
  });
});

describe('AuditsView in French', () => {
  it('words the list, the groups and the switch in French', async () => {
    await openAudit(AUDIT.promoBanner, { locale: 'fr' });
    for (const name of ['À traiter', 'En cours', 'Réglés']) expect(screen.getByRole('region', { name })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Afficher' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '6 audits' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '5 changements non audités' })).toBeInTheDocument();
    expect(within(listItem(PROMO_BANNER_MESSAGE)).getByText('À challenger')).toBeInTheDocument();
  });

  it('says in French that an audit was not found, and that none exists', async () => {
    await renderRoute(auditsPath(STOREFRONT, 'ffffffffffffffffffffffffffffffffffffffff'), { locale: 'fr' });
    expect(await screen.findByText('Audit introuvable')).toBeInTheDocument();
  });

  it('writes the singular of a count of one', async () => {
    const snapshot = withProject(STOREFRONT, (project) => ({ ...project, audits: project.audits.slice(0, 1), skippedChanges: project.skippedChanges.slice(0, 1) }));
    await renderRoute(auditsPath(STOREFRONT), { locale: 'fr', snapshot });
    expect(await screen.findByRole('radio', { name: '1 audit' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '1 changement non audité' })).toBeInTheDocument();
  });
});
