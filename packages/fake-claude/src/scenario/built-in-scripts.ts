import type { FakeRole, Script } from './scenario.ts';

const JSON_FENCE = '```';
const PARAGRAPH_BREAK = '\n\n';
const JSON_INDENT = 2;

const REVIEW_REPORT = { findings: [] };

const AUDIT_REPORT = {
  verdict: 'keep',
  summary: 'The change is sound and needs no action.',
  findings: [],
  proposedFix: null,
};

const CHALLENGE_REPORT = {
  summary: 'The request is clear and can be built as asked.',
  items: [
    {
      title: 'Requested change',
      verdict: 'keep',
      currentState: 'The product does not do this yet.',
      intent: 'The requester needs the change as described.',
      idea: 'The requested change answers that need.',
      method: 'The change fits the rules of the repository.',
      reason: 'Nothing in the request needs adjusting.',
      question: null,
      sources: [],
    },
  ],
  specs: [],
  reply: 'The request is accepted as written.',
};

function answerWithJson(prose: string, report: object): string {
  return [prose, `${JSON_FENCE}json\n${JSON.stringify(report, null, JSON_INDENT)}\n${JSON_FENCE}`].join(PARAGRAPH_BREAK);
}

function scriptSaying(finalText: string): Script {
  return { attempts: [{ steps: [], final: finalText }] };
}

const BUILT_IN_SCRIPTS: Readonly<Record<FakeRole, Script>> = {
  'acceptance-author': scriptSaying('No acceptance check was written.'),
  implementer: scriptSaying('No file was changed.'),
  reviewer: scriptSaying(answerWithJson('The change is sound.', REVIEW_REPORT)),
  auditor: scriptSaying(answerWithJson('The change is sound.', AUDIT_REPORT)),
  challenger: scriptSaying(answerWithJson('The request is accepted as written.', CHALLENGE_REPORT)),
};

const UNRECOGNISED_PROMPT_SCRIPT: Script = scriptSaying('Nothing to do.');

export function builtInScript(role: FakeRole | null): Script {
  return role === null ? UNRECOGNISED_PROMPT_SCRIPT : BUILT_IN_SCRIPTS[role];
}
