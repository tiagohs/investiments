// Unit tests for assets/js/carteiras-cache.js. Mesmo padrão de
// tests/theme.test.js (fake globalThis.sessionStorage num Map, sem jsdom -
// o módulo não toca em DOM nenhum).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerCacheCarteiras, gravarCacheCarteiras } from '../assets/js/carteiras-cache.js';

function withFakeSessionStorage(run) {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
  try {
    return run(store);
  } finally {
    delete globalThis.sessionStorage;
  }
}

test('gravarCacheCarteiras() + lerCacheCarteiras() faz round-trip do dado dentro do TTL', () => {
  withFakeSessionStorage(() => {
    gravarCacheCarteiras('chave-x', { a: 1, b: 'texto' });
    const lido = lerCacheCarteiras('chave-x', 5 * 60 * 1000);
    assert.deepEqual(lido, { a: 1, b: 'texto' });
  });
});

test('lerCacheCarteiras() devolve null quando a chave nunca foi gravada', () => {
  withFakeSessionStorage(() => {
    assert.equal(lerCacheCarteiras('nunca-existiu'), null);
  });
});

test('lerCacheCarteiras() devolve null quando o registro passou do TTL', () => {
  withFakeSessionStorage((store) => {
    const dezMinutosAtras = Date.now() - 10 * 60 * 1000;
    store.set('chave-velha', JSON.stringify({ ts: dezMinutosAtras, dados: { a: 1 } }));
    assert.equal(lerCacheCarteiras('chave-velha', 5 * 60 * 1000), null);
  });
});

test('lerCacheCarteiras() devolve null pra JSON corrompido, sem lançar erro', () => {
  withFakeSessionStorage((store) => {
    store.set('chave-corrompida', '{ isso não é json válido');
    assert.equal(lerCacheCarteiras('chave-corrompida'), null);
  });
});

test('lerCacheCarteiras() devolve null quando sessionStorage não existe (modo privado etc.), sem lançar', () => {
  assert.equal(lerCacheCarteiras('qualquer-chave'), null);
});

test('gravarCacheCarteiras() não lança quando sessionStorage não existe', () => {
  assert.doesNotThrow(() => gravarCacheCarteiras('qualquer-chave', { a: 1 }));
});
