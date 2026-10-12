import type { Notifier } from '@agent-factory/application';

export class NoopNotifier implements Notifier {
  notify(): Promise<void> {
    return Promise.resolve();
  }
}
