// Unit tests for assets/js/theme.js. This module is deliberately "pure-ish"
// (no real DOM needed) - the root element passed in is a tiny fake object
// with getAttribute/setAttribute, and localStorage/matchMedia are faked on
// globalThis around each test, following the same pattern as auth.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  readStoredTheme,
  writeStoredTheme,
  currentTheme,
  applyTheme,
  initTheme,
  toggleTheme,
} from '../assets/js/theme.js';

const STORAGE_KEY = 'investiments_theme';

function fakeRootElement(initialTheme = null) {
  let attr = initialTheme;
  return {
    getAttribute: (name) => (name === 'data-theme' ? attr : null),
    setAttribute: (name, value) => {
      if (name === 'data-theme') attr = value;
    },
  };
}

function withFakeLocalStorage(run) {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
  try {
    return run(store);
  } finally {
    delete globalThis.localStorage;
  }
}

function withBrokenLocalStorage(run) {
  globalThis.localStorage = {
    getItem: () => { throw new Error('storage disabled'); },
    setItem: () => { throw new Error('storage disabled'); },
  };
  try {
    return run();
  } finally {
    delete globalThis.localStorage;
  }
}

function withSystemPrefersDark(prefersDark, run) {
  globalThis.matchMedia = (query) => ({
    matches: query === '(prefers-color-scheme: dark)' && prefersDark,
  });
  try {
    return run();
  } finally {
    delete globalThis.matchMedia;
  }
}

function withBrokenMatchMedia(run) {
  globalThis.matchMedia = () => { throw new Error('matchMedia unavailable'); };
  try {
    return run();
  } finally {
    delete globalThis.matchMedia;
  }
}

// --- readStoredTheme --------------------------------------------------

test('readStoredTheme() returns null when nothing was stored', () => {
  withFakeLocalStorage(() => {
    assert.equal(readStoredTheme(), null);
  });
});

test('readStoredTheme() returns the stored value when it is dark or light', () => {
  withFakeLocalStorage((store) => {
    store.set(STORAGE_KEY, 'dark');
    assert.equal(readStoredTheme(), 'dark');
    store.set(STORAGE_KEY, 'light');
    assert.equal(readStoredTheme(), 'light');
  });
});

test('readStoredTheme() returns null for an invalid stored value', () => {
  withFakeLocalStorage((store) => {
    store.set(STORAGE_KEY, 'purple');
    assert.equal(readStoredTheme(), null);
  });
});

test('readStoredTheme() returns null instead of throwing when localStorage is unavailable', () => {
  withBrokenLocalStorage(() => {
    assert.equal(readStoredTheme(), null);
  });
});

// --- writeStoredTheme ---------------------------------------------------

test('writeStoredTheme() persists "dark" as given', () => {
  withFakeLocalStorage((store) => {
    writeStoredTheme('dark');
    assert.equal(store.get(STORAGE_KEY), 'dark');
  });
});

test('writeStoredTheme() normalizes anything that is not "dark" to "light"', () => {
  withFakeLocalStorage((store) => {
    writeStoredTheme('light');
    assert.equal(store.get(STORAGE_KEY), 'light');
    writeStoredTheme('nonsense');
    assert.equal(store.get(STORAGE_KEY), 'light');
  });
});

test('writeStoredTheme() does not throw when localStorage is unavailable', () => {
  withBrokenLocalStorage(() => {
    assert.doesNotThrow(() => writeStoredTheme('dark'));
  });
});

// --- currentTheme --------------------------------------------------------

test('currentTheme() returns the explicit data-theme attribute when set', () => {
  withSystemPrefersDark(false, () => {
    assert.equal(currentTheme(fakeRootElement('dark')), 'dark');
    assert.equal(currentTheme(fakeRootElement('light')), 'light');
  });
});

test('currentTheme() falls back to the system preference when no explicit attribute is set', () => {
  withSystemPrefersDark(true, () => {
    assert.equal(currentTheme(fakeRootElement(null)), 'dark');
  });
  withSystemPrefersDark(false, () => {
    assert.equal(currentTheme(fakeRootElement(null)), 'light');
  });
});

test('currentTheme() ignores an invalid explicit attribute and falls back to system preference', () => {
  withSystemPrefersDark(true, () => {
    assert.equal(currentTheme(fakeRootElement('purple')), 'dark');
  });
});

test('currentTheme() falls back to light when matchMedia is unavailable', () => {
  withBrokenMatchMedia(() => {
    assert.equal(currentTheme(fakeRootElement(null)), 'light');
  });
});

// --- applyTheme ------------------------------------------------------------

test('applyTheme() sets data-theme to "dark" as given', () => {
  const root = fakeRootElement(null);
  applyTheme(root, 'dark');
  assert.equal(root.getAttribute('data-theme'), 'dark');
});

test('applyTheme() normalizes anything that is not "dark" to "light"', () => {
  const root = fakeRootElement(null);
  applyTheme(root, 'anything-else');
  assert.equal(root.getAttribute('data-theme'), 'light');
});

// --- initTheme ---------------------------------------------------------

test('initTheme() applies the stored theme to the root element when one was saved', () => {
  withFakeLocalStorage((store) => {
    store.set(STORAGE_KEY, 'dark');
    const root = fakeRootElement(null);
    initTheme(root);
    assert.equal(root.getAttribute('data-theme'), 'dark');
  });
});

test('initTheme() leaves the root element untouched when no theme was saved', () => {
  withFakeLocalStorage(() => {
    const root = fakeRootElement(null);
    initTheme(root);
    assert.equal(root.getAttribute('data-theme'), null);
  });
});

// --- toggleTheme -------------------------------------------------------

test('toggleTheme() flips light to dark, persists it, and returns the new value', () => {
  withFakeLocalStorage((store) => {
    withSystemPrefersDark(false, () => {
      const root = fakeRootElement('light');
      const next = toggleTheme(root);
      assert.equal(next, 'dark');
      assert.equal(root.getAttribute('data-theme'), 'dark');
      assert.equal(store.get(STORAGE_KEY), 'dark');
    });
  });
});

test('toggleTheme() flips dark to light, persists it, and returns the new value', () => {
  withFakeLocalStorage((store) => {
    withSystemPrefersDark(false, () => {
      const root = fakeRootElement('dark');
      const next = toggleTheme(root);
      assert.equal(next, 'light');
      assert.equal(root.getAttribute('data-theme'), 'light');
      assert.equal(store.get(STORAGE_KEY), 'light');
    });
  });
});

test('toggleTheme() with no explicit theme yet toggles away from the system preference', () => {
  withFakeLocalStorage((store) => {
    withSystemPrefersDark(true, () => {
      // system prefers dark, so the current effective theme is 'dark' -> toggling goes to 'light'
      const root = fakeRootElement(null);
      const next = toggleTheme(root);
      assert.equal(next, 'light');
      assert.equal(store.get(STORAGE_KEY), 'light');
    });
  });
});
