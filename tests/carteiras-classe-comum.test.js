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
  assert.match(container.querySelector('.cc-resumo-investido').textContent, /Valor aplicado/);
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

// 19/09/2026 #5 (pedido do Tiago revisando o resultado: "voce só manteve o
// numero de ativos, mas remoeu o gadget de comprar/aguardar (com a
// barrinha)") - faixa comprar/aguardar embaixo do stat "Ativos na
// carteira", só desenhada quando `vies` vem com pelo menos 1 item.
test('renderResumoClasseCarteiras() com `vies` desenha a faixa comprar/aguardar e a legenda "N compr. · M aguard." no stat "Ativos na carteira"', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderResumoClasseCarteiras(doc, doc.getElementById('alvo'), {
    totalInvestido: 100, totalAtualizado: 110, lucroPrejuizo: 10, percentualLucroPrejuizo: 0.1, quantidadeAtivos: 5,
  }, { vies: { comprar: 3, aguardar: 2 } });

  const statAtivos = doc.querySelectorAll('.cc-resumo-stat')[1];
  assert.match(statAtivos.textContent, /5/);
  assert.match(statAtivos.textContent, /3 compr\. · 2 aguard\./);
  const barra = statAtivos.querySelector('.cc-resumo-vies-bar');
  assert.ok(barra, 'deveria desenhar .cc-resumo-vies-bar');
  assert.match(barra.querySelector('.comprar').getAttribute('style'), /width:60\.0%/);
  assert.match(barra.querySelector('.aguardar').getAttribute('style'), /width:40\.0%/);
});

test('renderResumoClasseCarteiras() sem `vies` (ex.: Renda Fixa) não desenha a faixa comprar/aguardar', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderResumoClasseCarteiras(doc, doc.getElementById('alvo'), {
    totalInvestido: 100, totalAtualizado: 110, lucroPrejuizo: 10, percentualLucroPrejuizo: 0.1, quantidadeAtivos: 5,
  });
  const statAtivos = doc.querySelectorAll('.cc-resumo-stat')[1];
  assert.equal(statAtivos.querySelector('.cc-resumo-vies-bar'), null);
});

test('renderResumoClasseCarteiras() com `vies` todo zerado (comprar:0, aguardar:0) não desenha a faixa', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderResumoClasseCarteiras(doc, doc.getElementById('alvo'), {
    totalInvestido: 100, totalAtualizado: 110, lucroPrejuizo: 10, percentualLucroPrejuizo: 0.1, quantidadeAtivos: 0,
  }, { vies: { comprar: 0, aguardar: 0 } });
  const statAtivos = doc.querySelectorAll('.cc-resumo-stat')[1];
  assert.equal(statAtivos.querySelector('.cc-resumo-vies-bar'), null);
});

// 19/09/2026 #6 (pedido do Tiago, só Ações EUA: "coloque um i com a
// conversao nesses tres valores em dolar" - Total atualizado, Total
// investido e Lucro/Prejuízo) - `cambio` acrescenta um botão "i"
// (equivalenteBrlHtml_) depois de cada um desses 3 valores; sem
// `cambio` (Ações/FIIs/Renda Fixa), nenhum "i" novo aparece.
test('renderResumoClasseCarteiras() com `cambio` acrescenta um "i" com o equivalente em reais no Total atualizado, Total investido e Lucro/Prejuízo', () => {
  const doc = makeDom('<div id="alvo"></div>');
  const container = doc.getElementById('alvo');
  renderResumoClasseCarteiras(doc, container, {
    totalInvestido: 3001.85, totalAtualizado: 3303.79, lucroPrejuizo: 301.95, percentualLucroPrejuizo: 0.1, quantidadeAtivos: 7,
  }, { cambio: 5.14 });

  const principalIcones = container.querySelector('.cc-resumo-principal').querySelectorAll('.info-alvo');
  assert.equal(principalIcones.length, 2); // Total atualizado + Total investido
  assert.match(principalIcones[0].dataset.tooltip, /R\$/);

  const statLucro = doc.querySelectorAll('.cc-resumo-stat')[0];
  assert.ok(statLucro.querySelector('.info-alvo'), 'Lucro/Prejuízo também deveria ganhar o "i"');
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

// 19/09/2026 #5 (correção do Tiago revisando o resultado no mobile: pediu
// "duas rows" primeiro, depois se corrigiu - "eu me confundi nas
// palavras: na verdade, quero que seja duas COLUNAS... divida entre elas
// de acordo com o numero de itens na lista") - a divisão em 2 colunas é
// feita no DOM (dividirLegendaEmDuasColunas_), não em CSS/media query,
// então tem que valer em QUALQUER contagem de itens e não depende de
// largura de tela (jsdom não tem viewport, então esses testes cobrem
// exatamente o que a versão anterior (CSS Grid + fallback mobile) não
// garantia).
test('renderDistribuicaoGrupoCarteiras() divide a legenda em exatamente 2 colunas, com a coluna 1 levando o item a mais quando ímpar', () => {
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
  const container = doc.getElementById('alvo');
  const colunas = container.querySelectorAll('.cc-donut-legenda-col');
  assert.equal(colunas.length, 2); // sempre 2, nunca N colunas de 1 item cada
  assert.equal(colunas[0].querySelectorAll('.distrib-item').length, 4); // 7 itens -> 4 + 3
  assert.equal(colunas[1].querySelectorAll('.distrib-item').length, 3);
  assert.equal(container.querySelectorAll('.distrib-item').length, 7); // nenhum item se perdeu no reagrupamento
});

test('renderDistribuicaoGrupoCarteiras() com 1 grupo só não cria colunas vazias', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('alvo'), [
    { grupo: 'Logística', totalAtualizado: 5000 },
  ]);
  const container = doc.getElementById('alvo');
  assert.equal(container.querySelectorAll('.cc-donut-legenda-col').length, 0);
  assert.equal(container.querySelectorAll('.distrib-item').length, 1);
});

