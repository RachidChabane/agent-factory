#!/usr/bin/env node
import { appendFileSync, readFileSync } from 'node:fs';
import { z } from 'zod';

const RULES_VARIABLE = 'FAKE_GH_RULES';
const CALLS_VARIABLE = 'FAKE_GH_CALLS';
const UNMATCHED_EXIT_CODE = 99;

const RulesSchema = z.array(
  z.object({
    contains: z.array(z.string()),
    stdout: z.string().default(''),
    stderr: z.string().default(''),
    exitCode: z.number().int().default(0),
  }),
);

const rulesPath = process.env[RULES_VARIABLE];
const callsPath = process.env[CALLS_VARIABLE];
if (rulesPath === undefined || callsPath === undefined) {
  process.stderr.write('fake gh is not configured\n');
  process.exit(UNMATCHED_EXIT_CODE);
}

const args = process.argv.slice(2);
appendFileSync(callsPath, `${JSON.stringify({ args, env: process.env })}\n`);

const rules = RulesSchema.parse(JSON.parse(readFileSync(rulesPath, 'utf8')));
const joined = args.join(' ');
const rule = rules.find((candidate) => candidate.contains.every((fragment) => joined.includes(fragment)));
if (rule === undefined) {
  process.stderr.write(`fake gh: no rule for: ${joined}\n`);
  process.exit(UNMATCHED_EXIT_CODE);
}
process.stdout.write(rule.stdout);
process.stderr.write(rule.stderr);
process.exit(rule.exitCode);
