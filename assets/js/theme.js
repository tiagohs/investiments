/**
 * theme.js — reads, writes and resolves the color theme (light/dark).
 *
 * Kept separate from shell.js on purpose: this is the "pure-ish" half
 * that only ever touches localStorage, matchMedia, and a single DOM
 * attribute on whatever root element it's given — easy to unit test
 * without jsdom's DOM-tree machinery. shell.js (the DOM-injection half)
 * imports this module instead of duplicating the logic.
 *
 * Every browser API call is wrapped in try/catch: private browsing,
 * disabled storage, or an old browser without matchMedia should degrade
 * to "theme just doesn't persist / falls back to system", never throw.
 */

const STORAGE_KEY = 'investiments_theme';

/** Returns 'dark' | 'light' if a preference was saved, otherwise null. */
export function readStoredTheme() {
  try {
    const value = globalThis.localStorage.getItem(STORAGE_KEY);
    return value === 'dark' || value === 'light' ? value : null;
  } catch (error) {
    return null;
  }
}

/** Persists the given theme so it survives navigating to another page. */
export function writeStoredTheme(theme) {
  try {
    globalThis.localStorage.setItem(STORAGE_KEY, theme === 'dark' ? 'dark' : 'light');
  } catch (error) {
    // storage unavailable - the toggle still works for the current page,
    // it just won't be remembered on the next one.
  }
}

function systemPrefersDark() {
  try {
    return globalThis.matchMedia('(prefers-color-scheme: dark)').matches === true;
  } catch (error) {
    return false;
  }
}

/**
 * The theme actually in effect right now. If the root element has an
 * explicit data-theme attribute that wins (the user picked it via the
 * toggle); otherwise it falls back to the OS/browser preference, which
 * is what shell.css's dark-mode media query is rendering in that case.
 */
export function currentTheme(rootElement) {
  const explicit = rootElement.getAttribute('data-theme');
  if (explicit === 'dark' || explicit === 'light') return explicit;
  return systemPrefersDark() ? 'dark' : 'light';
}

/** Sets the explicit theme on the root element (<html>, in real pages). */
export function applyTheme(rootElement, theme) {
  rootElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}

/**
 * Called once per page load. Only touches the DOM if the user
 * previously picked an explicit theme - if not, the attribute stays
 * unset and shell.css's `prefers-color-scheme` media query decides,
 * exactly like a first-time visitor with no saved preference should see.
 */
export function initTheme(rootElement) {
  const stored = readStoredTheme();
  if (stored) applyTheme(rootElement, stored);
}

/** Flips the theme, persists the choice, and returns the new value. */
export function toggleTheme(rootElement) {
  const next = currentTheme(rootElement) === 'dark' ? 'light' : 'dark';
  applyTheme(rootElement, next);
  writeStoredTheme(next);
  return next;
}
