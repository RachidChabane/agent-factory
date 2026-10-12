export interface SecretRule {
  readonly id: string;
  readonly description: string;
  readonly pattern: RegExp;
}

export const SECRET_RULES: readonly SecretRule[] = [
  { id: 'private-key', description: 'private key block', pattern: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/g },
  { id: 'github-token', description: 'GitHub token', pattern: /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/g },
  { id: 'github-fine-grained-token', description: 'GitHub fine-grained token', pattern: /\bgithub_pat_[A-Za-z0-9_]{22,255}\b/g },
  { id: 'google-oauth-token', description: 'Google OAuth access token', pattern: /\bya29\.[0-9A-Za-z_-]{20,}/g },
  { id: 'google-api-key', description: 'Google API key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { id: 'aws-access-key-id', description: 'AWS access key id', pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g },
  { id: 'slack-token', description: 'Slack token', pattern: /\bxox[abposr]-[0-9A-Za-z-]{10,}/g },
  { id: 'json-web-token', description: 'JSON web token', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g },
  { id: 'anthropic-api-key', description: 'Anthropic API key', pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}/g },
  { id: 'figma-token', description: 'Figma personal access token', pattern: /\bfigd_[A-Za-z0-9_-]{20,}/g },
  { id: 'npm-token', description: 'npm token', pattern: /\bnpm_[A-Za-z0-9]{36}\b/g },
];

export const SECRET_ASSIGNMENT_RULE_ID = 'secret-assignment';
export const KNOWN_SECRET_RULE_ID = 'known-secret';

const SECRET_ASSIGNMENT =
  /([A-Za-z0-9_.-]*(?:token|secret|passw(?:or)?d|passphrase|api[_-]?key|access[_-]?key|private[_-]?key|credential)[A-Za-z0-9_.-]*)["']?\s*[:=]\s*["']?([A-Za-z0-9+/_\-.=~]{20,})/gi;
export const MINIMUM_ASSIGNED_SECRET_LENGTH = 20;
export const MINIMUM_ASSIGNED_SECRET_ENTROPY_BITS = 3.5;
export const MINIMUM_KNOWN_SECRET_LENGTH = 8;
const DIGIT = /[0-9]/;
const LETTER = /[A-Za-z]/;
const PREVIEW_CHARACTERS = 4;
const BASE64_GROUP_BYTES = 3;
const BASE64_GROUP_CHARACTERS = 4;
const BASE64_PADDING = /=+$/;
const ALIGNMENT_FILLER = '\u0000';

export interface KnownSecret {
  readonly source: string;
  readonly value: string;
}

export interface ScannedLine {
  readonly number: number;
  readonly text: string;
}

export interface ScanDocument {
  readonly origin: string;
  readonly lines: readonly ScannedLine[];
}

export interface SecretFinding {
  readonly rule: string;
  readonly origin: string;
  readonly line: number;
  readonly redacted: string;
}

export function shannonEntropy(value: string): number {
  if (value.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const character of value) counts.set(character, (counts.get(character) ?? 0) + 1);
  let entropy = 0;
  for (const count of counts.values()) {
    const probability = count / value.length;
    entropy -= probability * Math.log2(probability);
  }
  return entropy;
}

export function redact(value: string): string {
  return `${value.slice(0, PREVIEW_CHARACTERS)}… (${value.length} characters)`;
}

function looksLikeAssignedSecret(value: string): boolean {
  return (
    value.length >= MINIMUM_ASSIGNED_SECRET_LENGTH &&
    DIGIT.test(value) &&
    LETTER.test(value) &&
    shannonEntropy(value) >= MINIMUM_ASSIGNED_SECRET_ENTROPY_BITS
  );
}

function alignedBase64Cores(value: string): readonly string[] {
  const cores: string[] = [];
  for (let offset = 0; offset < BASE64_GROUP_BYTES; offset += 1) {
    let encoded: string;
    try {
      encoded = btoa(`${ALIGNMENT_FILLER.repeat(offset)}${value}`);
    } catch {
      return cores;
    }
    const start = offset === 0 ? 0 : BASE64_GROUP_CHARACTERS;
    const end = Math.floor((offset + value.length) / BASE64_GROUP_BYTES) * BASE64_GROUP_CHARACTERS;
    const core = encoded.slice(start, end).replace(BASE64_PADDING, '');
    if (core.length >= MINIMUM_KNOWN_SECRET_LENGTH) cores.push(core);
  }
  return cores;
}

export function knownSecretForms(value: string): readonly string[] {
  const forms = new Set<string>([value, encodeURIComponent(value)]);
  for (const core of alignedBase64Cores(value)) {
    forms.add(core);
    forms.add(core.replaceAll('+', '-').replaceAll('/', '_'));
  }
  return [...forms];
}

function patternFindings(document: ScanDocument, line: ScannedLine): readonly SecretFinding[] {
  const findings: SecretFinding[] = [];
  for (const rule of SECRET_RULES) {
    for (const match of line.text.matchAll(rule.pattern)) {
      findings.push({ rule: rule.id, origin: document.origin, line: line.number, redacted: redact(match[0]) });
    }
  }
  for (const match of line.text.matchAll(SECRET_ASSIGNMENT)) {
    const name = match[1] ?? '';
    const value = match[2] ?? '';
    if (looksLikeAssignedSecret(value)) {
      findings.push({ rule: SECRET_ASSIGNMENT_RULE_ID, origin: document.origin, line: line.number, redacted: `${name} = ${redact(value)}` });
    }
  }
  return findings;
}

interface KnownForm {
  readonly source: string;
  readonly form: string;
  readonly length: number;
}

function knownForms(known: readonly KnownSecret[]): readonly KnownForm[] {
  return known
    .filter((secret) => secret.value.length >= MINIMUM_KNOWN_SECRET_LENGTH)
    .flatMap((secret) => knownSecretForms(secret.value).map((form) => ({ source: secret.source, form, length: secret.value.length })));
}

function knownFindings(document: ScanDocument, line: ScannedLine, forms: readonly KnownForm[]): readonly SecretFinding[] {
  const sources = new Map<string, KnownForm>();
  for (const form of forms) {
    if (line.text.includes(form.form) && !sources.has(form.source)) sources.set(form.source, form);
  }
  return [...sources.values()].map((form) => ({
    rule: KNOWN_SECRET_RULE_ID,
    origin: document.origin,
    line: line.number,
    redacted: `the value of ${form.source} (${form.length} characters)`,
  }));
}

export function scanForSecrets(documents: readonly ScanDocument[], known: readonly KnownSecret[]): readonly SecretFinding[] {
  const forms = knownForms(known);
  return documents.flatMap((document) =>
    document.lines.flatMap((line) => [...knownFindings(document, line, forms), ...patternFindings(document, line)]),
  );
}

export function textDocument(origin: string, text: string): ScanDocument {
  return { origin, lines: text.split('\n').map((line, index) => ({ number: index + 1, text: line })) };
}

export function describeSecretFindings(findings: readonly SecretFinding[]): string {
  return findings.map((finding) => `- ${finding.origin}:${finding.line} ${finding.rule}: ${finding.redacted}`).join('\n');
}
