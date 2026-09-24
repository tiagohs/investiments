// tests/cache-dados.test.js - 25/09/2026: cache das respostas no navegador
// (assets/js/cache-dados.js). Em Node não há IndexedDB: os testes usam um
// Map (usarMemoriaNoCacheDados) - mesma API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lerCacheDados, gravarCacheDados, limparCacheDados, criarGetHomeCompartilhado, usarMemoriaNoCacheDados } from '../assets/js/cache-dados.js';

function comSessionFalso(run) {
  const store = new Map();
  usarMemoriaNoCacheDados(store);
  return Promise.resolve(run(store)).finally(() => usarMemoriaNoCacheDados(null));
}

test('grava e lê de volta com a data; velho demais não volta; limpar apaga', async () => {
  await comSessionFalso(async (store) => {
    await gravarCacheDados('x', { a: 1 });
    const r = await lerCacheDados('x');
    assert.deepEqual(r.dados, { a: 1 });
    assert.ok(Date.now() - r.ts < 5000);
    assert.equal(await lerCacheDados('nunca'), null);
    store.set('velho', JSON.stringify({ ts: Date.now() - 10 * 86400000, dados: { b: 2 } }));
    assert.equal(await lerCacheDados('velho'), null, 'mais de uma semana');
    assert.deepEqual((await lerCacheDados('velho', { maxIdadeMs: 30 * 86400000 })).dados, { b: 2 });
    await limparCacheDados();
    assert.equal(await lerCacheDados('x'), null);
  });
});

test('sem armazenamento nenhum: não quebra, só não cacheia', async () => {
  await gravarCacheDados('y', { a: 1 });
  assert.equal(await lerCacheDados('y'), null);
});

test('getHome compartilhado: várias subpáginas ao mesmo tempo = 1 chamada; resposta boa vai pro cache "home"; erro não fica guardado; depois da validade busca de novo', async () => {
  await comSessionFalso(async () => {
    let chamadas = 0;
    let t = 1000;
    let proxima = { ok: true, historico: [1, 2] };
    const get = criarGetHomeCompartilhado(async () => { chamadas += 1; return proxima; }, { validadeMs: 30000, agora: () => t });
    const [a, b, c] = await Promise.all([get('tk'), get('tk'), get('tk')]);
    assert.equal(chamadas, 1);
    assert.equal(a, b);
    assert.equal(b, c);
    assert.deepEqual((await lerCacheDados('home')).dados, { ok: true, historico: [1, 2] });
    t += 31000;
    proxima = { ok: false, erro: 'x' };
    assert.equal((await get('tk')).ok, false);
    assert.equal(chamadas, 2);
    proxima = { ok: true, historico: [3] };
    assert.deepEqual((await get('tk')).historico, [3], 'depois de um erro, a próxima chamada busca de novo');
    assert.equal(chamadas, 3);
  });
});
