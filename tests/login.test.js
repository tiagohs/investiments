// Unit tests for assets/js/pages/login.js - the dedicated login page's
// logic (shared by both visual variants, login.html/login-b.html).
// getTokenImpl/mountAuthGateImpl are injected fakes, same pattern as
// shell.test.js's setupAuthGate tests - no real sessionStorage, no real
// Google script.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolverDestino, montarPaginaLogin } from '../assets/js/pages/login.js';

function fakeWin(url) {
  const parsed = new URL(url);
  let href = url;
  return {
    location: {
      get search() { return parsed.search; },
      set href(v) { href = v; },
      get href() { return href; },
    },
  };
}

// --- resolverDestino (proteção contra open redirect) ------------------------

test('resolverDestino() returns the redirect param when it is a plain relative path', () => {
  assert.equal(resolverDestino(new URLSearchParams('redirect=carteiras%2Facoes.html')), 'carteiras/acoes.html');
});

test('resolverDestino() falls back to index.html when there is no redirect param', () => {
  assert.equal(resolverDestino(new URLSearchParams('')), 'index.html');
});

test('resolverDestino() refuses a protocol-relative URL (//host/...) - never an open redirect off-site', () => {
  assert.equal(resolverDestino(new URLSearchParams('redirect=' + encodeURIComponent('//evil.example.com/phish'))), 'index.html');
});

test('resolverDestino() refuses an absolute URL with any scheme, not just http(s)', () => {
  assert.equal(resolverDestino(new URLSearchParams('redirect=' + encodeURIComponent('https://evil.example.com'))), 'index.html');
  assert.equal(resolverDestino(new URLSearchParams('redirect=' + encodeURIComponent('javascript:alert(1)'))), 'index.html');
});

test('resolverDestino() accepts a custom fallback', () => {
  assert.equal(resolverDestino(new URLSearchParams(''), 'outra-pagina.html'), 'outra-pagina.html');
});

// --- montarPaginaLogin -------------------------------------------------------

test('montarPaginaLogin() redirects immediately, without touching the GIS wiring, when a valid token already exists', async () => {
  const win = fakeWin('https://example.com/login.html?redirect=carteiras%2Facoes.html');
  let mountCalled = false;

  await montarPaginaLogin({
    win,
    doc: {},
    getTokenImpl: () => 'token-existente',
    mountAuthGateImpl: () => { mountCalled = true; },
  });

  assert.equal(win.location.href, 'carteiras/acoes.html');
  assert.equal(mountCalled, false);
});

test('montarPaginaLogin() wires the sign-in button and redirects to the target once login succeeds (onReady)', async () => {
  const win = fakeWin('https://example.com/login.html?redirect=carteiras%2Facoes.html');

  await montarPaginaLogin({
    win,
    doc: {},
    getTokenImpl: () => null,
    mountAuthGateImpl: ({ onReady }) => onReady('token-recem-logado'),
  });

  assert.equal(win.location.href, 'carteiras/acoes.html');
});

test('montarPaginaLogin() redirects to index.html by default when opened with no ?redirect= at all', async () => {
  const win = fakeWin('https://example.com/login.html');

  await montarPaginaLogin({
    win,
    doc: {},
    getTokenImpl: () => 'token-existente',
    mountAuthGateImpl: () => {},
  });

  assert.equal(win.location.href, 'index.html');
});
