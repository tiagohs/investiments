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

// 19/09/2026 #4 (pedido do Tiago revisando o resultado): trocou a grade
// de 4-5 "tiles" iguais por 1 cartão .cc-resumo, estilo cotação - Total
// atualizado em destaque + Total investido embaixo, com um grupo de
// stats (Lucro/Prejuízo, Ativos na carteira, + `extras`) do lado.

test('renderResumoClasseCarteiras() desenha o cartão com Total atualizado em destaque, Total investido embaixo, e os stats de Lucro/Prejuízo + Ativos na carteira', () => {
  const doc = makeDom('<div id="alvo"></div>');
  const container = doc.getElementById('alvo');
  renderResumoClasseCarteiras(doc, container, {
    totalInvestido: 25657.39,
    totalAtualizado: 29968.4,
    lucroPrejuizo: 4311.01,
    percentualLucroPrejuizo: 0.168,
    quantidadeAtivos: 14,
  }, { corToken: '--acoes' });

  assert.equal(container.querySelectorAll('.cc-resumo').length, 1);
  assert.match(container.querySelector('.cc-resumo-valor').textContent, /29\.968,40/);
  assert.match(container.querySelector('.cc-resumo-investido').textContent, /Investido/);
  assert.match(container.querySelector('.cc-resumo-investido').textContent, /25\.657,39/);

  const stats = container.querySelectorAll('.cc-resumo-stat');
  assert.equal(stats.length, 2);
  assert.match(stats[0].textContent, /Lucro \/ Prejuízo/);
  assert.match(stats[1].textContent, /Ativos na carteira/);
  assert.match(stats[1].textContent, /14/);
});

test('renderResumoClasseCarteiras() marca o stat de Lucro/Prejuízo como "good" quando positivo e "bad" quando negativo', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderResumoClasseCarteiras(doc, doc.getElementById('alvo'), {
    totalInvestido: 100, totalAtualizado: 90, lucroPrejuizo: -10, percentualLucroPrejuizo: -0.1, quantidadeAtivos: 1,
  });
  const statLucro = doc.querySelectorAll('.cc-resumo-stat')[0];
  assert.equal(statLucro.classList.contains('bad'), true);
});

test('renderResumoClasseCarteiras() acrescenta os stats de `extras` no final', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderResumoClasseCarteiras(doc, doc.getElementById('alvo'), {
    totalInvestido: 100, totalAtualizado: 110, lucroPrejuizo: 10, percentualLucroPrejuizo: 0.1, quantidadeAtivos: 2,
  }, { extras: [{ label: 'Proventos recebidos', valor: 'R$ 50,00' }] });

  const stats = doc.querySelectorAll('.cc-resumo-stat');
  assert.equal(stats.length, 3);
  assert.match(stats[2].textContent, /Proventos recebidos/);
  assert.match(stats[2].textContent, /R\$ 50,00/);
});

test('renderResumoClasseCarteiras() usa `formatarValor` (ex.: formatUSD em Ações EUA) pros valores principais e do stat de Lucro/Prejuízo', () => {
  const doc = makeDom('<div id="alvo"></div>');
  const container = doc.getElementById('alvo');
  const formatarValor = (v) => `US$ ${v.toFixed(2)}`;
  renderResumoClasseCarteiras(doc, container, {
    totalInvestido: 100, totalAtualizado: 110, lucroPrejuizo: 10, percentualLucroPrejuizo: 0.1, quantidadeAtivos: 2,
  }, { formatarValor });

  assert.match(container.querySelector('.cc-resumo-valor').textContent, /US\$ 110\.00/);
  assert.match(container.querySelector('.cc-resumo-investido').textContent, /US\$ 100\.00/);
  assert.match(container.querySelectorAll('.cc-resumo-stat')[0].textContent, /US\$ 10\.00/);
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
  { label: 'Ticker', alinharEsquerda: true, formatar: (a) => a.ticker },
  { label: 'Total atualizado', formatar: (a) => String(a.totalAtualizado) },
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

// 19/09/2026 #4 (pedido do Tiago: "todas as colunas, tirando o Ativo,
// centralize o conteúdo. Em ativo, só centralize o título") - conteúdo
// centralizado é o padrão do CSS (.cc-tabela th/td), então nenhum <th>
// jamais ganha classe de alinhamento; só a CÉLULA (<td>) da coluna com
// `alinharEsquerda:true` ganha .cc-td-esquerda.
test('renderTabelaAtivosCarteiras() monta um <th> por coluna, sem nenhuma classe de alinhamento (centraliza por padrão via CSS)', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderTabelaAtivosCarteiras(doc, doc.getElementById('alvo'), [{ ticker: 'X', totalAtualizado: 1 }], COLUNAS_TESTE);
  const ths = doc.querySelectorAll('.cc-tabela th');
  assert.equal(ths.length, 2);
  assert.equal(ths[0].classList.contains('cc-td-esquerda'), false);
  assert.equal(ths[1].classList.contains('cc-td-esquerda'), false);
});

test('renderTabelaAtivosCarteiras() só a célula da coluna com `alinharEsquerda:true` ganha .cc-td-esquerda', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderTabelaAtivosCarteiras(doc, doc.getElementById('alvo'), [{ ticker: 'X', totalAtualizado: 1 }], COLUNAS_TESTE);
  const tds = doc.querySelectorAll('.cc-tabela tbody td');
  assert.equal(tds.length, 2);
  assert.equal(tds[0].classList.contains('cc-td-esquerda'), true); // Ticker
  assert.equal(tds[1].classList.contains('cc-td-esquerda'), false); // Total atualizado
});

test('renderTabelaAtivosCarteiras() clique no cabeçalho ordena, mas clique num ícone ".info-alvo" dentro dele não', () => {
  const doc = makeDom('<div id="alvo"></div>');
  const colunas = [
    { label: 'Ticker', campo: 'ticker', ordenarPor: (a) => a.ticker, alinharEsquerda: true, formatar: (a) => a.ticker },
    { label: 'Total', campo: 'totalAtualizado', ordenarPor: (a) => a.totalAtualizado, ajuda: 'ajuda aqui', formatar: (a) => String(a.totalAtualizado) },
  ];
  let ordenarChamadoCom = null;
  renderTabelaAtivosCarteiras(doc, doc.getElementById('alvo'), [
    { ticker: 'AAAA3', totalAtualizado: 1 },
    { ticker: 'BBBB3', totalAtualizado: 2 },
  ], colunas, { onOrdenar: (campo) => { ordenarChamadoCom = campo; } });

  const icone = doc.querySelector('.cc-tabela thead .info-alvo');
  assert.ok(icone, 'coluna com `ajuda` deveria ter o ícone .info-alvo no cabeçalho');
  icone.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(ordenarChamadoCom, null, 'clicar no ícone de ajuda não deveria chamar onOrdenar');

  const th = doc.querySelector('.cc-tabela thead th[data-campo="totalAtualizado"]');
  th.dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  assert.equal(ordenarChamadoCom, 'totalAtualizado');
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
