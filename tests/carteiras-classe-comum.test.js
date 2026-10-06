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
  contarVies_,
  equivalenteBrlHtml_,
} from '../assets/js/pages/carteiras-classe-comum.js';

function makeDom(bodyHtml = '') {
  const dom = new JSDOM(`<!doctype html><html><body>${bodyHtml}</body></html>`, { pretendToBeVisual: true });
  // movimento reduzido: os números dos KPIs saem finais (sem animação a partir de 0)
  dom.window.matchMedia = (q) => ({ matches: /prefers-reduced-motion/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  return dom.window.document;
}

// --- renderResumoClasseCarteiras ---------------------------------------

// 06/10/2026 (Onda 3, kit Material 3): o resumo da classe virou uma grade de cards KPI (montarKpis / criarKpi da biblioteca de
// gráficos): "Valor atual" (com "Valor aplicado" embaixo), "Lucro / Prejuízo" (com % e seta), os `extras` e "Ativos na carteira".
const kpis = (container) => [...container.querySelectorAll('.card-kpi')];
const rotuloKpi = (k) => k.querySelector('.chart-kpi-rot').textContent;
const valorKpi = (k) => k.querySelector('.chart-kpi-val').textContent;

test('renderResumoClasseCarteiras() desenha os KPIs: Valor atual com o valor aplicado embaixo, Lucro/Prejuízo com % e Ativos na carteira', () => {
  const doc = makeDom('<div id="alvo"></div>');
  const container = doc.getElementById('alvo');
  renderResumoClasseCarteiras(doc, container, {
    totalInvestido: 25657.39,
    totalAtualizado: 29968.4,
    lucroPrejuizo: 4311.01,
    percentualLucroPrejuizo: 0.168,
    quantidadeAtivos: 14,
  }, { corToken: '--acoes' });

  assert.ok(container.classList.contains('grid-kpi'));
  const lista = kpis(container);
  assert.equal(lista.length, 3);
  assert.equal(rotuloKpi(lista[0]), 'Valor atual');
  assert.match(valorKpi(lista[0]), /29\.968,40/);
  assert.match(lista[0].querySelector('.cg-kpi-sub').textContent, /Valor aplicado: R\$\s*25\.657,39/);
  assert.match(rotuloKpi(lista[1]), /Lucro \/ Prejuízo/);
  assert.match(valorKpi(lista[1]), /4\.311,01/);
  assert.match(lista[1].querySelector('.chart-kpi-delta').textContent, /\+16,80%/);
  assert.match(rotuloKpi(lista[2]), /Ativos na carteira/);
  assert.equal(valorKpi(lista[2]), '14');
});

test('renderResumoClasseCarteiras() marca o delta do Lucro/Prejuízo como alta (is-up) quando positivo e queda (is-down) quando negativo', () => {
  const doc = makeDom('<div id="alvo"></div><div id="b"></div>');
  renderResumoClasseCarteiras(doc, doc.getElementById('alvo'), {
    totalInvestido: 100, totalAtualizado: 90, lucroPrejuizo: -10, percentualLucroPrejuizo: -0.1, quantidadeAtivos: 1,
  });
  assert.ok(kpis(doc.getElementById('alvo'))[1].querySelector('.chart-kpi-delta').classList.contains('is-down'));
  renderResumoClasseCarteiras(doc, doc.getElementById('b'), {
    totalInvestido: 100, totalAtualizado: 110, lucroPrejuizo: 10, percentualLucroPrejuizo: 0.1, quantidadeAtivos: 1,
  });
  assert.ok(kpis(doc.getElementById('b'))[1].querySelector('.chart-kpi-delta').classList.contains('is-up'));
});

test('renderResumoClasseCarteiras() acrescenta os KPIs de `extras` antes de "Ativos na carteira"', () => {
  const doc = makeDom('<div id="alvo"></div>');
  const container = doc.getElementById('alvo');
  renderResumoClasseCarteiras(doc, container, {
    totalInvestido: 100, totalAtualizado: 110, lucroPrejuizo: 10, percentualLucroPrejuizo: 0.1, quantidadeAtivos: 2,
  }, { extras: [{ rotulo: 'Proventos recebidos', valor: 'R$ 50,00' }] });

  const lista = kpis(container);
  assert.equal(lista.length, 4);
  assert.match(rotuloKpi(lista[2]), /Proventos recebidos/);
  assert.match(valorKpi(lista[2]), /R\$ 50,00/);
  assert.match(rotuloKpi(lista[3]), /Ativos na carteira/);
});

test('renderResumoClasseCarteiras() usa `formatarValor` (ex.: formatUSD em Ações EUA) pros valores principais e do Lucro/Prejuízo', () => {
  const doc = makeDom('<div id="alvo"></div>');
  const container = doc.getElementById('alvo');
  const formatarValor = (v) => `US$ ${v.toFixed(2)}`;
  renderResumoClasseCarteiras(doc, container, {
    totalInvestido: 100, totalAtualizado: 110, lucroPrejuizo: 10, percentualLucroPrejuizo: 0.1, quantidadeAtivos: 2,
  }, { formatarValor });

  const lista = kpis(container);
  assert.match(valorKpi(lista[0]), /US\$ 110\.00/);
  assert.match(lista[0].querySelector('.cg-kpi-sub').textContent, /US\$ 100\.00/);
  assert.match(valorKpi(lista[1]), /US\$ 10\.00/);
});

test('renderResumoClasseCarteiras() não lança quando container ou resumo faltam', () => {
  const doc = makeDom();
  assert.doesNotThrow(() => renderResumoClasseCarteiras(doc, null, {}));
  assert.doesNotThrow(() => renderResumoClasseCarteiras(doc, doc.createElement('div'), null));
});

// faixa comprar/aguardar embaixo do KPI "Ativos na carteira", só desenhada quando `vies` vem com pelo menos 1 item.
test('renderResumoClasseCarteiras() com `vies` desenha a faixa comprar/aguardar e a legenda "N comprar · M aguardar" no KPI "Ativos na carteira"', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderResumoClasseCarteiras(doc, doc.getElementById('alvo'), {
    totalInvestido: 100, totalAtualizado: 110, lucroPrejuizo: 10, percentualLucroPrejuizo: 0.1, quantidadeAtivos: 5,
  }, { vies: { comprar: 3, aguardar: 2 } });

  const kpiAtivos = kpis(doc.getElementById('alvo'))[2];
  assert.equal(valorKpi(kpiAtivos), '5');
  assert.match(kpiAtivos.textContent, /3 comprar · 2 aguardar/);
  const barra = kpiAtivos.querySelector('.cc-vies');
  assert.ok(barra, 'deveria desenhar .cc-vies');
  assert.match(barra.querySelector('.comprar').getAttribute('style'), /width:\s*60(\.0)?%/);
  assert.match(barra.querySelector('.aguardar').getAttribute('style'), /width:\s*40(\.0)?%/);
});

test('renderResumoClasseCarteiras() sem `vies` (ex.: Renda Fixa) não desenha a faixa comprar/aguardar', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderResumoClasseCarteiras(doc, doc.getElementById('alvo'), {
    totalInvestido: 100, totalAtualizado: 110, lucroPrejuizo: 10, percentualLucroPrejuizo: 0.1, quantidadeAtivos: 5,
  });
  assert.equal(doc.querySelector('.cc-vies'), null);
});

