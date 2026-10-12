import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  KNOWN_SECRET_RULE_ID,
  SECRET_ASSIGNMENT_RULE_ID,
  describeSecretFindings,
  knownSecretForms,
  scanForSecrets,
  shannonEntropy,
  textDocument,
} from './secret-scan.ts';

const GITHUB_PREFIX = ['gh', 'p_'].join('');
const FAKE_GITHUB_TOKEN = `${GITHUB_PREFIX}${'A1b2C3d4E5'.repeat(4)}`;
const FAKE_FINE_GRAINED = `${['github', 'pat'].join('_')}_${'11ABCDEFG0'.repeat(3)}`;
const FAKE_GOOGLE_TOKEN = `${['ya29', ''].join('.')}${'a0Zk-_Q'.repeat(5)}`;
const FAKE_AWS_KEY = `${['AK', 'IA'].join('')}${'ABCDEFGH12345678'}`;
const FAKE_SLACK_TOKEN = `${['xo', 'xb'].join('')}-123456789012-abcdefABCDEF`;
const FAKE_JWT = ['eyJhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIn0', 'dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U'].join('.');
const PRIVATE_KEY_HEADER = ['-----BEGIN OPENSSH', 'PRIVATE KEY-----'].join(' ');
const OPERATOR_VALUE = 'operator-only-value-7f3a9c2e';
const FAKE_PASSWORD = ['q8Zr2LmX0v', 'Tn5Ks9WbYe3Hc'].join('');

function scanText(text: string, known: readonly { source: string; value: string }[] = []): readonly string[] {
  return scanForSecrets([textDocument('file.txt', text)], known).map((finding) => finding.rule);
}

describe('scanForSecrets', () => {
  it.each([
    ['github-token', `const token = "${FAKE_GITHUB_TOKEN}";`],
    ['github-fine-grained-token', `token: ${FAKE_FINE_GRAINED}`],
    ['google-oauth-token', `Authorization: Bearer ${FAKE_GOOGLE_TOKEN}`],
    ['aws-access-key-id', `aws_access_key_id=${FAKE_AWS_KEY}`],
    ['slack-token', `SLACK=${FAKE_SLACK_TOKEN}`],
    ['json-web-token', `cookie=${FAKE_JWT}`],
    ['private-key', PRIVATE_KEY_HEADER],
  ])('finds a %s', (rule, line) => {
    expect(scanText(line)).toContain(rule);
  });

  it('finds a high-entropy value assigned to a credential name', () => {
    expect(scanText(`DATABASE_PASSWORD = "${FAKE_PASSWORD}"`)).toContain(SECRET_ASSIGNMENT_RULE_ID);
  });

  it('ignores credential names assigned from code or placeholders', () => {
    expect(scanText('const token = process.env.GITHUB_TOKEN_VALUE;')).toEqual([]);
    expect(scanText('password: "<replace-with-your-password>"')).toEqual([]);
    expect(scanText('api_key = "xxxxxxxxxxxxxxxxxxxxxxxxxx"')).toEqual([]);
  });

  it('finds an operator value verbatim, URL-encoded or base64-encoded at any alignment', () => {
    const known = [{ source: 'environment variable DESIGN_TOOL_TOKEN', value: OPERATOR_VALUE }];
    expect(scanText(`x=${OPERATOR_VALUE}`, known)).toEqual([KNOWN_SECRET_RULE_ID]);
    for (const prefix of ['', 'a', 'ab', 'abc']) {
      const encoded = btoa(`${prefix}${OPERATOR_VALUE}|tail`);
      expect(scanText(`blob ${encoded}`, known)).toContain(KNOWN_SECRET_RULE_ID);
    }
  });

  it('never repeats a secret in the finding', () => {
    const findings = scanForSecrets(
      [textDocument('pull request body', `token ${FAKE_GITHUB_TOKEN} and ${OPERATOR_VALUE}`)],
      [{ source: 'keychain item figma-pat', value: OPERATOR_VALUE }],
    );
    const report = describeSecretFindings(findings);
    expect(report).toContain('pull request body:1');
    expect(report).toContain('keychain item figma-pat');
    expect(report).not.toContain(FAKE_GITHUB_TOKEN);
    expect(report).not.toContain(OPERATOR_VALUE);
  });

  it('ignores known values too short to be distinctive', () => {
    expect(scanText('id=1234', [{ source: 'environment variable PAT', value: '1234' }])).toEqual([]);
  });

  it('reports the line of each finding', () => {
    const findings = scanForSecrets([textDocument('a.ts', `first\nsecond ${FAKE_GITHUB_TOKEN}`)], []);
    expect(findings).toEqual([{ rule: 'github-token', origin: 'a.ts', line: 2, redacted: `${GITHUB_PREFIX}… (44 characters)` }]);
  });

  it('finds every known secret embedded in arbitrary text', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), fc.stringMatching(/^[A-Za-z0-9_-]{12,40}$/), (before, after, secret) => {
        const known = [{ source: 'environment variable GH_TOKEN', value: secret }];
        return scanText(`${before.replaceAll('\n', ' ')}${secret}${after.replaceAll('\n', ' ')}`, known).includes(KNOWN_SECRET_RULE_ID);
      }),
    );
  });
});

describe('knownSecretForms', () => {
  it('includes the value itself and its encodings', () => {
    const forms = knownSecretForms(OPERATOR_VALUE);
    expect(forms).toContain(OPERATOR_VALUE);
    expect(forms.some((form) => btoa(OPERATOR_VALUE).startsWith(form))).toBe(true);
  });
});

describe('shannonEntropy', () => {
  it('is zero for a repeated character and grows with variety', () => {
    expect(shannonEntropy('aaaa')).toBe(0);
    expect(shannonEntropy('abcd')).toBe(2);
  });
});
