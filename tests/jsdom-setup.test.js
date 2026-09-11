// Sanity check that jsdom is wired up correctly, before any real shell.js
// test depends on it. Not a permanent fixture — safe to remove once the
// shell.js DOM tests (item 8g) exist and exercise the same setup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

test('jsdom builds a working DOM we can query and mutate', () => {
  const dom = new JSDOM('<!doctype html><body><div id="app"></div></body>');
  const { document } = dom.window;

  const app = document.getElementById('app');
  app.innerHTML = '<p class="hello">oi</p>';

  const p = document.querySelector('.hello');
  assert.equal(p.textContent, 'oi');
});
