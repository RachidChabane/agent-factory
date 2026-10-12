import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SKIPPED_REASON } from '../demo/films/demo-film.ts';
import { UNAVAILABLE_SCENARIO } from '../demo/films/demo-film-request.ts';

export { UNAVAILABLE_SCENARIO };
export const FILM_TOOL_FILE = 'film-tool.mjs';
export const FILM_GATE_VARIABLE = 'FILM_GATE';
export const FILM_LOG_FILE = 'invocations.log';
/** The reason this tool gives for a scenario it cannot record, which it reports skipped. */
export const UNAVAILABLE_REASON = SKIPPED_REASON;

/**
 * A stand-in for a project's film tool. It waits for the file named by FILM_GATE to exist when that variable
 * is set, then writes a report, an MP4, a final screenshot and, as the recording of the base, a replay file.
 */
const FILM_TOOL = `
import { appendFileSync, existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, token, index, all) => (token.startsWith('--') ? [...pairs, [token.slice(2), all[index + 1] ?? '']] : pairs), []));
const { out, ref, scenario } = options;
appendFileSync('${FILM_LOG_FILE}', JSON.stringify({ scenario, ref, replay: options.replay ?? null }) + '\\n');
const gate = process.env.${FILM_GATE_VARIABLE};
while (gate && !existsSync(gate)) await new Promise((resolve) => setTimeout(resolve, 25));
await mkdir(join(out, 'screens'), { recursive: true });
if (scenario === '${UNAVAILABLE_SCENARIO}') {
  await writeFile(join(out, 'report.json'), JSON.stringify({ status: 'skipped', reason: '${UNAVAILABLE_REASON}' }));
  process.exit(0);
}
await writeFile(join(out, 'film.mp4'), 'ftypmp42 recording of ' + scenario + ' at ' + ref);
await writeFile(join(out, 'screens', 'final.svg'), '<svg xmlns="http://www.w3.org/2000/svg"><text>' + ref + '</text></svg>');
await writeFile(join(out, 'report.json'), JSON.stringify({ status: 'recorded', facts: [{ label: 'Commit', value: ref.slice(0, 7) }, { label: 'Replayed', value: options.replay !== undefined }] }));
if (options.replay === undefined) await writeFile(join(out, 'replay.json'), JSON.stringify({ choices: [scenario] }));
`;

export async function installFilmTool(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, FILM_TOOL_FILE), FILM_TOOL);
}

/** The film declaration of a project whose command is the stand-in tool. */
export function filmSettings(directory: string, environment: Readonly<Record<string, string>> = {}): Readonly<Record<string, unknown>> {
  return {
    evidence: {
      films: {
        command: [process.execPath, FILM_TOOL_FILE, '--ref', '{ref}', '--out', '{output}', '--scenario', '{scenario}', '--replay', '{replay}'],
        workingDirectory: directory,
        environment,
        timeoutMinutes: 2,
        timeZone: 'UTC',
      },
    },
  };
}
