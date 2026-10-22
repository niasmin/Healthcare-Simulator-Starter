import { lazy, type ComponentType } from 'react';

const RELOAD_KEY = 'he.chunkReload';
/** Reload at most once a minute, so a real outage shows the error screen instead of looping. */
const RELOAD_GAP_MS = 60_000;

/**
 * After a new deploy, a page opened before it asks for build files that no longer exist (their
 * names carry a hash). Reload once to pick up the new version; the game is saved in the browser.
 * Returns false when it already reloaded a moment ago.
 */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < RELOAD_GAP_MS) return false;
    sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // No session storage: still try once.
  }
  window.location.reload();
  return true;
}

/** React.lazy that tries the import twice, then reloads the page for the new version. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function lazyWithReload<T extends ComponentType<any>>(load: () => Promise<{ default: T }>) {
  return lazy(() =>
    load().catch(() =>
      load().catch((err) => {
        if (reloadForNewVersion()) return new Promise<{ default: T }>(() => undefined);
        throw err;
      }),
    ),
  );
}