test('renderResumoClasseCarteiras() com `vies` todo zerado (comprar:0, aguardar:0) não desenha a faixa', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderResumoClasseCarteiras(doc, doc.getElementById('alvo'), {
    totalInvestido: 100, totalAtualizado: 110, lucroPrejuizo: 10, percentualLucroPrejuizo: 0.1, quantidadeAtivos: 0,
  }, { vies: { comprar: 0, aguardar: 0 } });
  assert.equal(doc.querySelector('.cc-vies'), null);
});

// Ações EUA: `cambio` acrescenta um "i" com o equivalente em reais no Valor atual (e no "Valor aplicado" embaixo) e no Lucro/Prejuízo;
// sem `cambio` (Ações/FIIs/Renda Fixa), nenhum "i" de conversão aparece.
test('renderResumoClasseCarteiras() com `cambio` acrescenta um "i" com o equivalente em reais no Valor atual, no Valor aplicado e no Lucro/Prejuízo', () => {
  const doc = makeDom('<div id="alvo"></div>');
  const container = doc.getElementById('alvo');
  renderResumoClasseCarteiras(doc, container, {
    totalInvestido: 3001.85, totalAtualizado: 3303.79, lucroPrejuizo: 301.95, percentualLucroPrejuizo: 0.1, quantidadeAtivos: 7,
  }, { cambio: 5.14 });

  const lista = kpis(container);
  const iconesValor = lista[0].querySelectorAll('.info-alvo');
  assert.equal(iconesValor.length, 2); // Valor atual + Valor aplicado
  assert.match(iconesValor[0].dataset.tooltip, /R\$/);
  assert.ok(lista[1].querySelector('.info-alvo'), 'Lucro/Prejuízo também deveria ganhar o "i"');
  assert.equal(lista[2].querySelector('.info-alvo'), null);
});

