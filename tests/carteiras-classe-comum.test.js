// Unit tests for assets/js/pages/carteiras-classe-comum.js — os blocos
// genéricos reaproveitados pelas 4 subpáginas de classe de Carteiras.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  renderResumoClasseCarteiras,
  renderBenchmarksClasseCarteiras,
  renderDistribuicaoGrupoCarteiras,
  renderTabelaAtivosCarteiras,
  statusVies,
} from '../assets/js/pages/carteiras-classe-comum.js';

function makeDom(bodyHtml = '') {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`);
  return dom.window.document;
}

// --- renderResumoClasseCarteiras ---------------------------------------

test('renderResumoClasseCarteiras() desenha os 4 tiles básicos com os valores formatados', () => {
  const doc = makeDom('<div id="alvo"></div>');
  const container = doc.getElementById('alvo');
  renderResumoClasseCarteiras(doc, container, {
    totalInvestido: 25657.39,
    totalAtualizado: 29968.4,
    lucroPrejuizo: 4311.01,
    percentualLucroPrejuizo: 0.168,
    quantidadeAtivos: 14,
  }, { corToken: '--acoes' });

  const tiles = container.querySelectorAll('.cc-tile');
  assert.equal(tiles.length, 4);
  assert.match(tiles[0].textContent, /Total investido/);
  assert.match(tiles[1].textContent, /Total atualizado/);
  assert.match(tiles[3].textContent, /14/);
});

test('renderResumoClasseCarteiras() marca o tile de Lucro/Prejuízo como "good" quando positivo e "bad" quando negativo', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderResumoClasseCarteiras(doc, doc.getElementById('alvo'), {
    totalInvestido: 100, totalAtualizado: 90, lucroPrejuizo: -10, percentualLucroPrejuizo: -0.1, quantidadeAtivos: 1,
  });
  const tileLucro = doc.querySelectorAll('.cc-tile')[2];
  assert.equal(tileLucro.classList.contains('bad'), true);
});

test('renderResumoClasseCarteiras() acrescenta os tiles de `extras` no final', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderResumoClasseCarteiras(doc, doc.getElementById('alvo'), {
    totalInvestido: 100, totalAtualizado: 110, lucroPrejuizo: 10, percentualLucroPrejuizo: 0.1, quantidadeAtivos: 2,
  }, { extras: [{ label: 'Proventos recebidos', valor: 'R$ 50,00' }] });

  const tiles = doc.querySelectorAll('.cc-tile');
  assert.equal(tiles.length, 5);
  assert.match(tiles[4].textContent, /Proventos recebidos/);
  assert.match(tiles[4].textContent, /R\$ 50,00/);
});

test('renderResumoClasseCarteiras() não lança quando container ou resumo faltam', () => {
  const doc = makeDom();
  assert.doesNotThrow(() => renderResumoClasseCarteiras(doc, null, {}));
  assert.doesNotThrow(() => renderResumoClasseCarteiras(doc, doc.createElement('div'), null));
});

// --- renderBenchmarksClasseCarteiras ------------------------------------

test('renderBenchmarksClasseCarteiras() desenha um chip por item', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderBenchmarksClasseCarteiras(doc, doc.getElementById('alvo'), [
    { label: 'Ibovespa hoje', valor: '128.430' },
    { label: 'CDI (a.a.)', valor: '+13,40%' },
  ]);
  const chips = doc.querySelectorAll('.cc-benchmark-chip');
  assert.equal(chips.length, 2);
  assert.match(chips[0].textContent, /Ibovespa hoje/);
  assert.match(chips[1].textContent, /\+13,40%/);
});

test('renderBenchmarksClasseCarteiras() esvazia o container quando a lista vem vazia', () => {
  const doc = makeDom('<div id="alvo">algo antigo</div>');
  renderBenchmarksClasseCarteiras(doc, doc.getElementById('alvo'), []);
  assert.equal(doc.getElementById('alvo').innerHTML, '');
});

// --- renderDistribuicaoGrupoCarteiras -----------------------------------

test('renderDistribuicaoGrupoCarteiras() converte distribuicaoPorGrupo em fatias e desenha o donut', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('alvo'), [
    { grupo: 'Bancos', totalAtualizado: 6000, percentual: 0.6 },
    { grupo: 'Energia', totalAtualizado: 4000, percentual: 0.4 },
  ]);
  const container = doc.getElementById('alvo');
  assert.ok(container.querySelector('.distrib-donut'));
  assert.equal(container.querySelectorAll('.distrib-item').length, 2);
  assert.match(container.textContent, /Bancos/);
  assert.match(container.textContent, /Energia/);
});

// --- renderTabelaAtivosCarteiras -----------------------------------------

const COLUNAS_TESTE = [
  { label: 'Ticker', formatar: (a) => a.ticker },
  { label: 'Total atualizado', alinhar: 'right', formatar: (a) => String(a.totalAtualizado) },
];

test('renderTabelaAtivosCarteiras() ordena por totalAtualizado (maior primeiro) por padrão', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderTabelaAtivosCarteiras(doc, doc.getElementById('alvo'), [
    { ticker: 'BBBB3', totalAtualizado: 1000 },
    { ticker: 'AAAA3', totalAtualizado: 5000 },
    { ticker: 'CCCC3', totalAtualizado: 2000 },
  ], COLUNAS_TESTE);

  const linhas = doc.querySelectorAll('.cc-tabela tbody tr');
  assert.equal(linhas.length, 3);
  assert.equal(linhas[0].textContent.includes('AAAA3'), true);
  assert.equal(linhas[1].textContent.includes('CCCC3'), true);
  assert.equal(linhas[2].textContent.includes('BBBB3'), true);
});

test('renderTabelaAtivosCarteiras() monta um <th> por coluna, com class="right" quando pedido', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderTabelaAtivosCarteiras(doc, doc.getElementById('alvo'), [{ ticker: 'X', totalAtualizado: 1 }], COLUNAS_TESTE);
  const ths = doc.querySelectorAll('.cc-tabela th');
  assert.equal(ths.length, 2);
  assert.equal(ths[1].classList.contains('right'), true);
  assert.equal(ths[0].classList.contains('right'), false);
});

test('renderTabelaAtivosCarteiras() mostra uma dica quando não há ativos', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderTabelaAtivosCarteiras(doc, doc.getElementById('alvo'), [], COLUNAS_TESTE);
  assert.match(doc.getElementById('alvo').textContent, /Nenhum ativo/);
});

// --- statusVies ------------------------------------------------------------

test('statusVies() reconhece "Comprar" (independente de maiúsculas) como "good"', () => {
  assert.deepEqual(statusVies('Comprar'), { texto: 'Comprar', classe: 'good' });
  assert.deepEqual(statusVies('comprar'), { texto: 'Comprar', classe: 'good' });
  assert.deepEqual(statusVies('COMPRAR'), { texto: 'Comprar', classe: 'good' });
});

test('statusVies() reconhece "Aguardar" como "warn"', () => {
  assert.deepEqual(statusVies('Aguardar'), { texto: 'Aguardar', classe: 'warn' });
});

test('statusVies() devolve travessão sem classe pra null/vazio/valor desconhecido', () => {
  assert.deepEqual(statusVies(null), { texto: '—', classe: '' });
  assert.deepEqual(statusVies(''), { texto: '—', classe: '' });
  assert.deepEqual(statusVies('outra coisa'), { texto: '—', classe: '' });
});
