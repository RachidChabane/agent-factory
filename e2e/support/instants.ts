/** Whether an instant read from the factory is strictly later than another; an instant that was never read is earlier than any. */
export function isLater(candidate: string | null, reference: string | null): boolean {
  if (candidate === null) return false;
  return reference === null || Date.parse(candidate) > Date.parse(reference);
}
