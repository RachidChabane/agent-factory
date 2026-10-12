import { describe, expect, it } from 'vitest';
import { diffStat, renderDiffStat } from './diff-stat.ts';

const DIFF = [
  'diff --git a/app/pages/mockup.vue b/app/pages/mockup.vue',
  'index 1111111..2222222 100644',
  '--- a/app/pages/mockup.vue',
  '+++ b/app/pages/mockup.vue',
  '@@ -1,3 +1,4 @@',
  ' <template>',
  '-  <h1>Mockup</h1>',
  '+  <h1>Mockup</h1>',
  '+  <a href="#">Conversation</a>',
  '+++counter',
  'diff --git a/app/e2e/link.spec.ts b/app/e2e/link.spec.ts',
  'new file mode 100644',
  '--- /dev/null',
  '+++ b/app/e2e/link.spec.ts',
  '@@ -0,0 +1,2 @@',
  "+import { test } from '@playwright/test';",
  '+test.todo();',
].join('\n');

describe('diffStat', () => {
  it('counts added and removed lines per file, hunks only', () => {
    expect(diffStat(DIFF)).toEqual([
      { path: 'app/pages/mockup.vue', added: 3, removed: 1 },
      { path: 'app/e2e/link.spec.ts', added: 2, removed: 0 },
    ]);
  });

  it('renders a summary line', () => {
    expect(renderDiffStat(diffStat(DIFF))).toBe(
      'app/pages/mockup.vue | +3 -1\napp/e2e/link.spec.ts | +2 -0\n2 files changed, +5 -1',
    );
  });
});
