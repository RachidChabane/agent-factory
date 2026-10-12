import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MINUTE_MS } from '../i18n/formatters.ts';
import { renderWidget, TEST_NOW } from '../test/harness.tsx';
import { ReadStamp } from './ReadStamp.tsx';

const minutesAgo = (minutes: number) => new Date(TEST_NOW - minutes * MINUTE_MS).toISOString();

describe('ReadStamp', () => {
  it('shows how long ago a value was read, with the exact time on hover', async () => {
    await renderWidget(<ReadStamp readAt={minutesAgo(3)} kind="forge" />);
    const age = screen.getByText(/^Read 3 min/);
    expect(age.tagName).toBe('TIME');
    expect(age).toHaveAttribute('title', 'October 12, 2026 at 9:57:00 AM UTC');
    expect(age).toHaveAttribute('datetime', minutesAgo(3));
    expect(screen.queryByText('Stale')).not.toBeInTheDocument();
  });

  it('marks a value stale once it is older than the installation allows for its kind', async () => {
    await renderWidget(<ReadStamp readAt={minutesAgo(40)} kind="forge" />);
    expect(await screen.findByText('Stale')).toHaveAttribute('title', 'Read more than 15 min ago, so it may no longer be current.');
  });

  it('uses the threshold of the kind: a tool check of a few hours is not stale, a health sample of an hour is', async () => {
    await renderWidget(
      <>
        <ReadStamp readAt={minutesAgo(180)} kind="tools" verb="checked" />
        <ReadStamp readAt={minutesAgo(60)} kind="health" verb="sampled" />
      </>,
    );
    expect(await screen.findAllByText('Stale')).toHaveLength(1);
    expect(screen.getByText(/^Checked 3 hr/)).toBeInTheDocument();
    expect(screen.getByText(/^Sampled 1 hr/)).toBeInTheDocument();
  });

  it('takes an explicit staleness threshold for readings that carry their own', async () => {
    await renderWidget(<ReadStamp readAt={minutesAgo(50)} staleAfterMs={45 * MINUTE_MS} />);
    expect(await screen.findByText('Stale')).toBeInTheDocument();
  });

  it('says so when the value was never read, in the words it is given', async () => {
    await renderWidget(
      <>
        <ReadStamp readAt={null} kind="forge" />
        <ReadStamp readAt={null} kind="tools" neverLabel="Never checked" />
      </>,
    );
    expect(screen.getByText('Not read yet')).toBeInTheDocument();
    expect(screen.getByText('Never checked')).toBeInTheDocument();
  });

  it('spells out the error of a failed read next to the value it kept', async () => {
    await renderWidget(<ReadStamp readAt={minutesAgo(8)} error="rate limit exceeded" kind="forge" />);
    expect(screen.getByText(/^Read 8 min/)).toBeInTheDocument();
    expect(screen.getByText(/The last read failed \(rate limit exceeded\)\. This is the value read 8 min/)).toBeInTheDocument();
  });

  it('spells out the error of a failed read when nothing was kept', async () => {
    await renderWidget(<ReadStamp readAt={null} error="connection refused" kind="forge" />);
    expect(screen.getByText('The last read failed: connection refused')).toBeInTheDocument();
  });

  it('writes the age in French', async () => {
    await renderWidget(<ReadStamp readAt={minutesAgo(3)} kind="forge" />, { locale: 'fr' });
    expect(screen.getByText(/^Relevé il y a 3 min/)).toBeInTheDocument();
  });
});
