// Unit tests for assets/js/carteiras-sidebar.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { atualizarBadgesSideNav, CHAVE_PAGINA_POR_NOME_CARD } from '../assets/js/carteiras-sidebar.js';

function makeDom() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <span id="sidePct-acoes"></span>
    <span id="sidePct-fiis"></span>
    <span id="sidePct-acoes-eua"></span>
    <span id="sidePct-renda-fixa"></span>
  </body></html>`);
  return dom.window.document;
}

const CARDS_EXEMPLO = [
  { nome: 'Ações', percentualDoPatrimonio: 0.2024 },
  { nome: 'FIIs', percentualDoPatrimonio: 0.24 },
  { nome: 'Ações Internacionais', percentualDoPatrimonio: 0.1147 },
  { nome: 'Renda Fixa', percentualDoPatrimonio: 0.4436 },
];

test('atualizarBadgesSideNav() preenche cada badge com o % arredondado, sem sinal', () => {
  const doc = makeDom();
  atualizarBadgesSideNav(doc, CARDS_EXEMPLO);

  assert.equal(doc.getElementById('sidePct-acoes').textContent, '20%');
  assert.equal(doc.getElementById('sidePct-fiis').textContent, '24%');
  assert.equal(doc.getElementById('sidePct-acoes-eua').textContent, '11%');
  assert.equal(doc.getElementById('sidePct-renda-fixa').textContent, '44%');
});

test('atualizarBadgesSideNav() ignora um card com `nome` desconhecido, sem lançar', () => {
  const doc = makeDom();
  assert.doesNotThrow(() => atualizarBadgesSideNav(doc, [{ nome: 'Cripto', percentualDoPatrimonio: 0.5 }]));
});

test('atualizarBadgesSideNav() não lança quando `cards` é undefined/vazio', () => {
  const doc = makeDom();
  assert.doesNotThrow(() => atualizarBadgesSideNav(doc, undefined));
  assert.doesNotThrow(() => atualizarBadgesSideNav(doc, []));
});

test('atualizarBadgesSideNav() ignora um card sem percentualDoPatrimonio numérico', () => {
  const doc = makeDom();
  atualizarBadgesSideNav(doc, [{ nome: 'Ações', percentualDoPatrimonio: null }]);
  assert.equal(doc.getElementById('sidePct-acoes').textContent, '');
});

test('CHAVE_PAGINA_POR_NOME_CARD cobre as 4 classes que action=carteirasHome devolve', () => {
  assert.deepEqual(Object.keys(CHAVE_PAGINA_POR_NOME_CARD).sort(), ['Ações', 'Ações Internacionais', 'FIIs', 'Renda Fixa'].sort());
});
