import { describe, expect, it } from 'vitest';
import { loadAudit } from './audit-projection.ts';
import { requestOnDemandAudit } from './request-audit.ts';
import { FakeGitHubGateway, InMemoryEventStore, commit } from './testing/fakes.ts';

function setup() {
  const events = new InMemoryEventStore();
  const github = new FakeGitHubGateway();
  github.history.push(commit({ sha: 'abc1234full', message: 'Merge pull request #7', pullRequestNumber: 7, pullRequestBranch: 'feature/x', pullRequestLabels: [] }));
  return { events, github };
}

describe('requestOnDemandAudit', () => {
  it('records a detected audit with the on-demand reason under the full sha', async () => {
    const dependencies = setup();
    const requested = await requestOnDemandAudit(dependencies, 'abc1234');
    expect(requested).toEqual({ auditId: 'abc1234full', alreadyRecorded: false });
    expect(await loadAudit(dependencies.events, 'abc1234full')).toMatchObject({
      state: 'detected',
      reason: 'on-demand',
      commitMessage: 'Merge pull request #7',
      authorLogin: 'alice',
      pullRequestNumber: 7,
    });
  });

  it('records nothing twice for the same commit', async () => {
    const dependencies = setup();
    await requestOnDemandAudit(dependencies, 'abc1234');
    expect(await requestOnDemandAudit(dependencies, 'abc1234full')).toEqual({ auditId: 'abc1234full', alreadyRecorded: true });
    expect(dependencies.events.typesOf('audit/')).toEqual(['audit.detected']);
  });

  it('rejects a commit the repository does not know', async () => {
    await expect(requestOnDemandAudit(setup(), 'ffffff0')).rejects.toThrow('no commit ffffff0');
  });
});
