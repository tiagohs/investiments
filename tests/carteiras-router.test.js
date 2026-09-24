// Unit tests for assets/js/carteiras-router.js — mesmo espírito de
// tests/router.test.js (rotas FAKE, nunca as páginas reais de Carteiras)
// pra testar só o comportamento do sub-router em si (troca de "aba" sem
// reload, mount 1x só por página, sidebar refletindo a página ativa).
// As páginas reais (montarPaginaCarteirasVisaoGeral etc.) são cobertas
// nos próprios arquivos de teste de cada uma.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { mountCarteirasRouter } from '../assets/js/carteiras-router.js';

function fakePaginas({ mountA, mountB, mountC } = {}) {
  return [
    { key: 'a', titulo: 'Página A', mount: mountA || (async () => {}) },
    { key: 'b', titulo: 'Página B', mount: mountB || (async () => {}) },
    { key: 'c', titulo: 'Página C', mount: mountC || (async () => {}) },
  ];
}

function makeDom() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <h2 id="carteirasMobileTitle"></h2>
    <nav id="sideNav">
      <button class="side-item active" type="button" data-page="a">A</button>
      <button class="side-item" type="button" data-page="b">B</button>
      <button class="side-item" type="button" data-page="c">C</button>
    </nav>
    <section id="page-a"></section>
    <section id="page-b" hidden></section>
    <section id="page-c" hidden></section>
  </body></html>`);
  return dom.window.document;
}

test('mountCarteirasRouter() monta a 1ª página da lista e só ela fica visível', async () => {
  const doc = makeDom();
  const chamadas = [];
  await mountCarteirasRouter(doc, {
    token: 'token-fake',
    paginas: fakePaginas({ mountA: async () => chamadas.push('a') }),
  });

  assert.deepEqual(chamadas, ['a']);
  assert.equal(doc.getElementById('page-a').hidden, false);
  assert.equal(doc.getElementById('page-b').hidden, true);
  assert.equal(doc.getElementById('page-c').hidden, true);
  assert.equal(doc.querySelector('.side-item[data-page="a"]').classList.contains('active'), true);
  assert.equal(doc.getElementById('carteirasMobileTitle').textContent, 'Página A');
});

test('mountCarteirasRouter(): clicar num item da sidebar troca de página sem re-montar a anterior', async () => {
  const doc = makeDom();
  const chamadas = [];
  await mountCarteirasRouter(doc, {
    token: 'token-fake',
    paginas: fakePaginas({
      mountA: async () => chamadas.push('a'),
      mountB: async () => chamadas.push('b'),
    }),
  });

  doc.querySelector('.side-item[data-page="b"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await Promise.resolve();
  await Promise.resolve();

  assert.deepEqual(chamadas, ['a', 'b']);
  assert.equal(doc.getElementById('page-a').hidden, true);
  assert.equal(doc.getElementById('page-b').hidden, false);
  assert.equal(doc.querySelector('.side-item[data-page="a"]').classList.contains('active'), false);
  assert.equal(doc.querySelector('.side-item[data-page="b"]').classList.contains('active'), true);
  assert.equal(doc.getElementById('carteirasMobileTitle').textContent, 'Página B');
});

test('mountCarteirasRouter(): mount() de cada página só roda 1x, mesmo revisitando várias vezes', async () => {
  const doc = makeDom();
  const chamadas = [];
  await mountCarteirasRouter(doc, {
    token: 'token-fake',
    paginas: fakePaginas({
      mountA: async () => chamadas.push('a'),
      mountB: async () => chamadas.push('b'),
    }),
  });

  const clicar = async (key) => {
    doc.querySelector(`.side-item[data-page="${key}"]`).dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  };

  await clicar('b');
  await clicar('a');
  await clicar('b');
  await clicar('b'); // já está em b - clique redundante, não deve fazer nada

  assert.deepEqual(chamadas, ['a', 'b']); // cada mount() só apareceu 1 vez, mesmo com 4 trocas
});

test('mountCarteirasRouter(): token é repassado pra mount() de cada página', async () => {
  const doc = makeDom();
  let tokenRecebido = null;
  await mountCarteirasRouter(doc, {
    token: 'token-123',
    paginas: fakePaginas({ mountA: async (token) => { tokenRecebido = token; } }),
  });
  assert.equal(tokenRecebido, 'token-123');
});

test('mountCarteirasRouter(): erro no mount() de uma página não impede trocar pra outra depois', async () => {
  const doc = makeDom();
  const chamadas = [];
  const originalError = console.error;
  console.error = () => {};
  try {
    await mountCarteirasRouter(doc, {
      token: 'token-fake',
      paginas: fakePaginas({
        mountA: async () => { throw new Error('falhou de propósito'); },
        mountB: async () => chamadas.push('b'),
      }),
    });
    doc.querySelector('.side-item[data-page="b"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  } finally {
    console.error = originalError;
  }

  assert.deepEqual(chamadas, ['b']);
  assert.equal(doc.getElementById('page-b').hidden, false);
});

// 25/09/2026: a subpágina vai pro endereço (#b) - a tela do ativo volta
// direto pra ela ("Carteiras › Ações") e recarregar a página não perde.
test('mountCarteirasRouter(): abre a subpágina do endereço (#c) e troca o # ao clicar', async () => {
  const dom = new JSDOM(`<!doctype html><html><body>
    <h2 id="carteirasMobileTitle"></h2>
    <button class="side-item active" type="button" data-page="a">A</button>
    <button class="side-item" type="button" data-page="b">B</button>
    <button class="side-item" type="button" data-page="c">C</button>
    <section id="page-a"></section><section id="page-b" hidden></section><section id="page-c" hidden></section>
  </body></html>`, { url: 'https://exemplo.test/carteiras/index.html#c' });
  const doc = dom.window.document;
  const chamadas = [];
  await mountCarteirasRouter(doc, { token: 't', paginas: fakePaginas({ mountA: async () => chamadas.push('a'), mountC: async () => chamadas.push('c') }) });
  assert.deepEqual(chamadas, ['c'], 'não monta a 1ª à toa');
  assert.equal(doc.getElementById('page-c').hidden, false);
  doc.querySelector('.side-item[data-page="b"]').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(dom.window.location.hash, '#b');
  doc.querySelector('.side-item[data-page="a"]').click();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(dom.window.location.hash, '', 'a 1ª (Visão geral) fica sem #');
});
