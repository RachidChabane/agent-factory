import { settingsChangeProblems, type SettingsChange } from '@agent-factory/domain';
import type { EventStore } from '../ports.ts';
import { SETTINGS_CHANGED_EVENT, SETTINGS_SUBJECT, type SettingsChangedPayload } from './settings-events.ts';

export interface SettingsDocumentWrite {
  readonly backupPath: string;
}

export interface SettingsDocument {
  apply(change: SettingsChange): Promise<SettingsDocumentWrite>;
}

export class SettingsChangeRefusedError extends Error {
  readonly problems: readonly string[];

  constructor(problems: readonly string[]) {
    super(`The settings change is refused: ${problems.join('; ')}`);
    this.name = 'SettingsChangeRefusedError';
    this.problems = problems;
  }
}

export interface ChangeSettingsDependencies {
  readonly events: EventStore;
  readonly document: SettingsDocument;
}

export class ChangeSettings {
  private readonly dependencies: ChangeSettingsDependencies;

  constructor(dependencies: ChangeSettingsDependencies) {
    this.dependencies = dependencies;
  }

  async change(change: SettingsChange, operator: string): Promise<number> {
    const problems = settingsChangeProblems(change);
    if (problems.length > 0) throw new SettingsChangeRefusedError(problems);
    const write = await this.dependencies.document.apply(change);
    const payload: SettingsChangedPayload = { change, operator, backupPath: write.backupPath };
    return (await this.dependencies.events.append(SETTINGS_CHANGED_EVENT, SETTINGS_SUBJECT, payload)).sequence;
  }
}
