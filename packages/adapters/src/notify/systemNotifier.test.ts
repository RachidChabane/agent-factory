import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fc from 'fast-check';
import type { CommandResult, CommandRunner, Notifier } from '@agent-factory/application';
import { describe, expect, it } from 'vitest';
import { CommandSpawnError } from '../process/errors.ts';
import { UnsupportedPlatformError } from '../platform/supported-platform.ts';
import { NotificationDeliveryError } from './errors.ts';
import {
  appleScriptNotification,
  escapeAppleScriptString,
  escapeNotificationMarkup,
  MAX_NOTIFICATION_BODY_CHARACTERS,
  MAX_NOTIFICATION_TITLE_CHARACTERS,
  NOTIFICATION_APPLICATION_NAME,
  NOTIFY_SEND_EXECUTABLE,
  OSASCRIPT_EXECUTABLE,
  SystemNotifier,
} from './systemNotifier.ts';
import { NOTICE_BODY, NOTICE_TITLE } from './testSupport.ts';

const run = promisify(execFile);
const ENVIRONMENT = { PATH: '/usr/bin', DBUS_SESSION_BUS_ADDRESS: 'unix:path=/run/user/1000/bus' };
const TIMEOUT_MS = 4_000;
const OSASCRIPT_TIMEOUT_MS = 15_000;
const INJECTION_MARKER = 'INJECTED';

interface RecordedRun {
  readonly command: readonly string[];
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly env: Readonly<Record<string, string>>;
}

class RecordingRunner implements CommandRunner {
  readonly runs: RecordedRun[] = [];
  private readonly outcome: Partial<CommandResult> | Error;

  constructor(outcome: Partial<CommandResult> | Error = {}) {
    this.outcome = outcome;
  }

  run(command: readonly string[], cwd: string, timeoutMs: number, env: Readonly<Record<string, string>>): Promise<CommandResult> {
    this.runs.push({ command, cwd, timeoutMs, env });
    if (this.outcome instanceof Error) return Promise.reject(this.outcome);
    return Promise.resolve({ exitCode: 0, stdout: '', stderr: '', durationMs: 5, timedOut: false, ...this.outcome });
  }
}

function notifierOn(platform: string, runner: CommandRunner): SystemNotifier {
  return new SystemNotifier({ platform, runner, environment: ENVIRONMENT, timeoutMs: TIMEOUT_MS });
}

const MEDIA = [{ label: 'checkout-flow · before · film.mp4', url: 'https://files.example.test/a/film.mp4' }];

