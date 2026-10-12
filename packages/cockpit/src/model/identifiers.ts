const SHORT_SHA_LENGTH = 7;
const FULL_SHA = /^[0-9a-f]{40}$/;

export function shortSha(sha: string): string {
  return FULL_SHA.test(sha) ? sha.slice(0, SHORT_SHA_LENGTH) : sha;
}
