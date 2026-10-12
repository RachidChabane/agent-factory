import { readFile, writeFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { parse, stringify } from 'yaml';
import { CONFIGURATION_RELOAD_FAILED_EVENT, CONFIGURATION_RELOADED_EVENT, DAEMON_SUBJECT, projectSubjectPrefix, SETTINGS_SUBJECT } from '@agent-factory/application';
import { installationSettingsView } from '../projections/installation-views.ts';
import { RehearsalAgents } from '../testing/rehearsal-agents.ts';
import { createRehearsal, FIRST_PROJECT, waitFor, type RehearsalEnvironment } from '../testing/rehearsal-environment.ts';
import { createDaemons } from './installation-daemon.ts';
import { openInstallation, type InstallationRuntime } from './installation/installation-runtime.ts';
import { SILENT_LOG } from './operation-log.ts';

const TIMEOUT_MS = 30_000;
const NORMAL_RESOURCES = { snapshot: () => Promise.resolve({ freeMemoryPercent: 70, pressure: 'normal' as const }) };

describe('a hand edit of the configuration file', () => {
  let rehearsal: RehearsalEnvironment;
  let installation: InstallationRuntime;
  let controller: AbortController;
  let running: Promise<void>;

  beforeEach(async () => {
    rehearsal = await createRehearsal();
    installation = await openInstallation(rehearsal.config, rehearsal.environment, {
      harnessFor: () => new RehearsalAgents(),
      resources: NORMAL_RESOURCES,
      usage: { read: (account) => Promise.resolve({ account, source: 'usage-report', readAt: new Date(), limits: [] }) },
      log: SILENT_LOG,
      userHome: rehearsal.root,
    });
    controller = new AbortController();
    running = createDaemons(installation).installation.run(controller.signal);
    // The loop reads the file for the first time at its first tick, once every project has started: an edit before that is no change.
    await waitFor(async () => ((await installation.events.read(`${projectSubjectPrefix(FIRST_PROJECT)}${DAEMON_SUBJECT}`, 0)).length > 0 ? true : null), TIMEOUT_MS, 'the project to start');
  });

  afterEach(async () => {
    controller.abort();
    await running;
    installation.close();
    await rehearsal.cleanup();
  });

  async function edit(change: (text: string) => string): Promise<void> {
    const path = rehearsal.config.configPath;
    await writeFile(path, change(await readFile(path, 'utf8')));
  }

  async function settled(type: string, count: number): Promise<void> {
    await waitFor(async () => ((await installation.events.read(SETTINGS_SUBJECT, 0)).filter((record) => record.type === type).length >= count ? true : null), TIMEOUT_MS, `${count} ${type}`);
  }

  it('applies what it can at once, names what waits for a restart, and reports a file it cannot load', async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await edit((text) => text.replace('issues: 1', 'issues: 2').replace('port: 0', 'port: 7499'));
    await settled(CONFIGURATION_RELOADED_EVENT, 1);
    expect(installation.project(FIRST_PROJECT).config.concurrency.issues).toBe(2);
    const records = await installation.events.read('', 0);
    expect(installationSettingsView(installation.config, installation.environment, records).configuration).toMatchObject({ restartRequired: ['server'], reloadFailure: null });

    await edit((text) => text.replace('issues: 2', 'issues: 5'));
    await settled(CONFIGURATION_RELOAD_FAILED_EVENT, 1);
    const refused = installationSettingsView(installation.config, installation.environment, await installation.events.read('', 0)).configuration.reloadFailure;
    expect(refused?.reason).toContain('must not exceed concurrency.ceiling');
    expect(installation.project(FIRST_PROJECT).config.concurrency.issues).toBe(2);
  });

  it('applies a change of the autonomy policy at once: the command line enforces the file, so the cockpit shows the file', async () => {
    await new Promise((resolve) => setTimeout(resolve, 200));
    await edit((text) => {
      const document = parse(text) as { projects: { autonomy?: unknown }[] };
      const [project] = document.projects;
      if (project === undefined) throw new Error('the rehearsal declares no project');
      project.autonomy = { validateSpecs: true, merge: [{ types: ['docs'] }] };
      return stringify(document);
    });
    await settled(CONFIGURATION_RELOADED_EVENT, 1);
    expect(installation.project(FIRST_PROJECT).config.autonomy).toEqual({ actor: 'orchestrator', validateSpecs: true, answerDecisions: false, resume: false, merge: [{ types: ['docs'], requires: [] }] });
    const records = await installation.events.read('', 0);
    expect(installationSettingsView(installation.config, installation.environment, records).configuration).toMatchObject({ restartRequired: [], reloadFailure: null });
  });
});
