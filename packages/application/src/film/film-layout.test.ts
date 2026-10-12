import { describe, expect, it } from 'vitest';
import {
  extensionOf,
  filmBranchReport,
  filmBranchScreenshot,
  filmBranchVideo,
  filmPhasePath,
  filmStoreFile,
  filmStoreRoot,
  isMp4,
  transcodedVideoPath,
} from './film-layout.ts';

describe('film layout', () => {
  it('lays a film out under the evidence directory of its issue', () => {
    expect(filmBranchVideo(42, 'checkout-flow', 'before')).toBe('.evidence/42/films/checkout-flow/before.mp4');
    expect(filmBranchReport(42, 'checkout-flow', 'after')).toBe('.evidence/42/films/checkout-flow/after-report.json');
  });

  it('names the final screenshot after the phase and the key frames after their position, each with its own extension', () => {
    expect(filmBranchScreenshot(42, 'checkout-flow', 'before', 0, 'screens/final.svg')).toBe('.evidence/42/films/checkout-flow/before.svg');
    expect(filmBranchScreenshot(42, 'checkout-flow', 'after', 2, 'frames/two.JPG')).toBe('.evidence/42/films/checkout-flow/after-frame-2.jpg');
  });

  it('keeps the recordings of an issue in its own directory of the film store', () => {
    expect(filmStoreRoot('/factory/evidence', 42)).toBe('/factory/evidence/issue-42');
    expect(filmPhasePath('checkout-flow', 'after')).toBe('films/checkout-flow/after');
    expect(filmStoreFile('checkout-flow', 'after', 'run/film.webm')).toBe('films/checkout-flow/after/run/film.webm');
  });

  it('reads the extension of the last segment only', () => {
    expect(extensionOf('a/b.c/film')).toBe('');
    expect(extensionOf('film.WebM')).toBe('.webm');
    expect(isMp4('run/Film.MP4')).toBe(true);
    expect(isMp4('film.mp4.webm')).toBe(false);
  });

  it('names the transcoded copy of a video next to it', () => {
    expect(transcodedVideoPath('run/film.webm')).toBe('run/film.webm.h264.mp4');
  });
});