test('renderResumoClasseCarteiras() sem `cambio` (Ações/FIIs/Renda Fixa) não acrescenta nenhum "i" de conversão', () => {
  const doc = makeDom('<div id="alvo"></div>');
  const container = doc.getElementById('alvo');
  renderResumoClasseCarteiras(doc, container, {
    totalInvestido: 100, totalAtualizado: 110, lucroPrejuizo: 10, percentualLucroPrejuizo: 0.1, quantidadeAtivos: 2,
  });
  assert.equal(container.querySelectorAll('.info-alvo').length, 0);
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

// 06/10/2026 (Onda 3): o anel "por grupo" é o criarAnel da biblioteca de gráficos (charts/anel.js) com a legenda dele
// (.chart-legenda > .chart-leg-item); a antiga divisão da legenda em 2 colunas feita no DOM saiu (a legenda do kit se ajusta sozinha).
test('renderDistribuicaoGrupoCarteiras() converte distribuicaoPorGrupo em fatias e desenha o anel com a legenda', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('alvo'), [
    { grupo: 'Bancos', totalAtualizado: 6000, percentual: 0.6 },
    { grupo: 'Energia', totalAtualizado: 4000, percentual: 0.4 },
  ]);
  const container = doc.getElementById('alvo');
  assert.ok(container.querySelector('.chart--anel svg'));
  const itens = container.querySelectorAll('.chart-leg-item');
  assert.equal(itens.length, 2);
  assert.match(itens[0].textContent, /Bancos/);
  assert.match(itens[0].textContent, /60,0%/);
  assert.match(itens[1].textContent, /Energia/);
});

test('renderDistribuicaoGrupoCarteiras() não perde nenhum item da legenda com muitos grupos', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('alvo'), [
    { grupo: 'Financeiro', totalAtualizado: 7000 },
    { grupo: 'Petróleo, Gás e Biocombustíveis', totalAtualizado: 4000 },
    { grupo: 'Utilidade Pública', totalAtualizado: 3000 },
    { grupo: 'Consumo Cíclico', totalAtualizado: 2000 },
    { grupo: 'Materiais Básicos', totalAtualizado: 2000 },
    { grupo: 'Consumo não Cíclico', totalAtualizado: 1500 },
    { grupo: 'Bens Industriais', totalAtualizado: 1000 },
  ]);
  assert.equal(doc.querySelectorAll('.chart-leg-item').length, 7);
});

test('renderDistribuicaoGrupoCarteiras() com 1 grupo só desenha o anel com 1 item', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('alvo'), [
    { grupo: 'Logística', totalAtualizado: 5000 },
  ]);
  assert.equal(doc.querySelectorAll('.chart-leg-item').length, 1);
});

test('renderDistribuicaoGrupoCarteiras() sem posições mostra o aviso em vez do anel', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('alvo'), []);
  assert.equal(doc.querySelector('.chart--anel'), null);
  assert.match(doc.getElementById('alvo').textContent, /Sem posições/);
});

// Ações EUA: com `cambio` a legenda mostra o dólar e, entre parênteses, o equivalente em reais pelo câmbio de hoje;
// sem `cambio` (Ações/FIIs, nativamente em R$), só reais.
test('renderDistribuicaoGrupoCarteiras() sem `cambio` mostra os valores em R$ (Ações/FIIs, sem mudança)', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('alvo'), [
    { grupo: 'Bancos', totalAtualizado: 6000 },
  ]);
  assert.match(doc.querySelector('.chart-leg-val').textContent, /R\$/);
});

test('renderDistribuicaoGrupoCarteiras() com `cambio` mostra o valor em US$ e o equivalente em R$ entre parênteses (Ações EUA)', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('alvo'), [
    { grupo: 'Financeiro / Bancário', totalAtualizado: 312.48 },
  ], { cambio: 5.14 });
  const valor = doc.querySelector('.chart-leg-val').textContent;
  assert.match(valor, /US\$|\$\s*312[.,]48/);
  assert.match(valor, /R\$\s*1\.606,15/); // 312.48 * 5.14
});

// --- equivalenteBrlHtml_ -----------------------------------------------

test('equivalenteBrlHtml_() devolve um botão "i" pequeno com o valor convertido pro câmbio de hoje', () => {
  const html = equivalenteBrlHtml_(100, 5);
  assert.match(html, /info-alvo/);
  assert.match(html, /cc-info-icon-sm/);
  assert.match(html, /R\$\s*500,00/);
});

test('equivalenteBrlHtml_() devolve string vazia sem câmbio numérico ou sem valor numérico', () => {
  assert.equal(equivalenteBrlHtml_(100, null), '');
  assert.equal(equivalenteBrlHtml_(100, undefined), '');
  assert.equal(equivalenteBrlHtml_(null, 5), '');
  assert.equal(equivalenteBrlHtml_(undefined, 5), '');
});

