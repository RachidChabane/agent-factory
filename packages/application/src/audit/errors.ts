export class AuditNotFoundError extends Error {
  constructor(auditId: string) {
    super(`audit ${auditId} does not exist`);
    this.name = 'AuditNotFoundError';
  }
}

export class AuditIssueNotDraftedError extends Error {
  constructor(auditId: string) {
    super(`audit ${auditId} has no drafted issue to publish`);
    this.name = 'AuditIssueNotDraftedError';
  }
}
