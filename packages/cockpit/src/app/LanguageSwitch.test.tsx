import { screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { LOCALE_STORAGE_KEY } from '../i18n/locale.ts';
import { renderWidget } from '../test/harness.tsx';
import { Money } from '../widgets/Money.tsx';
import { LanguageSwitch } from './LanguageSwitch.tsx';

afterEach(() => {
  window.localStorage.clear();
  document.documentElement.lang = '';
});

describe('LanguageSwitch', () => {
  it('starts in English and names each language in itself', async () => {
    await renderWidget(<LanguageSwitch />);
    expect(screen.getByRole('radiogroup', { name: 'Language' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'English' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Français' })).not.toBeChecked();
    expect(document.documentElement.lang).toBe('en');
  });

  it('switches the whole interface to French, marks the page language and remembers the choice', async () => {
    const view = await renderWidget(
      <>
        <LanguageSwitch />
        <Money amount={1234.5} basis="subscription-equivalent" />
      </>,
      { storage: window.localStorage },
    );
    expect(screen.getByText('$1,234.50')).toBeInTheDocument();
    await view.user.click(screen.getByRole('radio', { name: 'Français' }));
    expect(await screen.findByRole('radiogroup', { name: 'Langue' })).toBeInTheDocument();
    expect(screen.getByText('Équivalent API')).toBeInTheDocument();
    expect(screen.getByText((content) => content.replace(/\s/g, ' ') === '1 234,50 $US')).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('fr');
  });

  it('keeps working when the browser refuses to store the choice', async () => {
    const refusing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const view = await renderWidget(<LanguageSwitch />, { storage: refusing });
    await view.user.click(screen.getByRole('radio', { name: 'Français' }));
    expect(await screen.findByRole('radiogroup', { name: 'Langue' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('fr');
  });

  it('can start in French', async () => {
    await renderWidget(<LanguageSwitch />, { locale: 'fr' });
    expect(screen.getByRole('radio', { name: 'Français' })).toBeChecked();
    expect(document.documentElement.lang).toBe('fr');
  });
});
