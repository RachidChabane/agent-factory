import { readdir, readFile, stat } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { COMMAND_SUBCOMMANDS, COMMAND_VERBS } from '../cli/command-line.ts';
import { FACTORY_INSTALL_DIRECTORY, PLUGIN_DIRECTORY } from '../composition/install-paths.ts';

const PLUGIN_NAME = 'agent-factory';
const REPOSITORY_URL = 'https://github.com/RachidChabane/agent-factory';
const LICENSE = 'AGPL-3.0-only';
const SEMANTIC_VERSION = /^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$/;
const KEBAB_CASE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const PLUGIN_MANIFEST = join(PLUGIN_DIRECTORY, '.claude-plugin', 'plugin.json');
const MARKETPLACE_MANIFEST = join(FACTORY_INSTALL_DIRECTORY, '.claude-plugin', 'marketplace.json');
const SKILLS_DIRECTORY = join(PLUGIN_DIRECTORY, 'skills');
const AGENT_FILE = join(PLUGIN_DIRECTORY, 'agents', 'orchestrator.md');
const SKILL_FILE = 'SKILL.md';
const DRIVE_SKILL = 'drive-factory';
const PROGRAM = 'agent-factory';
const FRONTMATTER = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
/** The plugin quotes many commands; a count far below it means the extraction found none. */
const MINIMUM_QUOTED_COMMANDS = 20;

const EXPECTED_SKILLS = ['declare-films', 'drive-factory', 'merge-and-release', 'morning-report', 'triage-escalation', 'upgrade-factory', 'watch-factory', 'write-spec'];
const ALLOWED_AGENT_TOOLS = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'Skill', 'Monitor', 'TaskStop', 'AskUserQuestion'];

/** Wording that dates a statement: the plugin's text holds for whoever reads it, whenever. */
const DATING_WORDS = /\b(currently|previously|no longer|at the moment|for now|used to|was added|newly|as of)\b/i;

const PluginManifestSchema = z.strictObject({
  name: z.literal(PLUGIN_NAME),
  version: z.string().regex(SEMANTIC_VERSION),
  description: z.string().min(1),
  author: z.strictObject({ name: z.string().min(1) }),
  homepage: z.literal(REPOSITORY_URL),
  repository: z.literal(REPOSITORY_URL),
  license: z.literal(LICENSE),
});

const MarketplaceSchema = z.strictObject({
  name: z.literal(PLUGIN_NAME),
  owner: z.strictObject({ name: z.string().min(1) }),
  metadata: z.strictObject({ description: z.string().min(1) }),
  plugins: z.tuple([z.strictObject({ name: z.literal(PLUGIN_NAME), source: z.string().startsWith('./'), description: z.string().min(1) })]),
});

const WHEN_TO_USE = /\bUse\b/;

const SkillFrontmatterSchema = z.strictObject({ name: z.string().regex(KEBAB_CASE), description: z.string().min(1).regex(WHEN_TO_USE) });

const AgentFrontmatterSchema = z.strictObject({
  name: z.literal('orchestrator'),
  description: z.string().min(1).regex(WHEN_TO_USE),
  tools: z.string().transform((tools) => tools.split(',').map((tool) => tool.trim())),
});

interface MarkdownFile {
  readonly frontmatter: unknown;
  readonly body: string;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(path, 'utf8')) as unknown;
}

async function readMarkdown(path: string): Promise<MarkdownFile> {
  const match = FRONTMATTER.exec(await readFile(path, 'utf8'));
  if (match === null) throw new Error(`${path} has no frontmatter`);
  return { frontmatter: parseYaml(match[1] ?? '') as unknown, body: match[2] ?? '' };
}

