export const FFMPEG_EXECUTABLE = 'ffmpeg';
export const TRANSCODE_TIMEOUT_MS = 10 * 60_000;
export const MILLISECONDS_PER_MINUTE = 60_000;

/** The video formats a film command may write; the largest one is the film. */
export const VIDEO_EXTENSIONS: readonly string[] = ['.mp4', '.webm', '.mov', '.mkv'];
/** The screenshot formats a film command may write; the last one in path order is the final screenshot. */
export const SCREENSHOT_EXTENSIONS: readonly string[] = ['.png', '.jpg', '.jpeg', '.webp', '.svg'];

/** The key frames a report may name, besides the final screenshot. */
export const MAX_KEY_FRAMES = 6;
export const MAX_FACTS = 20;
export const MAX_FACT_LABEL_CHARACTERS = 80;
export const MAX_FACT_VALUE_CHARACTERS = 240;
export const TRUNCATION_MARK = '…';

