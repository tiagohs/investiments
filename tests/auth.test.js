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

// 25/09/2026: troca os 2 storages globais (o Node 25 tem os dois de verdade)
// e devolve os originais no fim - cada teste escolhe se há localStorage.
function withStorages({ local = null, sessao = null }, run) {
  const originais = {
    localStorage: Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    sessionStorage: Object.getOwnPropertyDescriptor(globalThis, 'sessionStorage'),
  };
  const fake = (store) => (store ? {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  } : undefined);
  Object.defineProperty(globalThis, 'localStorage', { value: fake(local), configurable: true, writable: true });
  Object.defineProperty(globalThis, 'sessionStorage', { value: fake(sessao), configurable: true, writable: true });
  return Promise.resolve(run()).finally(() => {
    for (const nome of ['localStorage', 'sessionStorage']) {
      if (originais[nome]) Object.defineProperty(globalThis, nome, originais[nome]);
      else delete globalThis[nome];
    }
  });
}

// sem localStorage (navegador que bloqueia), o sessionStorage guarda o token
function withFakeSessionStorage(run) {
  const store = new Map();
  return withStorages({ sessao: store }, () => run(store));
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

// 25/09/2026: a sessão de vários dias fica no localStorage - sobrevive a
// fechar a aba; o sessionStorage só é lido como reserva (token de antes).
test('com localStorage: setToken() grava lá (e limpa o sessionStorage antigo); uma página nova lê de lá; clearToken() limpa', async () => {
  const local = new Map();
  const sessao = new Map();
  await withStorages({ local, sessao }, async () => {
    sessao.set(STORAGE_KEY, makeFakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 }));
    const sessao7d = `s1.${makeFakeJwt({ exp: Math.floor(Date.now() / 1000) + 7 * 86400 }).split('.')[1]}.assinatura`;
    setToken(sessao7d);
    assert.equal(local.get(STORAGE_KEY), sessao7d);
    assert.equal(sessao.has(STORAGE_KEY), false);
    const fresh = await freshAuthModule();
    assert.equal(fresh.getToken(), sessao7d, 'depois de fechar e abrir de novo');
    fresh.clearToken();
    assert.equal(local.has(STORAGE_KEY), false);
  });
});

test('com localStorage vazio, um token antigo no sessionStorage ainda vale (reserva)', async () => {
  const sessao = new Map();
  await withStorages({ local: new Map(), sessao }, async () => {
    const velho = makeFakeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
    sessao.set(STORAGE_KEY, velho);
    const fresh = await freshAuthModule();
    assert.equal(fresh.getToken(), velho);
  });
});
