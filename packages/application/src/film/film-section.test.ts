import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { FilmFinishedRecord } from '../pipeline/journal-events.ts';
import { webForgeFileLinks } from '../pipeline/testing/file-links.ts';
import { FILM_SECTION_HEADING, renderFilmSection, renderFinishedFilm, replaceFilmSection } from './film-section.ts';

const LINKS = webForgeFileLinks('https://forge.example.test', 'example-org', 'storefront');

const FILM: FilmFinishedRecord = {
  scenario: 'checkout-flow',
  baseSha: '1111111aaaaaaa',
  headSha: '2222222bbbbbbb',
  commitSha: '3333333ccccccc',
  before: {
    video: '.evidence/42/films/checkout-flow/before.mp4',
    report: '.evidence/42/films/checkout-flow/before-report.json',
    screenshots: ['.evidence/42/films/checkout-flow/before.svg', '.evidence/42/films/checkout-flow/before-frame-1.png'],
    facts: [{ label: 'Items in the cart', value: '0' }],
    storeVideo: 'films/checkout-flow/before/film.mp4',
    storeScreenshots: [],
  },
  after: {
    video: '.evidence/42/films/checkout-flow/after.mp4',
    report: '.evidence/42/films/checkout-flow/after-report.json',
    screenshots: ['.evidence/42/films/checkout-flow/after.svg'],
    facts: [],
    storeVideo: 'films/checkout-flow/after/film.mp4',
    storeScreenshots: [],
  },
};

describe('film section', () => {
  it('links the videos and shows the screenshots at the commit that holds them, through the forge file links', () => {
    const block = renderFinishedFilm(LINKS, FILM);
    expect(block).toContain('### Scenario `checkout-flow`');
    expect(block).toContain('#### Before — 1111111');
    expect(block).toContain('#### After — 2222222');
    expect(block).toContain('[Watch the recording](https://forge.example.test/example-org/storefront/blob/3333333ccccccc/.evidence/42/films/checkout-flow/before.mp4)');
    expect(block).toContain('![Before](https://forge.example.test/example-org/storefront/blob/3333333ccccccc/.evidence/42/films/checkout-flow/before.svg?raw=true)');
    expect(block).toContain('![Before, key frame 1](https://forge.example.test/example-org/storefront/blob/3333333ccccccc/.evidence/42/films/checkout-flow/before-frame-1.png?raw=true)');
  });

  it('lists the facts of a recording as bullets and omits the list when there are none', () => {
    const block = renderFinishedFilm(LINKS, FILM);
    expect(block).toContain('- Items in the cart: 0');
    expect(block.split('#### After')[1]).not.toContain('- ');
  });

  it('puts the heading first and one block per scenario after it', () => {
    expect(renderFilmSection(['block one', 'block two'])).toBe(`## ${FILM_SECTION_HEADING}\n\nblock one\n\nblock two`);
  });
});

describe('replacing the film section of a body', () => {
  const SECTION = renderFilmSection(['### Scenario `checkout-flow`\n\nrecording']);

  it('appends the section to a body that has none', () => {
    expect(replaceFilmSection('## What to look at\n\ntext', SECTION)).toBe(`## What to look at\n\ntext\n\n${SECTION}\n`);
    expect(replaceFilmSection('', SECTION)).toBe(`${SECTION}\n`);
  });

  it('replaces the section in place and keeps the sections around it', () => {
    const body = `## Risks\n\nNone.\n\n## ${FILM_SECTION_HEADING}\n\nold block\n\n## Technical details\n\nfacts\n`;
    expect(replaceFilmSection(body, SECTION)).toBe(`## Risks\n\nNone.\n\n${SECTION}\n\n## Technical details\n\nfacts\n`);
  });

  it('replaces a section that ends the body', () => {
    expect(replaceFilmSection(`## Risks\n\nNone.\n\n## ${FILM_SECTION_HEADING}\n\nold block\n`, SECTION)).toBe(`## Risks\n\nNone.\n\n${SECTION}\n`);
  });

  it('is stable: replacing twice with the same section changes nothing more', () => {
    fc.assert(
      fc.property(fc.stringMatching(/^[a-z .\n]{0,60}$/), (text) => {
        const once = replaceFilmSection(`## Risks\n\n${text.trim()}\n`, SECTION);
        expect(replaceFilmSection(once, SECTION)).toBe(once);
      }),
    );
  });
});