function missingExecutable(command: readonly string[]): CommandSpawnError {
  return new CommandSpawnError(command, Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
}

function unescapeAppleScript(literal: string): string {
  const escapes: Readonly<Record<string, string>> = { n: '\n', r: '\r', t: '\t' };
  let text = '';
  for (let index = 0; index < literal.length; index += 1) {
    const character = literal[index] ?? '';
    if (character !== '\\') {
      text += character;
      continue;
    }
    index += 1;
    const escaped = literal[index] ?? '';
    text += escapes[escaped] ?? escaped;
  }
  return text;
}

function stringLiteralEnd(source: string, start: number): number {
  for (let index = start; index < source.length; index += 1) {
    if (source[index] === '\\') index += 1;
    else if (source[index] === '"') return index;
  }
  return -1;
}

interface ParsedNotification {
  readonly body: string;
  readonly title: string;
}

function parseNotification(script: string): ParsedNotification | null {
  const opening = 'display notification "';
  const middle = '" with title "';
  if (!script.startsWith(opening)) return null;
  const bodyEnd = stringLiteralEnd(script, opening.length);
  if (bodyEnd === -1 || !script.startsWith(middle, bodyEnd)) return null;
  const titleStart = bodyEnd + middle.length;
  const titleEnd = stringLiteralEnd(script, titleStart);
  if (titleEnd !== script.length - 1) return null;
  return { body: unescapeAppleScript(script.slice(opening.length, bodyEnd)), title: unescapeAppleScript(script.slice(titleStart, titleEnd)) };
}

function normalizedLineBreaks(text: string): string {
  return text.replace(/\r\n|\r|\n/g, '\n');
}

const TRICKY_TEXTS: readonly string[] = [
  'plain',
  'He said "hello"',
  'back\\slash and trailing\\',
  'quote then backslash \\"',
  `" & (do shell script "echo ${INJECTION_MARKER}") & "`,
  `\\" & (do shell script "echo ${INJECTION_MARKER}") & \\"`,
  'tab\there',
  'line one\nline two',
  'émoji 😀 and ünïcode',
  "single 'quotes' and $dollar `ticks` and <tags> & ampersands",
  '-- not a comment',
  '',
];

describe('AppleScript notification', () => {
  it('displays the body under the title', () => {
    expect(appleScriptNotification(NOTICE_TITLE, NOTICE_BODY)).toBe(`display notification "${NOTICE_BODY}" with title "${NOTICE_TITLE}"`);
  });

  it('escapes quotes and backslashes, and writes line breaks as escapes', () => {
    expect(escapeAppleScriptString('say "hi"\\now')).toBe('say \\"hi\\"\\\\now');
    expect(escapeAppleScriptString('one\r\ntwo\nthree\rfour')).toBe('one\\ntwo\\nthree\\nfour');
    expect(escapeAppleScriptString('\\"')).toBe('\\\\\\"');
  });

  it('keeps hostile text inside its two string literals', () => {
    const script = appleScriptNotification('" with title "x" & (do shell script "id") & "', '" & (do shell script "id") & "');
    expect(parseNotification(script)).toEqual({ title: '" with title "x" & (do shell script "id") & "', body: '" & (do shell script "id") & "' });
  });

  it('keeps any text inside its two string literals, and reads it back as it was written', () => {
    const characters = fc.constantFrom('a', 'Z', '0', ' ', '"', '\\', '\n', '\r', '\t', '$', '`', "'", 'é', '😀', '&', '<', '>', '-');
    const text = fc.array(characters, { maxLength: 60 }).map((chosen) => chosen.join(''));
    fc.assert(
      fc.property(text, text, (title, body) => {
        const parsed = parseNotification(appleScriptNotification(title, body));
        expect(parsed).toEqual({ title: normalizedLineBreaks(title).replaceAll('\n', ' '), body: normalizedLineBreaks(body) });
      }),
    );
  });

  it('shortens what a toast cannot show anyway, and drops control characters', () => {
    const parsed = parseNotification(appleScriptNotification('t'.repeat(MAX_NOTIFICATION_TITLE_CHARACTERS * 2), `a\u0000b\u0007${'b'.repeat(MAX_NOTIFICATION_BODY_CHARACTERS * 2)}`));
    expect(Array.from(parsed?.title ?? '')).toHaveLength(MAX_NOTIFICATION_TITLE_CHARACTERS);
    expect(Array.from(parsed?.body ?? '')).toHaveLength(MAX_NOTIFICATION_BODY_CHARACTERS);
    expect(parsed?.body.startsWith('ab')).toBe(true);
    expect(parsed?.title.endsWith('…')).toBe(true);
  });

  it.skipIf(process.platform !== 'darwin')('is read back by the real AppleScript interpreter exactly as it was written, and runs nothing', async () => {
    for (const text of TRICKY_TEXTS) {
      const { stdout } = await run(OSASCRIPT_EXECUTABLE, ['-e', `return "${escapeAppleScriptString(text)}"`], { timeout: OSASCRIPT_TIMEOUT_MS });
      expect(stdout.slice(0, -1), JSON.stringify(text)).toBe(normalizedLineBreaks(text));
    }
  }, OSASCRIPT_TIMEOUT_MS * TRICKY_TEXTS.length);
});

describe('notification markup', () => {
  it('escapes the characters a notification daemon would read as markup', () => {
    expect(escapeNotificationMarkup('<a href="x">a & b</a>')).toBe('&lt;a href="x"&gt;a &amp; b&lt;/a&gt;');
  });
});

describe('SystemNotifier on macOS', () => {
  it('shows a notice with links as it shows one without: a toast cannot be clicked, so the links stay in the other channels and the cockpit', async () => {
    const without = new RecordingRunner();
    const withLinks = new RecordingRunner();
    await notifierOn('darwin', without).notify(NOTICE_TITLE, NOTICE_BODY);
    const channel: Notifier = notifierOn('darwin', withLinks);
    await channel.notify(NOTICE_TITLE, NOTICE_BODY, 'http://127.0.0.1:7430/issues/42', MEDIA);
    expect(withLinks.runs[0]?.command).toEqual(without.runs[0]?.command);
    expect(JSON.stringify(withLinks.runs)).not.toContain('files.example.test');
  });

  it('shows the notice with osascript, without a shell', async () => {
    const runner = new RecordingRunner();
    await notifierOn('darwin', runner).notify(NOTICE_TITLE, NOTICE_BODY);
    expect(runner.runs).toEqual([
      {
        command: [OSASCRIPT_EXECUTABLE, '-e', `display notification "${NOTICE_BODY}" with title "${NOTICE_TITLE}"`],
        cwd: '/',
        timeoutMs: TIMEOUT_MS,
        env: ENVIRONMENT,
      },
    ]);
  });

  it('puts a hostile title and body in the script as text, as a single argument', async () => {
    const runner = new RecordingRunner();
    await notifierOn('darwin', runner).notify('"; do shell script "id"; "', 'say "hi" \\ bye');
    const [command] = runner.runs.map((entry) => entry.command);
    expect(command).toHaveLength(3);
    expect(parseNotification(command?.[2] ?? '')).toEqual({ title: '"; do shell script "id"; "', body: 'say "hi" \\ bye' });
  });
});

describe('SystemNotifier on Linux', () => {
  it('shows the notice with notify-send, without a shell', async () => {
    const runner = new RecordingRunner();
    await notifierOn('linux', runner).notify(NOTICE_TITLE, NOTICE_BODY);
    expect(runner.runs).toEqual([
      {
        command: [NOTIFY_SEND_EXECUTABLE, `--app-name=${NOTIFICATION_APPLICATION_NAME}`, '--', NOTICE_TITLE, NOTICE_BODY],
        cwd: '/',
        timeoutMs: TIMEOUT_MS,
        env: ENVIRONMENT,
      },
    ]);
  });

  it('keeps a title or a body that looks like an option after the end of the options', async () => {
    const runner = new RecordingRunner();
    await notifierOn('linux', runner).notify('--urgency=critical', '-t 1');
    const [command] = runner.runs.map((entry) => entry.command);
    expect(command?.slice(-3)).toEqual(['--', '--urgency=critical', '-t 1']);
  });

  it('writes markup in the body as text and the title on one line', async () => {
    const runner = new RecordingRunner();
    await notifierOn('linux', runner).notify('first\nsecond', '<b>bold</b> & <a href="https://phishing.example">link</a>');
    const [command] = runner.runs.map((entry) => entry.command);
    expect(command?.slice(-2)).toEqual(['first second', '&lt;b&gt;bold&lt;/b&gt; &amp; &lt;a href="https://phishing.example"&gt;link&lt;/a&gt;']);
  });
});

describe('SystemNotifier failures', () => {
  it.each([
    ['darwin', OSASCRIPT_EXECUTABLE],
    ['linux', NOTIFY_SEND_EXECUTABLE],
  ])('names the missing tool on %s', async (platform, executable) => {
    const delivery = notifierOn(platform, new RecordingRunner(missingExecutable([executable]))).notify(NOTICE_TITLE, NOTICE_BODY);
    await expect(delivery).rejects.toBeInstanceOf(NotificationDeliveryError);
    await expect(delivery).rejects.toThrow(`${executable} is not installed or not on the PATH`);
  });

  it('reports a tool that cannot start for another reason without the notice', async () => {
    const delivery = notifierOn('linux', new RecordingRunner(new CommandSpawnError(['notify-send'], new Error('EACCES')))).notify(NOTICE_TITLE, NOTICE_BODY);
    await expect(delivery).rejects.toThrow('notify-send could not be started');
    await expect(delivery).rejects.toMatchObject({ message: expect.not.stringContaining(NOTICE_TITLE) });
  });

  it('reports a tool that does not answer in time', async () => {
    const delivery = notifierOn('linux', new RecordingRunner({ exitCode: 143, timedOut: true })).notify(NOTICE_TITLE, NOTICE_BODY);
    await expect(delivery).rejects.toBeInstanceOf(NotificationDeliveryError);
    await expect(delivery).rejects.toThrow(`notify-send did not finish within ${TIMEOUT_MS} ms`);
  });

  it('reports the exit code of a tool that refuses the notice', async () => {
    const delivery = notifierOn('darwin', new RecordingRunner({ exitCode: 1, stderr: 'execution error' })).notify(NOTICE_TITLE, NOTICE_BODY);
    await expect(delivery).rejects.toThrow('osascript exited with code 1');
  });

  it.each(['win32', 'freebsd'])('is not available on %s', (platform) => {
    expect(() => notifierOn(platform, new RecordingRunner())).toThrow(UnsupportedPlatformError);
  });
});
