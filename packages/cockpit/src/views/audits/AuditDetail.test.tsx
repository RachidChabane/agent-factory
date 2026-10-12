import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AUDIT, LEDGER, minutesAgo, openAudit, short, STOREFRONT, withAudit, withProject } from './audit-test-support.ts';

const article = () => screen.getByRole('article');
const conclusion = () => screen.getByRole('region', { name: 'Auditor’s conclusion' });
const files = () => screen.getByRole('region', { name: 'Changed files' });
const draft = () => screen.getByRole('region', { name: 'Audit issue' });

describe('AuditsView header', () => {
  it('names the change, its state, its short commit and why it was audited', async () => {
    await openAudit(AUDIT.promoBanner);
    expect(within(article()).getByRole('heading', { level: 1, name: 'feat(cart): announce 20% off everything on the promo banner (#48)' })).toBeInTheDocument();
    expect(within(article()).getByRole('img', { name: 'To challenge' })).toBeInTheDocument();
    expect(within(article()).getAllByText('Factory label missing')).toHaveLength(2);
    expect(within(article()).getByText(short(AUDIT.promoBanner))).toHaveAttribute('title', AUDIT.promoBanner);
    expect(within(article()).getByRole('button', { name: 'Copy the commit SHA' })).toBeInTheDocument();
  });

  it('gives the author, the branch and the time the change was detected', async () => {
    await openAudit(AUDIT.promoBanner);
    expect(within(article()).getByText('rchen')).toBeInTheDocument();
    expect(within(article()).getByText('factory/promo-banner-copy')).toBeInTheDocument();
    expect(within(article()).getByText('Oct 11, 2026, 2:10 PM')).toHaveAttribute('datetime', minutesAgo(1190));
  });

  it('says that no author is reported when the forge names none', async () => {
    await openAudit(AUDIT.apiReference);
    expect(within(article()).getByText('No author reported')).toBeInTheDocument();
  });

  it('links a pull request on the forge in a new tab', async () => {
    await openAudit(AUDIT.promoBanner);
    const link = within(article()).getByRole('link', { name: 'PR #48' });
    expect(link).toHaveAttribute('href', 'https://github.example.com/example-org/storefront/pull/48');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('links a pull request the factory opened to its own page', async () => {
    await openAudit(AUDIT.httpClient);
    const link = within(article()).getByRole('link', { name: 'PR #22' });
    expect(link).toHaveAttribute('href', '/projects/storefront/pull-requests/22');
    expect(link).not.toHaveAttribute('target');
  });

  it('opens the pull request of a local forge on the page the forge serves, in a new tab', async () => {
    await openAudit(AUDIT.ledgerRewrite, {}, LEDGER);
    const link = within(article()).getByRole('link', { name: 'PR #20' });
    expect(link).toHaveAttribute('href', '/api/projects/ledger/forge/pulls/20.md');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('names the pull request without a link when the forge gives no page for it', async () => {
    const snapshot = withAudit(LEDGER, AUDIT.ledgerRewrite, (audit) => ({ ...audit, pullRequestUrl: null }));
    await openAudit(AUDIT.ledgerRewrite, { snapshot }, LEDGER);
    expect(within(article()).getByText('PR #20')).toBeInTheDocument();
    expect(within(article()).queryByRole('link', { name: 'PR #20' })).not.toBeInTheDocument();
  });

  it('says that a change pushed directly has no pull request and no branch', async () => {
    await openAudit(AUDIT.doubleSubmit);
    expect(within(article()).getByText('No pull request')).toBeInTheDocument();
    expect(within(article()).getByText('No branch reported')).toBeInTheDocument();
    expect(within(article()).getByText('sokafor')).toBeInTheDocument();
  });

  it('links the release the change belongs to', async () => {
    await openAudit(AUDIT.promoBanner);
    expect(within(article()).getByRole('link', { name: 'Release 1.8.3' })).toHaveAttribute('href', '/projects/storefront/releases/1.8.3');
  });

  it('links a release whose identifier holds a dash', async () => {
    await openAudit(AUDIT.lockfile);
    expect(within(article()).getByRole('link', { name: 'Release pr-72' })).toHaveAttribute('href', '/projects/storefront/releases/pr-72');
  });

  it('says that a change is not in a release yet', async () => {
    await openAudit(AUDIT.promoBanner, { snapshot: withAudit(STOREFRONT, AUDIT.promoBanner, (audit) => ({ ...audit, releaseId: null })) });
    expect(within(article()).getByText('Not in a release yet')).toBeInTheDocument();
    expect(within(article()).queryByRole('link', { name: /^Release/ })).not.toBeInTheDocument();
  });

  it('names a release the snapshot does not hold without a dead link', async () => {
    const snapshot = withProject(STOREFRONT, (project) => ({ ...project, releases: project.releases.filter((release) => release.id !== '1.8.3') }));
    await openAudit(AUDIT.promoBanner, { snapshot });
    expect(within(article()).getByText('Release 1.8.3')).toBeInTheDocument();
    expect(within(article()).queryByRole('link', { name: 'Release 1.8.3' })).not.toBeInTheDocument();
  });

  it('comes back to the list from the detail', async () => {
    await openAudit(AUDIT.promoBanner);
    expect(within(article()).getByRole('link', { name: 'All audits' })).toHaveAttribute('href', '/projects/storefront/audits');
  });
});

describe('AuditsView notices', () => {
  it.each([
    [AUDIT.doubleSubmit, 'Direct push', 'The commit reached the base branch without a pull request.'],
    [AUDIT.lockfile, 'Bot author', 'The change was authored by a bot.'],
    [AUDIT.footerLinks, 'Branch outside the factory', 'The pull request comes from a branch that does not start with “factory/”.'],
    [AUDIT.promoBanner, 'Factory label missing', 'The pull request comes from a factory branch but does not carry the “factory” label.'],
    [AUDIT.httpClient, 'Requested by the operator', 'The operator asked for this audit.'],
  ])('explains why the audit %s was made (%s)', async (auditId, reason, explanation) => {
    await openAudit(auditId);
    expect(within(screen.getByRole('region', { name: reason })).getByText(explanation)).toBeInTheDocument();
  });

  it('names the prefix and the label the project uses in its own words', async () => {
    const snapshot = withProject(STOREFRONT, (project) => ({
      ...project,
      settings: { ...project.settings, branchPrefix: 'bots/', labels: { ...project.settings.labels, factory: 'agent-made' } },
    }));
    await openAudit(AUDIT.footerLinks, { snapshot });
    expect(screen.getByText('The pull request comes from a branch that does not start with “bots/”.')).toBeInTheDocument();
  });

  it('shows the failure of the audit run as a callout', async () => {
    await openAudit(AUDIT.doubleSubmit);
    const failure = screen.getByRole('region', { name: '1 audit attempt failed' });
    expect(within(failure).getByText('The auditor run ended with outcome timeout after 25 minutes.')).toBeInTheDocument();
  });

  it('counts several failures in the plural and says when no reason was recorded', async () => {
    const snapshot = withAudit(STOREFRONT, AUDIT.doubleSubmit, (audit) => ({ ...audit, failureCount: 3, lastFailure: null }));
    await openAudit(AUDIT.doubleSubmit, { snapshot });
    const failure = screen.getByRole('region', { name: '3 audit attempts failed' });
    expect(within(failure).getByText('No reason was recorded.')).toBeInTheDocument();
  });

  it('shows no failure callout for an audit that never failed', async () => {
    await openAudit(AUDIT.promoBanner);
    expect(screen.queryByRole('region', { name: /audit attempts? failed/ })).not.toBeInTheDocument();
  });

  it.each([
    [AUDIT.promoBanner, '1.8.3'],
    [AUDIT.doubleSubmit, '1.8.2'],
  ])('says that the audit %s holds back release %s and links it', async (auditId, release) => {
    await openAudit(auditId);
    const link = screen.getByRole('link', { name: new RegExp(`^Holds back release ${release.replace('.', '\\.')}`) });
    expect(link).toHaveAttribute('href', `/projects/storefront/releases/${release}`);
    expect(within(link).getByText('The release cannot be promoted while this audit is open.')).toBeInTheDocument();
  });

  it.each([
    ['a resolved audit', AUDIT.httpClient],
    ['a kept change', AUDIT.footerLinks],
    ['an audit of a release that is only open', AUDIT.lockfile],
  ])('does not say that %s holds back its release', async (_name, auditId) => {
    await openAudit(auditId);
    expect(screen.queryByRole('link', { name: /^Holds back release/ })).not.toBeInTheDocument();
  });

  it('shows how a resolved audit was resolved', async () => {
    await openAudit(AUDIT.httpClient);
    const resolved = screen.getByRole('region', { name: 'Resolved' });
    expect(within(resolved).getByText('The timeout is now set explicitly in the checkout configuration. Issue #75 tracks the regression test.')).toBeInTheDocument();
    expect(within(article()).getAllByText('Resolved').length).toBeGreaterThan(1);
  });

  it('says that no note was recorded for a resolution without one', async () => {
    const snapshot = withAudit(STOREFRONT, AUDIT.httpClient, (audit) => ({ ...audit, resolutionNote: null }));
    await openAudit(AUDIT.httpClient, { snapshot });
    expect(within(screen.getByRole('region', { name: 'Resolved' })).getByText('No note was recorded.')).toBeInTheDocument();
  });

  it('shows no resolution for an audit nobody resolved', async () => {
    await openAudit(AUDIT.promoBanner);
    expect(screen.queryByRole('region', { name: 'Resolved' })).not.toBeInTheDocument();
  });
});

describe('AuditsView conclusion', () => {
  it('sums up what the auditor concluded', async () => {
    await openAudit(AUDIT.promoBanner);
    expect(within(conclusion()).getByText(/^The banner now promises "20% off everything"/)).toBeInTheDocument();
  });

  it('groups the findings as intent, idea and method, each with its statement and its evidence', async () => {
    await openAudit(AUDIT.promoBanner);
    expect(within(conclusion()).getAllByText(/^(Intent|Idea|Method)$/).map((level) => level.textContent)).toEqual(['Intent', 'Idea', 'Method']);
    expect(within(conclusion()).getByText(/^The banner promises a discount that the pricing rules do not grant/)).toBeInTheDocument();
    expect(within(conclusion()).getByText('web/src/cart/PromoBanner.tsx:12 holds the sentence as a literal.')).toBeInTheDocument();
    expect(within(conclusion()).getAllByText('Evidence')).toHaveLength(3);
  });

  it('leaves out a level that has no finding', async () => {
    const snapshot = withAudit(STOREFRONT, AUDIT.promoBanner, (audit) => ({
      ...audit,
      conclusion: audit.conclusion === null ? null : { ...audit.conclusion, findings: audit.conclusion.findings.filter((finding) => finding.level !== 'idea') },
    }));
    await openAudit(AUDIT.promoBanner, { snapshot });
    expect(within(conclusion()).queryByText('Idea')).not.toBeInTheDocument();
    expect(within(conclusion()).getByText('Intent')).toBeInTheDocument();
    expect(within(conclusion()).getByText('Method')).toBeInTheDocument();
  });

  it('links the auditor run', async () => {
    await openAudit(AUDIT.promoBanner);
    expect(within(conclusion()).getByRole('link', { name: 'Open the auditor run run_7a35c9' })).toHaveAttribute('href', '/runs/run_7a35c9');
  });

  it('shows the fix the auditor proposes', async () => {
    await openAudit(AUDIT.promoBanner);
    const fix = screen.getByRole('region', { name: 'Proposed fix' });
    expect(within(fix).getByText(/^Derive the banner copy from the active promo rules/)).toBeInTheDocument();
  });

  it('says that a change is kept as it is when the auditor found nothing, and proposes no fix', async () => {
    await openAudit(AUDIT.footerLinks);
    expect(within(conclusion()).getByText('No finding: the change is kept as it is.')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Proposed fix' })).getByText('The auditor proposes no fix.')).toBeInTheDocument();
  });

  it('says that an audit has not started', async () => {
    await openAudit(AUDIT.lockfile);
    expect(within(conclusion()).getByText('The audit has not started')).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Proposed fix' })).not.toBeInTheDocument();
  });

  it('says that an audit is under way', async () => {
    await openAudit(AUDIT.doubleSubmit);
    expect(within(conclusion()).getByText('The audit is under way')).toBeInTheDocument();
  });

  it('says that no conclusion is recorded for a verdict that carries none', async () => {
    const snapshot = withAudit(STOREFRONT, AUDIT.promoBanner, (audit) => ({ ...audit, conclusion: null }));
    await openAudit(AUDIT.promoBanner, { snapshot });
    expect(within(conclusion()).getByText('No conclusion recorded')).toBeInTheDocument();
    expect(within(conclusion()).queryByRole('link')).not.toBeInTheDocument();
  });
});

describe('AuditsView changed files', () => {
  it('lists the files the change touched and counts them', async () => {
    await openAudit(AUDIT.promoBanner);
    const list = within(files()).getByRole('list', { name: 'Files changed by the commit' });
    expect(within(list).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['web/src/cart/PromoBanner.tsx', 'web/src/cart/promo-banner.test.tsx']);
    expect(within(files()).getByText('2 files')).toBeInTheDocument();
  });

  it('says which issue type the files point to', async () => {
    await openAudit(AUDIT.footerLinks);
    expect(within(files()).getByText('Suggested issue type: Documentation')).toBeInTheDocument();
  });

  it('says that no issue type is suggested when the files point to none', async () => {
    await openAudit(AUDIT.promoBanner);
    expect(within(files()).getByText('No issue type matches these files.')).toBeInTheDocument();
  });

  it('says that the files are not read yet, and why that matters, rather than saying there are none', async () => {
    await openAudit(AUDIT.lockfile);
    expect(within(files()).getByText('Files not read yet')).toBeInTheDocument();
    expect(within(files()).getByText('The factory has not read the files of this change from the forge yet. Until it has, no issue type can be suggested.')).toBeInTheDocument();
    expect(within(files()).queryByText('This change touches no file')).not.toBeInTheDocument();
    expect(within(files()).queryByRole('list')).not.toBeInTheDocument();
    expect(within(files()).queryByText(/0 files/)).not.toBeInTheDocument();
  });

  it('says that a change touches no file when the forge was read and lists none', async () => {
    const snapshot = withAudit(STOREFRONT, AUDIT.lockfile, (audit) => ({ ...audit, changedFiles: [] }));
    await openAudit(AUDIT.lockfile, { snapshot });
    expect(within(files()).getByText('This change touches no file')).toBeInTheDocument();
    expect(within(files()).queryByText('Files not read yet')).not.toBeInTheDocument();
    expect(within(files()).queryByRole('list')).not.toBeInTheDocument();
  });

  it('counts one file in the singular', async () => {
    const snapshot = withAudit(STOREFRONT, AUDIT.promoBanner, (audit) => ({ ...audit, changedFiles: ['web/src/cart/PromoBanner.tsx'] }));
    await openAudit(AUDIT.promoBanner, { snapshot });
    expect(within(files()).getByText('1 file')).toBeInTheDocument();
  });
});

describe('AuditsView issue draft', () => {
  it('shows the issue the auditor drafted, ready to publish', async () => {
    await openAudit(AUDIT.promoBanner);
    expect(within(draft()).getByText('Derive the promo banner copy from the promo rules')).toBeInTheDocument();
    expect(within(draft()).getByText(/## Acceptance criteria/)).toBeInTheDocument();
    expect(within(draft()).getByText('Draft ready to publish on the repository.')).toBeInTheDocument();
    expect(within(draft()).queryByRole('link')).not.toBeInTheDocument();
  });

  it('links the issue a draft was published as, in the same project', async () => {
    await openAudit(AUDIT.httpClient);
    expect(within(draft()).getByRole('link', { name: 'Published as issue #75' })).toHaveAttribute('href', '/projects/storefront/issues/75');
    expect(within(draft()).queryByText('Draft ready to publish on the repository.')).not.toBeInTheDocument();
  });

  it('says that no issue was drafted', async () => {
    await openAudit(AUDIT.footerLinks);
    expect(within(draft()).getByText('No issue drafted')).toBeInTheDocument();
    expect(within(draft()).getByText('The auditor drafts an issue when the change needs a follow-up.')).toBeInTheDocument();
  });

  it('links an issue published from an audit whose draft is gone', async () => {
    const snapshot = withAudit(STOREFRONT, AUDIT.httpClient, (audit) => ({ ...audit, draft: null }));
    await openAudit(AUDIT.httpClient, { snapshot });
    expect(within(draft()).getByRole('link', { name: 'Published as issue #75' })).toBeInTheDocument();
    expect(within(draft()).queryByText('No issue drafted')).not.toBeInTheDocument();
  });

  it('links the issue to the issue of the same number in its own project', async () => {
    const snapshot = withAudit(LEDGER, AUDIT.ledgerRewrite, (audit) => ({ ...audit, publishedIssueNumber: 19 }));
    await openAudit(AUDIT.ledgerRewrite, { snapshot }, LEDGER);
    expect(within(draft()).getByRole('link', { name: 'Published as issue #19' })).toHaveAttribute('href', '/projects/ledger/issues/19');
  });
});

describe('AuditsView detail in French', () => {
  it('words the header, the notices and the sections in French', async () => {
    await openAudit(AUDIT.promoBanner, { locale: 'fr' });
    expect(within(article()).getByRole('img', { name: 'À challenger' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Label de l’usine manquant' })).toBeInTheDocument();
    expect(screen.getByText('La pull request vient d’une branche de l’usine mais ne porte pas le label « factory ».')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Bloque la release 1\.8\.3/ })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Conclusion de l’auditeur' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Correction proposée' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Issue d’audit' })).toBeInTheDocument();
    expect(screen.getByText('Intention')).toBeInTheDocument();
    expect(screen.getByText('Idée')).toBeInTheDocument();
    expect(screen.getByText('Méthode')).toBeInTheDocument();
    expect(screen.getByText('2 fichiers')).toBeInTheDocument();
  });

  it('says in French that the files are not read yet', async () => {
    await openAudit(AUDIT.lockfile, { locale: 'fr' });
    expect(screen.getByText('Fichiers pas encore relevés')).toBeInTheDocument();
  });

  it('counts failed attempts in the singular for one and the plural for several', async () => {
    await openAudit(AUDIT.doubleSubmit, { locale: 'fr' });
    expect(screen.getByRole('region', { name: '1 tentative d’audit en échec' })).toBeInTheDocument();
  });

  it('counts several failed attempts in the plural', async () => {
    const snapshot = withAudit(STOREFRONT, AUDIT.doubleSubmit, (audit) => ({ ...audit, failureCount: 2 }));
    await openAudit(AUDIT.doubleSubmit, { locale: 'fr', snapshot });
    expect(screen.getByRole('region', { name: '2 tentatives d’audit en échec' })).toBeInTheDocument();
  });
});
