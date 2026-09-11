// Unit tests for assets/js/auth.js. Node has no sessionStorage global, so
// the sessionStorage-mirroring tests set/delete a fake one on globalThis
// around themselves. The "fresh page load" tests import a new instance of
// the module via a cache-busting query string, so its module-level
// memoryToken genuinely starts at null instead of relying on test order.
import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  decodeTokenPayload,
  isTokenExpired,
  setToken,
  getToken,
  clearToken,
  hasValidToken,
} from '../assets/js/auth.js';

const STORAGE_KEY = 'investiments_auth_token';

function makeFakeJwt(payload) {
  const json = JSON.stringify(payload);
  const base64url = Buffer.from(json).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `fake-header.${base64url}.fake-signature`;
}

function withFakeSessionStorage(run) {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
  return Promise.resolve(run(store)).finally(() => {
    delete globalThis.sessionStorage;
  });
}

async function freshAuthModule() {
  return import(`../assets/js/auth.js?fresh=${Date.now()}-${Math.random()}`);
}

afterEach(() => {
  clearToken();
});

test('decodeTokenPayload() decodes a valid JWT payload', () => {
  const token = makeFakeJwt({ email: 'tiago@example.com', exp: 9999999999 });
  const payload = decodeTokenPayload(token);
  assert.equal(payload.email, 'tiago@example.com');
});

test('decodeTokenPayload() returns null for a malformed token', () => {
  assert.equal(decodeTokenPayload('not-a-jwt'), null);
  assert.equal(decodeTokenPayload(''), null);
});

test('isTokenExpired() is false for a token with a future exp', () => {
  const futureExp = Math.floor(Date.now() / 1000) + 3600;
  assert.equal(isTokenExpired(makeFakeJwt({ exp: futureExp })), false);
});

test('isTokenExpired() is true for a token with a past exp', () => {
  const pastExp = Math.floor(Date.now() / 1000) - 10;
  assert.equal(isTokenExpired(makeFakeJwt({ exp: pastExp })), true);
});

test('isTokenExpired() is true for null, malformed, or missing-exp tokens', () => {
  assert.equal(isTokenExpired(null), true);
  assert.equal(isTokenExpired(undefined), true);
  assert.equal(isTokenExpired('garbage'), true);
  assert.equal(isTokenExpired(makeFakeJwt({ email: 'no-exp-claim' })), true);
});

test('setToken()/getToken() round-trip in memory', () => {
  const token = makeFakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
  setToken(token);
  assert.equal(getToken(), token);
});

test('getToken() returns null when nothing was set', () => {
  assert.equal(getToken(), null);
});

test('getToken() auto-clears and returns null for an expired token', () => {
  const expiredToken = makeFakeJwt({ exp: Math.floor(Date.now() / 1000) - 1 });
  setToken(expiredToken);
  assert.equal(getToken(), null);
  assert.equal(getToken(), null); // stays null, doesn't throw on the 2nd call either
});

test('clearToken() removes the in-memory token', () => {
  setToken(makeFakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }));
  clearToken();
  assert.equal(getToken(), null);
});

test('hasValidToken() reflects whether a valid token is set', () => {
  assert.equal(hasValidToken(), false);
  setToken(makeFakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }));
  assert.equal(hasValidToken(), true);
});

test('setToken() mirrors the token into sessionStorage when available', async () => {
  await withFakeSessionStorage((store) => {
    const token = makeFakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    setToken(token);
    assert.equal(store.get(STORAGE_KEY), token);
  });
});

test('clearToken() removes the mirrored token from sessionStorage too', async () => {
  await withFakeSessionStorage((store) => {
    setToken(makeFakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    clearToken();
    assert.equal(store.has(STORAGE_KEY), false);
  });
});

test('getToken() falls back to sessionStorage on a fresh module load (simulating a page reload)', async () => {
  await withFakeSessionStorage(async (store) => {
    const token = makeFakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    store.set(STORAGE_KEY, token);

    const fresh = await freshAuthModule();
    assert.equal(fresh.getToken(), token);
  });
});

test('getToken() on a fresh module load discards an expired token found in sessionStorage', async () => {
  await withFakeSessionStorage(async (store) => {
    const expiredToken = makeFakeJwt({ exp: Math.floor(Date.now() / 1000) - 10 });
    store.set(STORAGE_KEY, expiredToken);

    const fresh = await freshAuthModule();
    assert.equal(fresh.getToken(), null);
  });
});
