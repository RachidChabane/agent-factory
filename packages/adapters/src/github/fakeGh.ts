import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { buildGhEnvironment } from './ghEnvironment.ts';

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIRECTORY = join(HERE, 'fixtures');
const FAKE_GH_PREFIX = 'factory-fake-gh-';

export interface FakeGhRule {
  readonly contains: readonly string[];
  readonly stdout?: string;
  readonly stderr?: string;
  readonly exitCode?: number;
}

const RecordedCallSchema = z.object({
  args: z.array(z.string()),
  env: z.record(z.string(), z.string()),
});
export type RecordedCall = z.infer<typeof RecordedCallSchema>;

export async function readFixture(name: string): Promise<string> {
  return readFile(join(FIXTURES_DIRECTORY, name), 'utf8');
}

export async function readFixtureJson(name: string): Promise<unknown> {
  return JSON.parse(await readFixture(name));
}

export class FakeGh {
  readonly executable = join(HERE, 'fakeGhExecutable.ts');
  readonly environment: Record<string, string>;
  private readonly directory: string;
  private readonly callsPath: string;

  private constructor(directory: string, rulesPath: string, callsPath: string) {
    this.directory = directory;
    this.callsPath = callsPath;
    this.environment = { ...buildGhEnvironment(process.env), FAKE_GH_RULES: rulesPath, FAKE_GH_CALLS: callsPath };
  }

  static async create(rules: readonly FakeGhRule[]): Promise<FakeGh> {
    const directory = await mkdtemp(join(tmpdir(), FAKE_GH_PREFIX));
    const rulesPath = join(directory, 'rules.json');
    const callsPath = join(directory, 'calls.jsonl');
    await writeFile(rulesPath, JSON.stringify(rules));
    await writeFile(callsPath, '');
    const fake = new FakeGh(directory, rulesPath, callsPath);
    await chmod(fake.executable, 0o755);
    return fake;
  }

  async calls(): Promise<readonly RecordedCall[]> {
    const raw = await readFile(this.callsPath, 'utf8');
    return raw
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => RecordedCallSchema.parse(JSON.parse(line)));
  }

  async commandLines(): Promise<readonly string[]> {
    return (await this.calls()).map((call) => call.args.join(' '));
  }

  cleanup(): Promise<void> {
    return rm(this.directory, { recursive: true, force: true });
  }
}
