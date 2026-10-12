import { describe, expect, it } from 'vitest';
import { commandSection, describeOutcome, stripAnsi } from './shell-commands.ts';

const ESC = String.fromCharCode(27);

const lint = describeOutcome('pnpm lint', { kind: 'completed', exitCode: 0, output: 'lint ok', durationMs: 120 });
const pytest = describeOutcome('pytest tests/test_x.py --junitxml=report.xml', {
  kind: 'completed',
  exitCode: 1,
  output: ['[ 50%] tests/test_x.py F', '[100%] done'].join('\n'),
  durationMs: 900,
});
const broken = describeOutcome('missing-tool', { kind: 'not-runnable', reason: 'the shell could not run it (exit code 127)', output: 'sh: missing-tool: not found' });
const playwright = describeOutcome("PLAYWRIGHT_JSON_OUTPUT_FILE='/w/.factory/reports/playwright.json' npx playwright test e2e/x.spec.ts --reporter=json", {
  kind: 'completed',
  exitCode: 0,
  output: '1 passed',
  durationMs: 4000,
});
const gateLog = [lint, pytest, broken, playwright].join('\n');

describe('stripAnsi', () => {
  it('removes colour and style sequences and keeps the text', () => {
    expect(stripAnsi(`${ESC}[2m RUN ${ESC}[22m ${ESC}[32m✓${ESC}[39m ok`)).toBe(' RUN  ✓ ok');
  });

  it('leaves plain text untouched', () => {
    expect(stripAnsi('[100%] 3 passed')).toBe('[100%] 3 passed');
  });
});

describe('commandSection', () => {
  it('returns the block of a command through its exit status line', () => {
    expect(commandSection(gateLog, 'pnpm lint')).toBe(lint);
  });

  it('matches a command line that carries reporter arguments and ignores bracketed output lines', () => {
    expect(commandSection(gateLog, 'pytest tests/test_x.py')).toBe(pytest);
  });

  it('returns the block of a command that was not runnable', () => {
    expect(commandSection(gateLog, 'missing-tool')).toBe(broken);
  });

  it('matches a command line that environment assignments precede', () => {
    expect(commandSection(gateLog, 'npx playwright test e2e/x.spec.ts')).toBe(playwright);
  });

  it('returns null when the command has no block', () => {
    expect(commandSection(gateLog, 'pnpm test')).toBeNull();
  });

  it('does not match a command that only shares a prefix', () => {
    expect(commandSection(gateLog, 'pnpm li')).toBeNull();
  });
});
