import { describe, expect, it } from 'vitest';
import { stringify } from 'yaml';
import { parseAgentFactoryConfig, projectOf } from '../../config/agent-factory-config.ts';
import { forgeFileLinks, LocalForgeFileLinks } from './forge.ts';

const USER_HOME = '/Users/operator';
const HOME = `${USER_HOME}/.agent-factory`;

function projectWith(forge: Record<string, unknown>) {
  const text = stringify({ version: 1, projects: [{ id: 'storefront', name: 'Storefront', forge, commitIdentity: { name: 'Bot', email: 'bot@example.invalid' } }] });
  return projectOf(parseAgentFactoryConfig(text, HOME, `${HOME}/config.yaml`, USER_HOME), 'storefront');
}

describe('the links of a pull request body', () => {
  it('lead to the GitHub repository of a GitHub project', () => {
    const links = forgeFileLinks(projectWith({ kind: 'github', repository: 'example-org/storefront' }), 'http://127.0.0.1:7430');
    expect(links.file('2222222bbbbbbb', '.evidence/4/after.log')).toBe('https://github.com/example-org/storefront/blob/2222222bbbbbbb/.evidence/4/after.log');
  });

  it("lead to the factory's own server for a local forge, which reads the commit from the clone", () => {
    const links = forgeFileLinks(projectWith({ kind: 'local', repository: 'example-org/storefront' }), 'http://127.0.0.1:7431/');
    expect(links.file('2222222bbbbbbb', '.evidence/4/after.log')).toBe('http://127.0.0.1:7431/api/projects/storefront/blob/2222222bbbbbbb/.evidence/4/after.log');
    expect(links.rawFile('2222222bbbbbbb', '.evidence/4/after/cart badge.png')).toBe('http://127.0.0.1:7431/api/projects/storefront/blob/2222222bbbbbbb/.evidence/4/after/cart%20badge.png');
    expect(new LocalForgeFileLinks('https://factory.example.com', 'ledger').file('abc1234', 'README.md')).toBe('https://factory.example.com/api/projects/ledger/blob/abc1234/README.md');
  });
});