// 19/09/2026 #6 (pedido do Tiago sobre o donut "Por setor" de Ações EUA -
// print mostrando "Financeiro/Bancário R$ 312,48" quando o valor real já
// era em US$: "por default, mostra em dolar aqui, e no i, mantenha a
// versao em reais") - sem `cambio` (Ações/FIIs, nativamente em R$),
// comportamento idêntico a antes.
test('renderDistribuicaoGrupoCarteiras() sem `cambio` mostra os valores em R$ (Ações/FIIs, sem mudança)', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('alvo'), [
    { grupo: 'Bancos', totalAtualizado: 6000 },
  ]);
  const container = doc.getElementById('alvo');
  assert.match(container.querySelector('.distrib-valor').textContent, /R\$/);
});

test('renderDistribuicaoGrupoCarteiras() com `cambio` mostra os valores em US$ na legenda e o equivalente em R$ na tooltip do item (Ações EUA)', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderDistribuicaoGrupoCarteiras(doc, doc.getElementById('alvo'), [
    { grupo: 'Financeiro / Bancário', totalAtualizado: 312.48 },
  ], { cambio: 5.14 });
  const container = doc.getElementById('alvo');
  const valorEl = container.querySelector('.distrib-valor');
  assert.match(valorEl.textContent, /\$312\.48|US\$/);
  assert.equal(valorEl.textContent.includes('R$'), false);
  const item = container.querySelector('.distrib-item');
  assert.match(item.dataset.tooltip, /R\$\s*1\.606,15/); // 312.48 * 5.14
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

// 19/09/2026 #5 (pedido do Tiago: "NAO USAR TABELA EM MOBIle... em modo
// mobile, cada item seria um card", mesma técnica da tabela do Radar de
// oportunidades - distribuicoes-metas.js!criarLinhaRadar_): a coluna com
// `alinharEsquerda:true` (Ativo) vira o "topo" do card sem rótulo
// (.cc-td-topo, sem data-label); as demais ganham `data-label` com o
// `label` da coluna, pro CSS mobile desenhar "rótulo: valor" via
// `content:attr(data-label)`.
test('renderTabelaAtivosCarteiras() marca a célula alinharEsquerda com .cc-td-topo e sem data-label, e as demais com data-label = c.label', () => {
  const doc = makeDom('<div id="alvo"></div>');
  renderTabelaAtivosCarteiras(doc, doc.getElementById('alvo'), [{ ticker: 'X', totalAtualizado: 1 }], COLUNAS_TESTE);
  const tds = doc.querySelectorAll('.cc-tabela tbody td');
  assert.equal(tds[0].classList.contains('cc-td-topo'), true); // Ticker (alinharEsquerda)
  assert.equal(tds[0].hasAttribute('data-label'), false);
  assert.equal(tds[1].classList.contains('cc-td-topo'), false); // Total atualizado
  assert.equal(tds[1].getAttribute('data-label'), 'Total atualizado');
});

test('renderTabelaAtivosCarteiras() escapa aspas no data-label (rótulo com aspas não quebra o HTML)', () => {
  const doc = makeDom('<div id="alvo"></div>');
  const colunas = [
    { label: 'Ticker', alinharEsquerda: true, formatar: (a) => a.ticker },
    { label: 'Preço "hoje"', formatar: (a) => String(a.totalAtualizado) },
  ];
  renderTabelaAtivosCarteiras(doc, doc.getElementById('alvo'), [{ ticker: 'X', totalAtualizado: 1 }], colunas);
  const tds = doc.querySelectorAll('.cc-tabela tbody td');
  assert.equal(tds[1].getAttribute('data-label'), 'Preço "hoje"');
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
