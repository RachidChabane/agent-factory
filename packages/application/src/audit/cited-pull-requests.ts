const PULL_REQUEST_REFERENCE = /#(\d+)\b/g;
const NUMBER_GROUP = 1;
const SUBJECT_SEPARATOR = '\n';

export function citedPullRequests(commitMessage: string): readonly number[] {
  const subject = commitMessage.trim().split(SUBJECT_SEPARATOR)[0] ?? '';
  const numbers = [...subject.matchAll(PULL_REQUEST_REFERENCE)].map((match) => Number(match[NUMBER_GROUP]));
  return [...new Set(numbers)];
}

export function renderCitedPullRequests(numbers: readonly number[]): string {
  return numbers.map((number) => `#${number}`).join(', ');
}
