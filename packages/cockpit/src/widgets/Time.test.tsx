import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { HOUR_MS, MINUTE_MS } from '../i18n/formatters.ts';
import { renderWidget, TEST_NOW } from '../test/harness.tsx';
import { Time } from './Time.tsx';

const offset = (milliseconds: number) => new Date(TEST_NOW + milliseconds).toISOString();

describe('Time', () => {
  it('writes an instant as an age with the exact time one hover away', async () => {
    await renderWidget(<Time iso={offset(-3 * MINUTE_MS)} />);
    const element = screen.getByText(/^3 min/);
    expect(element.tagName).toBe('TIME');
    expect(element).toHaveAttribute('datetime', offset(-3 * MINUTE_MS));
    expect(element).toHaveAttribute('title', 'October 12, 2026 at 9:57:00 AM UTC');
  });

  it('writes an instant that is about to come', async () => {
    await renderWidget(<Time iso={offset(2 * HOUR_MS)} mode="until" />);
    expect(screen.getByText(/^in 2 hr/)).toBeInTheDocument();
  });

  it('writes the date and time, the date or the time alone', async () => {
    await renderWidget(
      <>
        <Time iso="2026-10-09T08:15:30.000Z" mode="dateTime" />
        <Time iso="2026-10-09T08:15:30.000Z" mode="date" />
        <Time iso="2026-10-09T08:15:30.000Z" mode="time" />
      </>,
    );
    expect(screen.getByText('Oct 9, 2026, 8:15 AM')).toBeInTheDocument();
    expect(screen.getByText('Oct 9, 2026')).toBeInTheDocument();
    expect(screen.getByText('08:15:30 AM')).toBeInTheDocument();
  });

  it('follows the language', async () => {
    await renderWidget(<Time iso={offset(-3 * MINUTE_MS)} />, { locale: 'fr' });
    expect(screen.getByText(/^il y a 3 min/)).toBeInTheDocument();
  });
});
