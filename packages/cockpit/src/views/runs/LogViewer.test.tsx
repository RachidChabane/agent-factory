import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { RunLogLineSchema } from '../../contract/index.ts';
import systemLines from '../../data/__fixtures__/run-log-system-lines.json' with { type: 'json' };
import { RunLogEntries } from '../../data/run-log-entries.ts';
import type { RunLogView } from '../../data/run-log-store.ts';
import { LogViewer } from './LogViewer.tsx';

const entries = new RunLogEntries();
z.array(RunLogLineSchema).parse(systemLines).forEach((line) => entries.append(line));

const log: RunLogView = { status: 'ready', version: 1, entries: entries.entries, lineCount: entries.entries.length, error: null };

describe('LogViewer system lines', () => {
  it('shows typed rows and hides the noise by default', () => {
    render(<LogViewer log={log} live={false} />);
    const viewport = screen.getByRole('log', { name: 'Journal du run' });
    expect(within(viewport).getByText('PreToolUse:Edit')).toBeInTheDocument();
    expect(within(viewport).getByText('Hook SessionStart:startup')).toBeInTheDocument();
    expect(within(viewport).getByText('Tâche démarrée')).toBeInTheDocument();
    expect(within(viewport).getByText('Tâche en échec')).toBeInTheDocument();
    expect(within(viewport).queryByText('système · status')).not.toBeInTheDocument();
    expect(within(viewport).queryByText(/"subtype"/)).not.toBeInTheDocument();
  });

  it('lists the noise under its own filter', async () => {
    const user = userEvent.setup();
    render(<LogViewer log={log} live={false} />);
    await user.click(screen.getByRole('radio', { name: /Bruit/ }));
    const viewport = screen.getByRole('log', { name: 'Journal du run' });
    expect(within(viewport).getByText('système · status')).toBeInTheDocument();
    expect(within(viewport).getByText('flux de jetons')).toBeInTheDocument();
  });

  it('shows the raw json of a typed row only when the raw toggle is on', async () => {
    const user = userEvent.setup();
    render(<LogViewer log={log} live={false} />);
    expect(screen.queryByText(/"subtype":"task_started"/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Brut' }));
    expect(screen.getByText(/"subtype":"task_started"/)).toBeInTheDocument();
  });
});
