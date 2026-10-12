import type { SettingsDocument, SettingsDocumentWrite } from '@agent-factory/application';
import type { SettingsChange } from '@agent-factory/domain';
import { editConfigText } from './config-document.ts';
import type { ConfigFile } from './config-file.ts';

export type ConfigValidator = (text: string) => unknown;

export class FileSettingsDocument implements SettingsDocument {
  private readonly file: ConfigFile;
  private readonly validate: ConfigValidator;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(file: ConfigFile, validate: ConfigValidator) {
    this.file = file;
    this.validate = validate;
  }

  apply(change: SettingsChange): Promise<SettingsDocumentWrite> {
    const write = this.queue.then(() => this.write(change));
    this.queue = write.catch(() => undefined);
    return write;
  }

  private async write(change: SettingsChange): Promise<SettingsDocumentWrite> {
    const edited = editConfigText(await this.file.read(), change);
    this.validate(edited);
    return { backupPath: await this.file.replace(edited) };
  }
}
