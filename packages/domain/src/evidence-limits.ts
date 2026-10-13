/** What the evidence committed to one pull request may weigh. */
export interface EvidenceLimits {
  /** A file heavier than this is left out. */
  readonly maxFileBytes: number;
  /** Files are left out, the heaviest first, while the evidence of the pull request weighs more than this. */
  readonly maxTotalBytes: number;
}

export const DEFAULT_EVIDENCE_LIMITS: EvidenceLimits = { maxFileBytes: 5_000_000, maxTotalBytes: 40_000_000 };

/** Which limit a file passed: its own, or the pull request's. */
export const OMISSION_REASONS = ['file-limit', 'total-limit'] as const;
export type OmissionReason = (typeof OMISSION_REASONS)[number];

export interface WeighedFile {
  readonly path: string;
  readonly bytes: number;
}

export interface OmittedFile extends WeighedFile {
  readonly reason: OmissionReason;
  /** The limit it passed: `maxFileBytes` for a file that is too heavy, `maxTotalBytes` for one that took the total past it. */
  readonly limitBytes: number;
}

export interface EvidenceSelection {
  /** The files to commit, in the order they were given. */
  readonly kept: readonly WeighedFile[];
  /** The files to leave out, in the order they were given. */
  readonly omitted: readonly OmittedFile[];
}

function weight(files: readonly WeighedFile[]): number {
  return files.reduce((total, file) => total + file.bytes, 0);
}

/**
 * Which of the files to commit to a pull request fit its limits: a file over `maxFileBytes` is left out, then files
 * are left out largest first, the last of equal weight first, while the total exceeds `maxTotalBytes`. The total
 * counts the evidence the pull request already holds (`committedBytes`).
 */
export function selectEvidenceWithinLimits(files: readonly WeighedFile[], limits: EvidenceLimits, committedBytes = 0): EvidenceSelection {
  const reasons = new Map<number, OmittedFile['reason']>();
  const heavy = files.flatMap((file, position) => (file.bytes > limits.maxFileBytes ? [position] : []));
  for (const position of heavy) reasons.set(position, 'file-limit');
  const fitting = files.flatMap((file, position) => (reasons.has(position) ? [] : [{ file, position }]));
  let total = committedBytes + weight(fitting.map(({ file }) => file));
  const heaviestFirst = fitting.toSorted((left, right) => right.file.bytes - left.file.bytes || right.position - left.position);
  for (const { file, position } of heaviestFirst) {
    if (total <= limits.maxTotalBytes) break;
    reasons.set(position, 'total-limit');
    total -= file.bytes;
  }
  return {
    kept: files.filter((_file, position) => !reasons.has(position)),
    omitted: files.flatMap((file, position) => {
      const reason = reasons.get(position);
      return reason === undefined ? [] : [{ ...file, reason, limitBytes: reason === 'file-limit' ? limits.maxFileBytes : limits.maxTotalBytes }];
    }),
  };
}
