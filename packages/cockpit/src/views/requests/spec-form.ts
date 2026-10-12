import type { ProposedSpec, SpecDraft } from '../../contract/index.ts';

const LINE_BREAK = /\r?\n/;
const LINE_SEPARATOR = '\n';

export interface SpecForm {
  readonly title: string;
  readonly type: string;
  readonly need: string;
  readonly criteria: string;
  readonly outOfScope: string;
  readonly expectedProof: string;
}

/** The lines of a text, trimmed, without the empty ones. */
export function splitLines(text: string): string[] {
  return text
    .split(LINE_BREAK)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function specFormOf(spec: ProposedSpec): SpecForm {
  return {
    title: spec.title,
    type: spec.type,
    need: spec.need,
    criteria: spec.acceptanceCriteria.join(LINE_SEPARATOR),
    outOfScope: spec.outOfScope.join(LINE_SEPARATOR),
    expectedProof: spec.expectedProof,
  };
}

export interface SpecFormGaps {
  readonly title: boolean;
  readonly need: boolean;
  readonly criteria: boolean;
  readonly expectedProof: boolean;
}

export function specFormGaps(form: SpecForm): SpecFormGaps {
  return {
    title: form.title.trim().length === 0,
    need: form.need.trim().length === 0,
    criteria: splitLines(form.criteria).length === 0,
    expectedProof: form.expectedProof.trim().length === 0,
  };
}

/** The spec the factory takes, or null while a required part is empty. */
export function specDraftOf(form: SpecForm): SpecDraft | null {
  const gaps = specFormGaps(form);
  if (gaps.title || gaps.need || gaps.criteria || gaps.expectedProof) return null;
  return {
    title: form.title.trim(),
    type: form.type,
    need: form.need.trim(),
    acceptanceCriteria: splitLines(form.criteria),
    outOfScope: splitLines(form.outOfScope),
    expectedProof: form.expectedProof.trim(),
  };
}
