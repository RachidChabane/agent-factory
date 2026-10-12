import { textDocument } from '@agent-factory/domain';
import { describe, expect, it } from 'vitest';
import { OutboundSecretScan } from './outbound-secret-scan.ts';
import { EscalationRequiredError } from './pipeline-errors.ts';
import { StaticSecrets } from './testing/pipeline-fakes.ts';

describe('OutboundSecretScan', () => {
  const secrets = new StaticSecrets();
  secrets.secrets = [{ source: 'keychain item deploy-key', value: 'tok_live_123456789' }];

  it('reads the documents about to be committed under the path they will have on the branch', async () => {
    const scan = new OutboundSecretScan(secrets);
    await expect(scan.assertClean({ documents: [textDocument('.evidence/1/films/a/before-report.json', '{"status":"recorded"}')] }, 'commit the films')).resolves.toBeUndefined();
    const refused = scan.assertClean({ documents: [textDocument('.evidence/1/films/a/before-report.json', '{"note":"tok_live_123456789"}')] }, 'commit the films');
    await expect(refused).rejects.toBeInstanceOf(EscalationRequiredError);
    await expect(refused).rejects.toThrow('.evidence/1/films/a/before-report.json');
    await expect(refused).rejects.not.toThrow('tok_live_123456789');
  });
});
