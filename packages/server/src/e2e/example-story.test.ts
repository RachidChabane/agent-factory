import { describe, expect, it } from 'vitest';
import { projectConventions } from '../composition/project/project-settings.ts';
import { projectOf } from '../config/agent-factory-config.ts';
import { STOREFRONT_ID } from '../demo/demo-projects.ts';
import type { StoryIssue } from '../demo/story/story-types.ts';
import { resolvedConfiguration } from '../demo/story/testing/demo-configuration.ts';
import { EXAMPLE_ISSUE, mergedFiles, renderSpecDocument } from './example-story.ts';
import { ExpectationFailed } from './expectations.ts';

const CONVENTIONS = projectConventions(projectOf(resolvedConfiguration(), STOREFRONT_ID));

function withAttempts(attempts: StoryIssue['attempts']): StoryIssue {
  return { ...EXAMPLE_ISSUE, attempts };
}

describe('the example issue', () => {
  it('renders as the spec file an operator hands to the factory', () => {
    const document = renderSpecDocument(EXAMPLE_ISSUE, CONVENTIONS);
    expect(document.startsWith(`Title: ${EXAMPLE_ISSUE.spec.title}\n`)).toBe(true);
    expect(document).toContain('type:feature');
  });

  it('is refused when the project does not know its type', () => {
    const unknownType = { ...EXAMPLE_ISSUE, spec: { ...EXAMPLE_ISSUE.spec, type: 'chore' } };
    expect(() => renderSpecDocument(unknownType, CONVENTIONS)).toThrow(ExpectationFailed);
  });

  it('adds the module and the frozen checks to the repository', () => {
    expect(mergedFiles(EXAMPLE_ISSUE).map((file) => file.path)).toEqual(['test/acceptance/category-filter.test.js', 'src/categories.js']);
  });

  it('keeps the content the agents wrote, byte for byte', () => {
    const module = mergedFiles(EXAMPLE_ISSUE).find((file) => file.path === 'src/categories.js');
    expect(module?.content).toBe(EXAMPLE_ISSUE.attempts[0]?.writes[0]?.content);
  });

  it('leaves what a later attempt wrote in place of an earlier one, and nothing it deleted', () => {
    const attempts: StoryIssue['attempts'] = [
      { says: [], writes: [{ path: 'src/a.js', content: 'first' }, { path: 'src/b.js', content: 'kept' }], deletes: [], final: '' },
      { says: [], writes: [{ path: 'src/a.js', content: 'second' }], deletes: ['src/b.js'], final: '' },
    ];
    const files = mergedFiles(withAttempts(attempts)).filter((file) => file.path.startsWith('src/'));
    expect(files).toEqual([{ path: 'src/a.js', content: 'second' }]);
  });
});
