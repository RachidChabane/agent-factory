const CHUNK_LOAD_FAILURE_MESSAGES: readonly RegExp[] = [
  /Failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /Importing a module script failed/i,
  /Unable to preload CSS/i,
];

/** Whether an error says that a lazy chunk of the application could not be loaded: a new version replaced the one the page holds. */
export function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return CHUNK_LOAD_FAILURE_MESSAGES.some((pattern) => pattern.test(message));
}
