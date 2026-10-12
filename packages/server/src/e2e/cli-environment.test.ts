import { describe, expect, it } from 'vitest';
import { factoryEnvironment } from './cli-environment.ts';

describe('factoryEnvironment', () => {
  it('keeps where the tools are and where the files go, and names the factory home', () => {
    const environment = factoryEnvironment({ PATH: '/usr/bin', HOME: '/home/runner', TMPDIR: '/tmp', LANG: 'en_US.UTF-8', TERM: 'xterm' }, '/work/home');
    expect(environment).toEqual({ PATH: '/usr/bin', HOME: '/home/runner', TMPDIR: '/tmp', LANG: 'en_US.UTF-8', TERM: 'xterm', AGENT_FACTORY_HOME: '/work/home' });
  });

  it('holds no credential and no setting of the caller', () => {
    const environment = factoryEnvironment(
      { PATH: '/usr/bin', ANTHROPIC_API_KEY: 'key', GITHUB_TOKEN: 'token', GH_TOKEN: 'token', NODE_OPTIONS: '--inspect', USER: 'someone', AGENT_FACTORY_HOME: '/elsewhere' },
      '/work/home',
    );
    expect(Object.keys(environment).sort()).toEqual(['AGENT_FACTORY_HOME', 'PATH']);
    expect(environment['AGENT_FACTORY_HOME']).toBe('/work/home');
  });

  it('leaves out a variable the caller does not have', () => {
    expect(factoryEnvironment({}, '/work/home')).toEqual({ AGENT_FACTORY_HOME: '/work/home' });
  });
});
