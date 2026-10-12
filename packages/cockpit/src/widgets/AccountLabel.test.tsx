import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWidget, TEST_NOW } from '../test/harness.tsx';
import { emptySnapshot } from '../test/minimal-snapshot.ts';
import { AccountLabel } from './AccountLabel.tsx';

const IDENTITY = { email: 'alex.morgan@example.com', organization: 'example-org', plan: 'Max' };

function snapshotWith(identity: (typeof IDENTITY) | null) {
  const snapshot = emptySnapshot(TEST_NOW);
  return {
    ...snapshot,
    usage: { ...snapshot.usage, accounts: [{ name: 'personal', billing: 'subscription' as const, identity, limits: [], source: null, readAt: null, lastFailure: null }] },
  };
}

describe('AccountLabel', () => {
  it('follows the name of the account with the email, the organization and the plan of its login', async () => {
    await renderWidget(<AccountLabel name="personal" identity={IDENTITY} />);
    expect(screen.getByText('personal')).toBeInTheDocument();
    expect(document.body).toHaveTextContent('personal — alex.morgan@example.com · example-org · Max plan');
  });

  it('leaves out what the report did not name, without any placeholder', async () => {
    await renderWidget(<AccountLabel name="personal" identity={{ email: 'alex.morgan@example.com', organization: null, plan: 'Max' }} />);
    expect(document.body).toHaveTextContent('personal — alex.morgan@example.com · Max plan');
    expect(document.body).not.toHaveTextContent('—  ');
  });

  it('says that the login is unknown when no usage report named the account', async () => {
    await renderWidget(<AccountLabel name="shared" identity={null} />);
    expect(document.body).toHaveTextContent('shared — login unknown');
  });

  it('says that the login is unknown when the report named none of its parts', async () => {
    await renderWidget(<AccountLabel name="shared" identity={{ email: null, organization: null, plan: null }} />);
    expect(document.body).toHaveTextContent('shared — login unknown');
  });

  it('finds the login of an account named only by its name among the usage readings', async () => {
    await renderWidget(<AccountLabel name="personal" />, { snapshot: snapshotWith(IDENTITY) });
    expect(document.body).toHaveTextContent('personal — alex.morgan@example.com · example-org · Max plan');
  });

  it('shows an account no reading holds by its name alone rather than claiming its login is unknown', async () => {
    await renderWidget(<AccountLabel name="retired" />, { snapshot: snapshotWith(IDENTITY) });
    expect(screen.getByText('retired')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('login unknown');
  });

  it('is written in French', async () => {
    await renderWidget(
      <>
        <AccountLabel name="personal" identity={IDENTITY} />
        <AccountLabel name="shared" identity={null} />
      </>,
      { locale: 'fr' },
    );
    expect(document.body).toHaveTextContent('personal — alex.morgan@example.com · example-org · forfait Max');
    expect(document.body).toHaveTextContent('shared — connexion inconnue');
  });
});
