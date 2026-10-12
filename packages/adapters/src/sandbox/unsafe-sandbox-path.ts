export class UnsafeSandboxPathError extends Error {
  constructor(path: string) {
    super(`${JSON.stringify(path)} cannot be written into a sandbox profile`);
    this.name = 'UnsafeSandboxPathError';
  }
}

const UNSAFE_CHARACTERS = /["\n\r\\\u0000]/;

export function isSafeSandboxPath(path: string): boolean {
  return !UNSAFE_CHARACTERS.test(path);
}

export function assertSafeSandboxPath(path: string): string {
  if (!isSafeSandboxPath(path)) throw new UnsafeSandboxPathError(path);
  return path;
}
