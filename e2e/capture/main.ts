import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { imageDigest, inputDigests, inputHash } from './inputs.ts';

/**
 * Takes the README screenshots from the demonstration, or with --check verifies that they were taken from the
 * cockpit, the demonstration and the projects as they are now. The check needs no browser and no factory.
 */
const ROOT = join(import.meta.dirname, '..', '..');
const DIRECTORY = join(ROOT, 'docs', 'screenshots');
const MANIFEST = join(DIRECTORY, 'manifest.json');
const MAX_IMAGE_BYTES = 400_000;
const VIEWPORT = { width: 1440, height: 900 };
/** The demonstration makes its home under the temporary directory, whose paths the log of a run shows: one that names no machine and no user. */
const NEUTRAL_TEMPORARY_DIRECTORY = '/tmp';
const STALE_MESSAGE = 'the cockpit or the demo changed since the screenshots were taken; run script/screenshots';

interface Manifest {
  readonly inputHash: string;
  readonly inputs: Readonly<Record<string, string>>;
  readonly images: readonly { readonly file: string; readonly bytes: number; readonly sha256: string }[];
}

function readManifest(): Manifest | null {
  return existsSync(MANIFEST) ? (JSON.parse(readFileSync(MANIFEST, 'utf8')) as Manifest) : null;
}

function check(): number {
  const manifest = readManifest();
  if (manifest === null) {
    console.error(`${STALE_MESSAGE} (docs/screenshots/manifest.json is missing)`);
    return 1;
  }
  if (inputHash(inputDigests(ROOT)) !== manifest.inputHash) {
    console.error(STALE_MESSAGE);
    return 1;
  }
  for (const image of manifest.images) {
    const path = join(DIRECTORY, image.file);
    if (!existsSync(path) || imageDigest(path).sha256 !== image.sha256) {
      console.error(`docs/screenshots/${image.file} is missing or was changed by hand; run script/screenshots`);
      return 1;
    }
  }
  console.log(`the ${manifest.images.length} screenshots are current`);
  return 0;
}

async function generate(): Promise<number> {
  const { chromium } = await import('@playwright/test');
  const { startFactory } = await import('../support/factory.ts');
  const { SCREENSHOTS } = await import('./screenshot-set.ts');
  mkdirSync(DIRECTORY, { recursive: true });
  process.env['TMPDIR'] = NEUTRAL_TEMPORARY_DIRECTORY;
  const factory = await startFactory('demo');
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ viewport: VIEWPORT, locale: 'en-US', timezoneId: 'UTC', colorScheme: 'light', deviceScaleFactor: 1 });
    const page = await context.newPage();
    const state = await factory.api.state();
    for (const shot of SCREENSHOTS) {
      await page.goto(`${factory.origin}${shot.path(state)}`);
      await shot.compose(page, state);
      await page.screenshot({ path: join(DIRECTORY, shot.file), animations: 'disabled', caret: 'hide' });
      const { bytes } = imageDigest(join(DIRECTORY, shot.file));
      if (bytes > MAX_IMAGE_BYTES) throw new Error(`${shot.file} is ${bytes} bytes, above the ${MAX_IMAGE_BYTES} allowed`);
      console.log(`${shot.file}: ${bytes} bytes`);
    }
    const inputs = inputDigests(ROOT);
    const manifest: Manifest = { inputHash: inputHash(inputs), inputs, images: SCREENSHOTS.map((shot) => ({ file: shot.file, ...imageDigest(join(DIRECTORY, shot.file)) })) };
    writeFileSync(MANIFEST, `${JSON.stringify(manifest, null, 2)}\n`);
    return 0;
  } finally {
    await browser.close();
    await factory.stop();
  }
}

process.exitCode = process.argv.includes('--check') ? check() : await generate();
