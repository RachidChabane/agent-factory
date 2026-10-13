import { describeBytes, type OmissionReason } from '@agent-factory/domain';

/** The setting that raises the limit a file passed. */
const LIMIT_SETTINGS: Readonly<Record<OmissionReason, string>> = {
  'file-limit': 'evidence.maxFileBytes',
  'total-limit': 'evidence.maxTotalBytes',
};

const LIMIT_PHRASES: Readonly<Record<OmissionReason, (limit: string) => string>> = {
  'file-limit': (limit) => `over the limit of ${limit} per file`,
  'total-limit': (limit) => `the evidence of the pull request would pass its limit of ${limit} in total`,
};

export interface Omission {
  readonly bytes: number;
  readonly reason: OmissionReason;
  readonly limitBytes: number;
}

/** Why a file is not on the pull request: how heavy it is and the limit it passed, with the setting that raises it. */
export function describeOmission(omission: Omission): string {
  const phrase = LIMIT_PHRASES[omission.reason](describeBytes(omission.limitBytes));
  return `${describeBytes(omission.bytes)}, ${phrase} (${LIMIT_SETTINGS[omission.reason]})`;
}
