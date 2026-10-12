import { FAKE_ROLES, type FakeRole, type RoleSignatures } from './scenario.ts';

interface SignatureMatch {
  readonly role: FakeRole;
  readonly offset: number;
  readonly length: number;
}

export function detectRole(prompt: string, signatures: RoleSignatures): FakeRole | null {
  const matches = FAKE_ROLES.flatMap((role): readonly SignatureMatch[] => {
    const offset = prompt.indexOf(signatures[role]);
    return offset === -1 ? [] : [{ role, offset, length: signatures[role].length }];
  });
  return matches.toSorted(earliestThenLongest)[0]?.role ?? null;
}

function earliestThenLongest(left: SignatureMatch, right: SignatureMatch): number {
  return left.offset - right.offset || right.length - left.length;
}
