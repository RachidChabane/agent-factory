/** The browser's local storage, or null where it is blocked (private windows, cleared site data). */
export function safeLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
