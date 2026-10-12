import { fireEvent, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { acceptance, CHIPS_TITLE, imageCompare, recording, redGreen, report, scores, SEARCH_RESULTS_TITLE, show } from './evidence-test-support.tsx';

describe('EvidenceGallery', () => {
  it('frames each piece of evidence with its title and its kind', async () => {
    await show([imageCompare, recording, redGreen, acceptance, scores, report]);
    const expected = [
      [SEARCH_RESULTS_TITLE, 'Before and after'],
      ['Searching with a sentence', 'Recording'],
      [CHIPS_TITLE, 'Red to green'],
      ['Acceptance tests by criterion', 'Acceptance tests'],
      ['Query understanding', 'Evaluation scores'],
      ['Summary of the change', 'Report'],
    ] as const;
    for (const [title, kind] of expected) {
      expect(within(screen.getByRole('figure', { name: title })).getByText(kind, { selector: 'span' })).toBeInTheDocument();
    }
  });

  it('puts the images and recordings ahead of the rest, whatever the order of the evidence', async () => {
    await show([report, redGreen, recording, imageCompare]);
    const media = screen.getByRole('figure', { name: SEARCH_RESULTS_TITLE });
    const tests = screen.getByRole('figure', { name: CHIPS_TITLE });
    expect(media.compareDocumentPosition(tests) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByRole('figure', { name: 'Searching with a sentence' }).compareDocumentPosition(tests) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('is a named group, so that the evidence can be reached as a whole', async () => {
    await show([report]);
    expect(screen.getByRole('group', { name: 'Evidence of the pull request' })).toBeInTheDocument();
  });

  it('shows the caption of an image or a recording under it', async () => {
    await show([imageCompare, recording]);
    expect(screen.getByText(imageCompare.caption)).toBeInTheDocument();
    expect(screen.getByText(recording.caption)).toBeInTheDocument();
  });
});

describe('EvidenceGallery before and after images', () => {
  it('compares the two screenshots with a slider and says how large they are', async () => {
    await show([imageCompare]);
    expect(screen.getByAltText(`${SEARCH_RESULTS_TITLE} — Before`)).toHaveAttribute('src', imageCompare.beforeUrl);
    expect(screen.getByAltText(`${SEARCH_RESULTS_TITLE} — After`)).toHaveAttribute('src', imageCompare.afterUrl);
    expect(screen.getByRole('slider', { name: 'Before and after slider' })).toHaveValue('50');
    expect(screen.getByText('1,280 × 800 px')).toBeInTheDocument();
  });

  it('moves the slider', async () => {
    await show([imageCompare]);
    const slider = screen.getByRole('slider', { name: 'Before and after slider' });
    fireEvent.change(slider, { target: { value: '20' } });
    expect(slider).toHaveValue('20');
    expect(slider).toHaveAttribute('aria-valuetext', '20% before');
  });

  it.each([
    ['could not be read as an image', { width: null, height: null }],
    ['has a width but no height', { width: 1280, height: null }],
    ['has a height but no width', { width: null, height: 800 }],
    ['declares an empty size', { width: 0, height: 0 }],
  ])('shows the two screenshots side by side when a file %s', async (_case, size) => {
    await show([{ ...imageCompare, ...size }]);
    expect(screen.queryByRole('slider')).not.toBeInTheDocument();
    expect(screen.getByAltText(`${SEARCH_RESULTS_TITLE} — Before`)).toHaveAttribute('src', imageCompare.beforeUrl);
    expect(screen.getByAltText(`${SEARCH_RESULTS_TITLE} — After`)).toHaveAttribute('src', imageCompare.afterUrl);
    expect(screen.getByText('Image size not recorded')).toBeInTheDocument();
    expect(screen.queryByText(/ × /)).not.toBeInTheDocument();
  });
});

describe('EvidenceGallery recordings', () => {
  it('plays the recording with its poster, says how long it lasts and offers it in a new tab', async () => {
    await show([recording]);
    const video = screen.getByLabelText(recording.title, { selector: 'video' });
    expect(video).toHaveAttribute('src', recording.url);
    expect(video).toHaveAttribute('poster', recording.posterUrl);
    expect(video).toHaveAttribute('controls');
    expect(screen.getByText('Duration 14 sec')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: 'Open the recording' });
    expect(link).toHaveAttribute('href', recording.url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('says that there is no preview image rather than leaving the video blank', async () => {
    await show([{ ...recording, posterUrl: null }]);
    expect(screen.getByLabelText(recording.title, { selector: 'video' })).not.toHaveAttribute('poster');
    expect(screen.getByText('No preview image')).toBeInTheDocument();
  });

  it('does not state a duration of zero', async () => {
    await show([{ ...recording, durationMs: 0 }]);
    expect(screen.queryByText(/^Duration/)).not.toBeInTheDocument();
  });
});

describe('EvidenceGallery reports', () => {
  it('shows the markdown text of a report as written, in a wrapped code block', async () => {
    await show([report]);
    const figure = screen.getByRole('figure', { name: 'Summary of the change' });
    expect(within(figure).getByText('report.md')).toBeInTheDocument();
    expect(within(figure).getByText(/## Natural-language search/)).toBeInTheDocument();
    expect(within(figure).getByRole('button', { name: 'Copy the content' })).toBeInTheDocument();
  });
});

describe('EvidenceGallery media in French', () => {
  it('says in French that the size of the images was not recorded and gives the duration of a recording', async () => {
    await show([{ ...imageCompare, width: null, height: null }, recording], { locale: 'fr' });
    expect(screen.getByText('Taille de l’image non enregistrée')).toBeInTheDocument();
    expect(screen.getByText('Durée 14 s')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir l’enregistrement' })).toBeInTheDocument();
  });
});