async function skillNames(): Promise<readonly string[]> {
  return (await readdir(SKILLS_DIRECTORY, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
}

async function markdownFiles(): Promise<readonly string[]> {
  const skills = (await skillNames()).map((name) => join(SKILLS_DIRECTORY, name, SKILL_FILE));
  return [AGENT_FILE, ...skills];
}

/** The text of the code spans and fenced blocks of a Markdown document, where commands are quoted. */
function codeOf(markdown: string): readonly string[] {
  const blocks: string[] = [];
  const outside = markdown.replace(/```[^\n]*\n([\s\S]*?)```/g, (_whole, block: string) => {
    blocks.push(block);
    return '';
  });
  return [...[...outside.matchAll(/`([^`\n]+)`/g)].map((match) => match[1] ?? ''), ...blocks.flatMap((block) => block.split('\n'))];
}

interface CommandMention {
  readonly verb: string;
  readonly subcommand: string | null;
}

/** Every `agent-factory <verb> [<subcommand>]` quoted in a document, however it is quoted. */
function commandsIn(markdown: string): readonly CommandMention[] {
  const command = new RegExp(`(?<![\\w@./-])${PROGRAM}(?![\\w@.-])(?:\\s+--project[=\\s]\\S+)?\\s+([a-z][a-z-]*)(?:\\s+([a-z][a-z-]*))?`, 'g');
  return codeOf(markdown).flatMap((code) => [...code.matchAll(command)].map((match) => ({ verb: match[1] ?? '', subcommand: match[2] ?? null })));
}

describe('the manifests of the plugin', () => {
  it('describe the plugin the way a plugin declares itself, and declare no hook', async () => {
    const manifest = PluginManifestSchema.parse(await readJson(PLUGIN_MANIFEST));
    expect(manifest.name).toBe(PLUGIN_NAME);
    await expect(stat(join(PLUGIN_DIRECTORY, 'hooks', 'hooks.json'))).rejects.toThrow();
  });

  it('carry the version of the factory', async () => {
    const { version } = PluginManifestSchema.parse(await readJson(PLUGIN_MANIFEST));
    const root = z.object({ version: z.string() }).parse(await readJson(join(FACTORY_INSTALL_DIRECTORY, 'package.json')));
    expect(version).toBe(root.version);
  });

  it('make the repository the marketplace of the one plugin, which lives in packages/plugin', async () => {
    const marketplace = MarketplaceSchema.parse(await readJson(MARKETPLACE_MANIFEST));
    const [entry] = marketplace.plugins;
    expect(resolve(FACTORY_INSTALL_DIRECTORY, entry.source)).toBe(PLUGIN_DIRECTORY);
    await expect(stat(join(resolve(FACTORY_INSTALL_DIRECTORY, entry.source), '.claude-plugin', 'plugin.json'))).resolves.toBeDefined();
  });
});

describe('the skills of the plugin', () => {
  it('are the eight of the orchestrator, one directory each', async () => {
    expect(await skillNames()).toEqual(EXPECTED_SKILLS);
  });

  it('each hold a SKILL.md whose name is its directory and whose description says when to use it', async () => {
    for (const name of await skillNames()) {
      const { frontmatter, body } = await readMarkdown(join(SKILLS_DIRECTORY, name, SKILL_FILE));
      expect(SkillFrontmatterSchema.parse(frontmatter).name, name).toBe(name);
      expect(body.trim().length, name).toBeGreaterThan(0);
    }
  });
});

describe('the orchestrator agent', () => {
  it('has the frontmatter of an agent, tools it may have, and names every skill', async () => {
    const { frontmatter, body } = await readMarkdown(AGENT_FILE);
    const agent = AgentFrontmatterSchema.parse(frontmatter);
    expect(agent.tools.filter((tool) => !ALLOWED_AGENT_TOOLS.includes(tool))).toEqual([]);
    for (const name of await skillNames()) expect(body, name).toContain(`\`${name}\``);
  });

  it('delegates through the policy: every gesture it quotes carries --as orchestrator and a reason', async () => {
    const { body } = await readMarkdown(AGENT_FILE);
    expect(body).toContain('--as orchestrator --reason "<why>"');
  });
});

describe('the commands the plugin quotes', () => {
  it('are verbs and subcommands of the command line', async () => {
    let quoted = 0;
    for (const file of await markdownFiles()) {
      for (const { verb, subcommand } of commandsIn(await readFile(file, 'utf8'))) {
        quoted += 1;
        expect(COMMAND_VERBS, `${file}: ${PROGRAM} ${verb}`).toContain(verb);
        const subcommands = COMMAND_SUBCOMMANDS[verb];
        if (subcommands !== undefined) expect(subcommands, `${file}: ${PROGRAM} ${verb} ${subcommand ?? ''}`).toContain(subcommand);
      }
    }
    expect(quoted).toBeGreaterThan(MINIMUM_QUOTED_COMMANDS);
  });

  it('include every verb and subcommand of the command line in drive-factory', async () => {
    const drive = await readFile(join(SKILLS_DIRECTORY, DRIVE_SKILL, SKILL_FILE), 'utf8');
    for (const verb of COMMAND_VERBS.filter((candidate) => candidate !== 'help')) {
      expect(drive, verb).toContain(`${PROGRAM} ${verb}`);
      for (const subcommand of COMMAND_SUBCOMMANDS[verb] ?? []) expect(drive, `${verb} ${subcommand}`).toContain(`${PROGRAM} ${verb} ${subcommand}`);
    }
  });
});

describe('the wording of the plugin', () => {
  it('states rules and commands that hold whenever they are read', async () => {
    for (const file of await markdownFiles()) expect(await readFile(file, 'utf8'), file).not.toMatch(DATING_WORDS);
  });
});
