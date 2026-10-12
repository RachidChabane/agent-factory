import { describe, expect, it } from 'vitest';
import { createI18n } from './create-i18n.ts';

describe('typed message keys', () => {
  const { t } = createI18n('en');

  it('refuse an unknown key, a missing parameter and a parameter that is not one at compile time', () => {
    // @ts-expect-error the key is not in the catalog
    expect(t('common.doesNotExist')).toBe('common.doesNotExist');
    // @ts-expect-error the message needs its `count`
    expect(t('common.countInTotal')).toBe('{count} in total');
    // @ts-expect-error `total` is not a placeholder of the message
    expect(t('common.countInTotal', { count: 1, total: 2 })).toBe('1 in total');
  });

  it('accept a key with the parameters its placeholders name', () => {
    expect(t('common.countInTotal', { count: 1_200 })).toBe('1,200 in total');
    expect(t('common.close')).toBe('Close');
    expect(t('board.card.subagents', { count: 1 })).toBe('1 subagent');
    expect(t('board.card.subagents', { count: 3 })).toBe('3 subagents');
  });

  it('build the key of an enumeration from its value', () => {
    const state = 'needs-human' as const;
    expect(t(`vocab.issueState.${state}`)).toBe('Needs a human');
  });
});
