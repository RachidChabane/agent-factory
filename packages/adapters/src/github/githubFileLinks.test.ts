import { describe, expect, it } from 'vitest';
import { GitHubFileLinks, gitHubRepositoryUrl } from './githubFileLinks.ts';

describe('the links to the files of a GitHub repository', () => {
  const links = new GitHubFileLinks({ owner: 'example-org', name: 'storefront' });

  it('opens a file of a commit on its web page, each path segment encoded', () => {
    expect(links.file('2222222bbbbbbb', '.evidence/42/before log.txt')).toBe('https://github.com/example-org/storefront/blob/2222222bbbbbbb/.evidence/42/before%20log.txt');
  });

  it('serves the file itself for an image a body shows inline', () => {
    expect(links.rawFile('2222222bbbbbbb', '.evidence/42/after/header.png')).toBe('https://github.com/example-org/storefront/blob/2222222bbbbbbb/.evidence/42/after/header.png?raw=true');
  });

  it('names the repository page', () => {
    expect(gitHubRepositoryUrl({ owner: 'example-org', name: 'storefront' })).toBe('https://github.com/example-org/storefront');
  });
});
