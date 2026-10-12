import type { StoryChecks, StoryFile } from './story-types.ts';

const FIRST_CRITERION = 1;
const NODE_COMMAND = 'node';
const NODE_TEST_FLAG = '--test';
const PARAGRAPH_SEPARATOR = '\n\n';
const LINE_SEPARATOR = '\n';
const NO_EVIDENCE: readonly string[] = [];

export function paragraphs(...texts: readonly string[]): string {
  return texts.join(PARAGRAPH_SEPARATOR);
}

export function lines(...texts: readonly string[]): string {
  return texts.join(LINE_SEPARATOR);
}

export interface NodeTestChecksDraft {
  readonly says: readonly string[];
  readonly files: readonly StoryFile[];
  /** What each check proves, in the order of the acceptance criteria. */
  readonly descriptions: readonly string[];
  /** The files the checks write for the pull request to show; none when they only assert. */
  readonly evidence?: readonly string[];
  readonly final: string;
}

/** Checks run by Node's test runner, one per acceptance criterion, all proved by the same check files. */
export function nodeTestChecks(draft: NodeTestChecksDraft): StoryChecks {
  const paths = draft.files.map((file) => file.path);
  return {
    says: draft.says,
    files: draft.files,
    checks: draft.descriptions.map((description, index) => ({ criterion: FIRST_CRITERION + index, paths, description })),
    command: [NODE_COMMAND, NODE_TEST_FLAG, ...paths],
    evidence: draft.evidence ?? NO_EVIDENCE,
    final: draft.final,
  };
}
