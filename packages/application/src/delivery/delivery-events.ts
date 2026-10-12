import { z } from 'zod';
import { DEPLOYMENT_ENVIRONMENTS } from '@agent-factory/domain';

export const DEPLOYMENT_SUBJECT_PREFIX = 'deployment/';
export const REDEPLOY_DISPATCHED_EVENT = 'deployment.redeploy-dispatched';

export function deploymentSubject(environment: string): string {
  return `${DEPLOYMENT_SUBJECT_PREFIX}${environment}`;
}

export const RedeployDispatchedPayloadSchema = z.object({
  environment: z.enum(DEPLOYMENT_ENVIRONMENTS),
  targetName: z.string().min(1),
  workflow: z.string().min(1),
  ref: z.string().min(1),
  sha: z.string().min(1),
  version: z.string().min(1),
  operator: z.string().min(1),
  simulated: z.boolean(),
  url: z.string(),
});
export type RedeployDispatchedPayload = z.infer<typeof RedeployDispatchedPayloadSchema>;
