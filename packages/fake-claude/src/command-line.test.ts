import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseCommandLine, toolsOf } from './cli/command-line.ts';
import { DEFAULT_TOOLS } from './stream/stream-vocabulary.ts';
import { seededRandom, shuffled } from './test-support/seeded-random.ts';

const FACTORY_ARGUMENTS = [
  '--scenario',
  'scenario.json',
  '--state',
  '/tmp/state',
  '--print',
  '--output-format',
  'stream-json',
  '--verbose',
  '--include-partial-messages',
  '--include-hook-events',
  '--permission-mode',
  'dontAsk',
  '--setting-sources',
  'project,local',
  '--strict-mcp-config',
  '--model',
  'haiku',
  '--effort',
  'low',
  '--max-turns',
  '10',
  '--max-budget-usd',
  '1',
  '--settings',
  '/runs/run-1/settings.json',
  '--mcp-config',
  '/runs/run-1/mcp-config.json',
  '--tools',
  'Read,Glob,Grep,Edit,Write,Bash',
  '--allowedTools',
  'Read,Edit',
  '--append-system-prompt-file',
  '/runs/run-1/append-system-prompt.md',
] as const;

describe('parseCommandLine', () => {
  it('reads the flags the fake acts on from the arguments the factory passes', () => {
    assert.deepEqual(parseCommandLine(FACTORY_ARGUMENTS), {
      scenarioPath: 'scenario.json',
      statePath: '/tmp/state',
      model: 'haiku',
      effort: 'low',
      settings: '/runs/run-1/settings.json',
      permissionMode: 'dontAsk',
      toolList: 'Read,Glob,Grep,Edit,Write,Bash',
      resumeSessionId: null,
      promptArgument: null,
    });
  });

  it('reads the session to resume from the arguments the factory passes', () => {
    const parsed = parseCommandLine([...FACTORY_ARGUMENTS, '--resume', 'b0f3c7a2-0000-4000-8000-000000000001']);
    assert.equal(parsed.resumeSessionId, 'b0f3c7a2-0000-4000-8000-000000000001');
  });

  it('accepts both --flag value and --flag=value', () => {
    const separate = parseCommandLine(['--model', 'opus', '--resume', 'abc']);
    const inline = parseCommandLine(['--model=opus', '--resume=abc']);
    assert.deepEqual(inline, separate);
    assert.equal(inline.model, 'opus');
    assert.equal(inline.resumeSessionId, 'abc');
  });

  it('keeps an equals sign that belongs to the value', () => {
    assert.equal(parseCommandLine(['--settings={"hooks":{"a":"b=c"}}']).settings, '{"hooks":{"a":"b=c"}}');
  });

  it('ignores unknown flags with or without a value', () => {
    const parsed = parseCommandLine(['--future-switch', '--future-option', 'value', '--model', 'haiku', '--another=1', '-x']);
    assert.equal(parsed.model, 'haiku');
    assert.equal(parsed.promptArgument, null);
  });

  it('ignores a flag that needs a value but is followed by another flag or by nothing', () => {
    assert.equal(parseCommandLine(['--model', '--effort', 'low']).model, null);
    assert.equal(parseCommandLine(['--model', '--effort', 'low']).effort, 'low');
    assert.equal(parseCommandLine(['--model']).model, null);
  });

  it('treats an empty value as absent, except for the tool list where it means no tools', () => {
    const parsed = parseCommandLine(['--model', '', '--setting-sources', '', '--tools', '']);
    assert.equal(parsed.model, null);
    assert.equal(parsed.toolList, '');
    assert.deepEqual(toolsOf(parsed.toolList, DEFAULT_TOOLS), []);
  });

  it('lets the last occurrence of a flag win', () => {
    assert.equal(parseCommandLine(['--model', 'a', '--model=b', '--model', 'c']).model, 'c');
  });

  it('takes the prompt from the argument that follows -p or --print', () => {
    assert.equal(parseCommandLine(['-p', '/usage', '--output-format', 'stream-json']).promptArgument, '/usage');
    assert.equal(parseCommandLine(['--verbose', '--print', '/usage']).promptArgument, '/usage');
  });

  it('leaves the prompt on standard input when -p is followed by a flag or by nothing', () => {
    assert.equal(parseCommandLine(['--print', '--verbose']).promptArgument, null);
    assert.equal(parseCommandLine(['-p']).promptArgument, null);
    assert.equal(parseCommandLine(['-p', '']).promptArgument, null);
  });

  it('never mistakes the value of another flag for the prompt', () => {
    assert.equal(parseCommandLine(['--output-format', 'stream-json', '--model', 'haiku']).promptArgument, null);
  });
});

describe('toolsOf', () => {
  it('splits a comma separated list and drops blanks', () => {
    assert.deepEqual(toolsOf(' Read, Write ,,Bash', DEFAULT_TOOLS), ['Read', 'Write', 'Bash']);
  });

  it('falls back to the defaults when the list is absent or says default', () => {
    assert.deepEqual(toolsOf(null, DEFAULT_TOOLS), DEFAULT_TOOLS);
    assert.deepEqual(toolsOf('default', DEFAULT_TOOLS), DEFAULT_TOOLS);
  });
});

describe('parseCommandLine over generated argument lists', () => {
  const KNOWN_FLAGS = [
    ['--scenario', 'scenarioPath'],
    ['--state', 'statePath'],
    ['--model', 'model'],
    ['--effort', 'effort'],
    ['--settings', 'settings'],
    ['--permission-mode', 'permissionMode'],
    ['--resume', 'resumeSessionId'],
  ] as const;
  const NOISE: readonly (readonly string[])[] = [
    ['--verbose'],
    ['--max-turns', '10'],
    ['--output-format=stream-json'],
    ['--mcp-config', '/x/mcp.json'],
    ['--include-hook-events'],
    ['--allowedTools', 'Read,Edit'],
    ['--brand-new-flag'],
    ['--brand-new-option', 'v'],
  ];
  const SEEDS = 200;
  const KEEP_PROBABILITY = 0.7;
  const NOISE_PROBABILITY = 0.5;
  const INLINE_PROBABILITY = 0.5;

  it('recovers every known flag whatever the form, the order and the noise around it', () => {
    for (let seed = 1; seed <= SEEDS; seed += 1) {
      const random = seededRandom(seed);
      const expected: Record<string, string> = {};
      const known = KNOWN_FLAGS.filter(() => random() < KEEP_PROBABILITY).map(([flag, key]): readonly string[] => {
        const value = `value-${String(seed)}-${key}`;
        expected[key] = value;
        return random() < INLINE_PROBABILITY ? [`${flag}=${value}`] : [flag, value];
      });
      const noise = NOISE.filter(() => random() < NOISE_PROBABILITY);
      const argv = shuffled([...known, ...noise], random).flat();
      const parsed = parseCommandLine(argv);
      for (const [, key] of KNOWN_FLAGS) {
        assert.equal(parsed[key], expected[key] ?? null, `seed ${String(seed)}, ${key}, from ${JSON.stringify(argv)}`);
      }
      assert.equal(parsed.promptArgument, null);
    }
  });
});