// --- renderTabelaAtivosCarteiras -----------------------------------------

const COLUNAS_TESTE = [
  { label: 'Ticker', topo: true, formatar: (a) => a.ticker },
  { label: 'Total atualizado', num: true, formatar: (a) => String(a.totalAtualizado) },
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

// 06/10/2026 (Onda 3): tabela do kit (.card.card-flat > .tabela-wrap > table.tabela). Coluna `topo` = o ativo (logo + ticker + nome),
// `num` = número (à direita), `opc` = some no celular. Nenhum <th> ganha classe de alinhamento por conta própria.
test('renderTabelaAtivosCarteiras() usa o contêiner do kit e monta um <th> por coluna', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderTabelaAtivosCarteiras(doc, doc.getElementById('alvo'), [{ ticker: 'X', totalAtualizado: 1 }], COLUNAS_TESTE);
  assert.ok(doc.querySelector('.card.card-flat > .tabela-wrap > table.tabela.cc-tabela'));
  const ths = doc.querySelectorAll('.cc-tabela th');
  assert.equal(ths.length, 2);
  assert.ok(ths[0].classList.contains('cc-col-ativo'));
  assert.ok(ths[1].classList.contains('num'));
});

test('renderTabelaAtivosCarteiras() a coluna `topo` ganha .cc-col-ativo e a `num` ganha .num; `opc` ganha .col-opc', () => {
  const doc = makeDom('<div id="alvo"></div>');
  const colunas = [...COLUNAS_TESTE, { label: 'Extra', num: true, opc: true, formatar: () => '1' }];
  renderTabelaAtivosCarteiras(doc, doc.getElementById('alvo'), [{ ticker: 'X', totalAtualizado: 1 }], colunas);
  const tds = doc.querySelectorAll('.cc-tabela tbody td');
  assert.equal(tds.length, 3);
  assert.ok(tds[0].classList.contains('cc-col-ativo')); // Ticker
  assert.equal(tds[1].classList.contains('cc-col-ativo'), false); // Total atualizado
  assert.ok(tds[1].classList.contains('num'));
  assert.ok(tds[2].classList.contains('col-opc'));
});

// a coluna `topo` (Ativo) é a "cabeça" da linha, sem rótulo; as demais ganham `data-label` com o `label` da coluna
// (usado pela folha de detalhes do celular).
test('renderTabelaAtivosCarteiras() a célula `topo` não leva data-label e as demais levam data-label = c.label', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderTabelaAtivosCarteiras(doc, doc.getElementById('alvo'), [{ ticker: 'X', totalAtualizado: 1 }], COLUNAS_TESTE);
  const tds = doc.querySelectorAll('.cc-tabela tbody td');
  assert.equal(tds[0].hasAttribute('data-label'), false);
  assert.equal(tds[1].getAttribute('data-label'), 'Total atualizado');
});

test('renderTabelaAtivosCarteiras() escapa aspas no data-label (rótulo com aspas não quebra o HTML)', () => {
  const doc = makeDom('<div id="alvo"></div>');
  const colunas = [
    { label: 'Ticker', topo: true, formatar: (a) => a.ticker },
    { label: 'Preço "hoje"', formatar: (a) => String(a.totalAtualizado) },
  ];
  renderTabelaAtivosCarteiras(doc, doc.getElementById('alvo'), [{ ticker: 'X', totalAtualizado: 1 }], colunas);
  const tds = doc.querySelectorAll('.cc-tabela tbody td');
  assert.equal(tds[1].getAttribute('data-label'), 'Preço "hoje"');
});

test('renderTabelaAtivosCarteiras() clique no cabeçalho ordena, mas clique num ícone ".info-alvo" dentro dele não', () => {
  const doc = makeDom('<div id="alvo"></div>');
  const colunas = [
    { label: 'Ticker', campo: 'ticker', ordenarPor: (a) => a.ticker, topo: true, formatar: (a) => a.ticker },
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

// --- contarVies_ -------------------------------------------------------

test('contarVies_() conta "Comprar"/"Aguardar" (statusVies) e ignora ativos sem viés reconhecido', () => {
  const ativos = [
    { vies: 'Comprar' },
    { vies: 'comprar' },
    { vies: 'Aguardar' },
    { vies: null },
    { vies: 'outra coisa' },
  ];
  assert.deepEqual(contarVies_(ativos), { comprar: 2, aguardar: 1 });
});

test('contarVies_() devolve {comprar:0, aguardar:0} pra lista vazia ou undefined', () => {
  assert.deepEqual(contarVies_([]), { comprar: 0, aguardar: 0 });
  assert.deepEqual(contarVies_(undefined), { comprar: 0, aguardar: 0 });
});
