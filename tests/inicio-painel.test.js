// tests/inicio-painel.test.js
//
// 26/09/2026 - Início reorganizada: gráfico do dia (inicio-intradia.js),
// faixa de mercado, resumo compacto e a lista "Meus ativos" da coluna
// lateral (inicio-painel.js). Dados 100% inventados - roda sem fixtures.json.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  CHAVES_MERCADO, chaveIntradiaDoAtivo, valoresIntradia, desenharIntradia, rotuloDiaIntradia, preencherIntradia,
} from '../assets/js/pages/inicio-intradia.js';
import {
  itensFaixaMercado, renderFaixaMercado, completarFaixaComIntradia, numerosDaVisao, renderResumoCompacto,
  valorPosicao, filtrarListaAtivos, wireListaAtivos,
} from '../assets/js/pages/inicio-painel.js';

const makeDoc = (html = '') => new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { url: 'https://exemplo.test/' }).window.document;
const clique = (doc, el) => el.dispatchEvent(new doc.defaultView.MouseEvent('click', { bubbles: true, cancelable: true }));
const espacos = (s) => s.replace(/\s+/g, ' ');

// Pregão de 6h (360 min); 2h de pregão andadas; abriu 10, foi a 11, está em 9; ontem fechou 10.
const SERIE = { preco: 9, fechamentoAnterior: 10, variacao: -0.1, dia: '2026-09-25', inicio: 0, fim: 360 * 60, t: [0, 60, 120], v: [10, 11, 9], moeda: 'BRL' };

// --- gráfico do dia ----------------------------------------------------------

test('intradia: chaves da faixa e de cada ativo (renda fixa não tem pregão)', () => {
  assert.deepEqual(CHAVES_MERCADO, ['IBOV', 'IFIX', 'SPX', 'USD', 'EUR']);
  assert.equal(chaveIntradiaDoAtivo({ classe: 'acoes', ticker: ' aaaa3 ' }), 'acoes:AAAA3');
  assert.equal(chaveIntradiaDoAtivo({ classe: 'fiis', ticker: 'BBBB11' }), 'fiis:BBBB11');
  assert.equal(chaveIntradiaDoAtivo({ classe: 'usa', ticker: 'CCCC' }), 'usa:CCCC');
  assert.equal(chaveIntradiaDoAtivo({ classe: 'rf', ticker: 'Tesouro Teste 2030' }), null);
  assert.equal(chaveIntradiaDoAtivo(null), null);
});

test('valoresIntradia(): eixo = pregão inteiro (no meio do dia o fim fica vazio); referência = fechamento de ontem; cor pelo sinal', () => {
  const g = valoresIntradia(SERIE, { pontos: 60 });
  assert.equal(g.valores.length, 60);
  assert.equal(g.valores[0], 10);
  const ultimo = g.valores.reduce((acc, v, i) => (v == null ? acc : i), -1);
  assert.ok(ultimo >= 18 && ultimo <= 21, '120 de 360 minutos = 1/3 do pregão');
  assert.equal(g.valores[ultimo], 9, 'a linha termina no preço de agora');
  assert.ok(g.valores.slice(ultimo + 1).every((v) => v == null), 'o resto do pregão fica vazio');
  assert.equal(g.referencia, 10);
  assert.equal(g.sobe, false, '9 está abaixo do fechamento de ontem (10)');
  assert.equal(valoresIntradia({ ...SERIE, v: [10, 9, 10.5] }).sobe, true);
  // sem fechamento de ontem: compara com a abertura
  assert.equal(valoresIntradia({ ...SERIE, fechamentoAnterior: null, v: [10, 9, 10.5] }).referencia, 'inicio');
  // série inválida
  assert.equal(valoresIntradia({ t: [0], v: [1] }), null);
  assert.equal(valoresIntradia({ t: [0, 1], v: [1] }), null);
  assert.equal(valoresIntradia(null), null);
  // preço parado o dia todo não quebra
  assert.ok(valoresIntradia({ t: [0, 5], v: [7, 7] }).valores.length);
});

test('desenharIntradia(): desenha a sparkline da biblioteca, atualiza no lugar e limpa quando a série não serve', () => {
  const doc = makeDoc('<div id="e"></div>');
  const el = doc.getElementById('e');
  assert.equal(desenharIntradia(el, SERIE, { titulo: 'Teste <b>' }), true);
  const svg = el.querySelector('svg');
  assert.ok(svg);
  assert.equal(desenharIntradia(el, { ...SERIE, v: [10, 11, 12] }), true);
  assert.equal(el.querySelector('svg'), svg, 'atualiza o mesmo SVG (a linha morfa)');
  assert.equal(desenharIntradia(el, { t: [], v: [] }), false);
  assert.equal(el.innerHTML, '');
});

test('rotuloDiaIntradia() / preencherIntradia(): "pregão dd/mm" quando não é hoje; slot sem dado fica marcado', () => {
  assert.equal(rotuloDiaIntradia(SERIE, '2026-09-25'), 'hoje');
  assert.equal(rotuloDiaIntradia(SERIE, '2026-09-27'), '25/09');
  assert.equal(rotuloDiaIntradia({}, '2026-09-27'), '');
  const doc = makeDoc('<div id="r"><span data-intradia="A"></span><span data-intradia="B"></span><span data-intradia="C"></span></div>');
  const raiz = doc.getElementById('r');
  preencherIntradia(raiz, { A: SERIE, B: null }, { hojeISO: '2026-09-27' });
  const [a, b, c] = raiz.querySelectorAll('[data-intradia]');
  assert.ok(a.querySelector('svg'));
  assert.equal(a.querySelector('.intradia-dia').textContent, 'pregão 25/09');
  assert.ok(b.classList.contains('sem-dado'));
  assert.equal(c.innerHTML, '', 'chave que não veio na resposta fica como está');
  preencherIntradia(raiz, { A: SERIE }, { hojeISO: '2026-09-25' });
  assert.equal(a.querySelector('.intradia-dia'), null, 'pregão de hoje não leva etiqueta');
});

// --- faixa de mercado ----------------------------------------------------------

test('faixa de mercado: índices com a variação da planilha; câmbio completa a variação pelo gráfico do dia', () => {
  const dados = { indices: { ibovespa: { valor: 100000, variacaoDia: -0.5 }, spx: { valor: 5000, variacaoDia: 1.25 } }, cambio: { usd: 5.1, eur: 6 } };
  assert.deepEqual(itensFaixaMercado(dados).map((i) => i.chave), ['IBOV', 'SPX', 'USD', 'EUR']);
  const doc = makeDoc('<div id="f"></div>');
  const f = doc.getElementById('f');
  renderFaixaMercado(doc, f, dados);
  const itens = [...f.querySelectorAll('.mkt')];
  assert.equal(itens.length, 4);
  assert.ok(itens[0].querySelector('.mkt-var').classList.contains('bad'));
  assert.match(itens[0].querySelector('.mkt-var').textContent, /0,50%/);
  assert.ok(itens[0].querySelector('.mkt-var use[href="#ico-trending-down"]'), 'variação sempre com ícone de tendência');
  assert.ok(itens[1].querySelector('.mkt-var').classList.contains('good'));
  assert.match(itens[2].querySelector('.mkt-valor').textContent, /US\$/);
  assert.equal(f.querySelectorAll('[data-mkt-var]').length, 2, 'dólar e euro sem variação na planilha');
  completarFaixaComIntradia(f, { USD: { variacao: 0.004 }, EUR: null });
  assert.match(f.querySelector('[data-mkt="USD"] .mkt-var').textContent, /0,40%/);
  assert.ok(f.querySelector('[data-mkt="USD"] .mkt-var use[href="#ico-trending-up"]'));
  assert.equal(f.querySelectorAll('[data-mkt-var]').length, 1, 'euro continua esperando');
  renderFaixaMercado(doc, f, {});
  assert.match(f.textContent, /Sem dado/);
});

// --- resumo compacto -----------------------------------------------------------

const PATRIMONIO = { total: 3000, longoPrazo: 2000, nacional: 1500, rendaEmergencial: 1000, porClasse: { acoes: 800, fiis: 700, acoesEua: 500, rendaFixa: 1000 } };
const ONTEM = { data: '2026-09-24', total: 3100, longoPrazo: 1900, nacional: 1500, rendaEmergencial: 1000 };

test('numerosDaVisao(): diferença e variação desde o último fechamento', () => {
  const n = numerosDaVisao('total', PATRIMONIO, ONTEM);
  assert.equal(n.valor, 3000);
  assert.equal(n.diferenca, -100);
  assert.ok(Math.abs(n.variacao - (-100 / 3100)) < 1e-12);
  assert.equal(n.dataOntem, '2026-09-24');
  assert.equal(numerosDaVisao('total', PATRIMONIO, null).variacao, null);
});

test('renderResumoCompacto(): 4 KPIs (1 por visão), distribuição em anel com abas sublinhadas; a visão escolhida sobrevive ao redesenho', () => {
  const doc = makeDoc('<div id="r"></div><div id="d"></div>');
  const r = doc.getElementById('r');
  const dados = { patrimonio: PATRIMONIO, ativos: ATIVOS, cambio: { usd: 5 }, ontem: ONTEM, historico: [{ data: '2026-09-23', patrimonio: 2900 }, { data: '2026-09-24', patrimonio: 3100 }] };
  renderResumoCompacto(doc, r, dados, { distribuicaoEl: doc.getElementById('d') });
  const kpis = [...r.querySelectorAll('.rc-kpi')];
  assert.deepEqual(kpis.map((b) => b.dataset.visao), ['total', 'longoPrazo', 'nacional', 'rendaEmergencial']);
  assert.match(espacos(kpis[0].querySelector('.chart-kpi-val').textContent), /3\.000/);
  assert.match(espacos(kpis[0].textContent), /−R\$\s*100,00 · 3,23% desde 24\/09/);
  assert.match(espacos(kpis[1].textContent), /5,26% desde 24\/09/);
  const d = doc.getElementById('d');
  assert.match(d.querySelector('.rc-distrib-cab').textContent, /Patrimônio total/);
  assert.ok(d.querySelectorAll('.chart-anel svg .chart-fatia, .chart--anel svg .chart-fatia').length >= 3, 'anel com as fatias');
  assert.equal(d.querySelector('.tab[aria-selected="true"]').dataset.tab, 'total');

  clique(doc, d.querySelector('.tab[data-tab="nacional"]'));
  assert.match(d.querySelector('.rc-distrib-cab').textContent, /Nacional/);
  assert.equal(d.querySelector('.tab[data-tab="nacional"]').getAttribute('aria-selected'), 'true');
  assert.doesNotMatch(d.querySelector('.chart-legenda').textContent, /EUA/, 'visão Nacional não tem internacional');

  renderResumoCompacto(doc, r, { ...dados, patrimonio: { ...PATRIMONIO, total: 3200 } }, { distribuicaoEl: d });
  assert.equal(d.querySelector('.tab[aria-selected="true"]').dataset.tab, 'nacional', 'Atualizar dados não volta pra aba Total');
  assert.equal(r.querySelectorAll('.rc-kpi').length, 4, 'os cartões são os mesmos (só os números mudam)');
  renderResumoCompacto(doc, r, {});
  assert.match(r.textContent, /Sem dado de patrimônio/);
});

// --- Meus ativos (lista lateral) --------------------------------------------

const ATIVOS = [
  { classe: 'acoes', ticker: 'AAAA3', nome: 'Empresa A', precoAtual: 10, quantidade: 10, variacaoDia: 0.02 },
  { classe: 'fiis', ticker: 'BBBB11', nome: 'Fundo B', precoAtual: 100, quantidade: 3, variacaoDia: -0.01 },
  { classe: 'usa', ticker: 'CCCC', nome: 'Company C', precoAtual: 20, quantidade: 2, variacaoDia: 0.005 },
  { classe: 'rf', ticker: 'Tesouro Teste 2030', codigo: 'BRSTNTESTE01', tipoInvestimento: 'Tesouro Selic', indexador: 'SELIC', valorAtualizado: 500 },
];

test('valorPosicao() / filtrarListaAtivos(): classe, busca (ticker ou nome), alta, queda e posição', () => {
  assert.equal(valorPosicao(ATIVOS[0]), 100);
  assert.equal(valorPosicao(ATIVOS[2], 5), 200, 'EUA sem preço em reais usa o câmbio');
  assert.equal(valorPosicao(ATIVOS[3]), 500);
  const tickers = (l) => l.map((a) => a.ticker);
  assert.deepEqual(tickers(filtrarListaAtivos(ATIVOS, { classe: 'fiis' })), ['BBBB11']);
  assert.deepEqual(tickers(filtrarListaAtivos(ATIVOS, { busca: 'company' })), ['CCCC']);
  assert.deepEqual(tickers(filtrarListaAtivos(ATIVOS, { busca: 'selic' })), ['Tesouro Teste 2030']);
  assert.deepEqual(tickers(filtrarListaAtivos(ATIVOS, { ordem: 'alta' })), ['AAAA3', 'CCCC', 'BBBB11', 'Tesouro Teste 2030'], 'sem variação vai pro fim');
  assert.deepEqual(tickers(filtrarListaAtivos(ATIVOS, { ordem: 'queda' })), ['BBBB11', 'CCCC', 'AAAA3', 'Tesouro Teste 2030']);
  assert.deepEqual(tickers(filtrarListaAtivos(ATIVOS, { ordem: 'posicao', cambioUsd: 5 })), ['Tesouro Teste 2030', 'BBBB11', 'CCCC', 'AAAA3']);
});

test('wireListaAtivos(): abas com contagem, busca, ordem, "Mostrar todos" e religar não duplica listener', () => {
  const doc = makeDoc(`
    <span id="n"></span><input id="b"><select id="o"><option value="carteira"></option><option value="queda"></option></select>
    <div id="abas"></div>
    <ul id="l"></ul><button id="m"></button>`);
  const $ = (id) => doc.getElementById(id);
  const muitos = Array.from({ length: 12 }, (_, i) => ({ classe: 'acoes', ticker: `ZZ${String(i).padStart(2, '0')}3`, precoAtual: 1, quantidade: 1, variacaoDia: i / 100 }));
  const els = { lista: $('l'), abas: $('abas'), busca: $('b'), ordem: $('o'), contador: $('n'), mais: $('m') };
  wireListaAtivos(doc, els, [...ATIVOS, ...muitos], { cambioUsd: 5 });
  assert.equal($('n').textContent, '16 ativos');
  assert.equal($('abas').querySelector('[data-tab="acoes"] .tab-n').textContent, '13');
  assert.ok($('l').classList.contains('recolhida'));
  assert.equal($('m').hidden, false);
  assert.equal($('m').textContent, 'Mostrar todos (16)');
  assert.equal($('l').querySelectorAll('.al-item .ativo-fav-btn').length, 16, 'estrela em toda linha');
  assert.match($('l').querySelector('.al-item').textContent, /2,00%/);
  assert.ok($('l').querySelector('.al-item .al-var use[href="#ico-trending-up"]'), 'variação com ícone de tendência');

  clique(doc, $('m'));
  assert.equal($('l').classList.contains('recolhida'), false);
  assert.equal($('m').textContent, 'Mostrar menos');

  $('b').value = 'fundo';
  $('b').dispatchEvent(new doc.defaultView.Event('input'));
  assert.equal($('n').textContent, '1 ativo');
  assert.equal($('m').hidden, true);
  $('b').value = '';
  $('b').dispatchEvent(new doc.defaultView.Event('input'));

  clique(doc, $('abas').querySelector('[data-tab="acoes"]'));
  assert.equal($('abas').querySelector('[data-tab="acoes"]').getAttribute('aria-selected'), 'true');
  $('o').value = 'queda';
  $('o').dispatchEvent(new doc.defaultView.Event('change'));
  assert.equal($('l').querySelector('.al-ticker').textContent, 'ZZ003', 'menor variação primeiro');

  // Atualizar dados: religa com ativos novos, mantém filtro e não duplica clique
  wireListaAtivos(doc, els, ATIVOS, { cambioUsd: 5 });
  assert.equal($('n').textContent, '1 ativo');
  clique(doc, $('m'));
  assert.equal($('l')._estadoLista.expandida, false, 'um clique = uma troca (sem listener duplicado)');

  clique(doc, $('abas').querySelector('[data-tab="todos"]'));
  $('b').value = 'nada-disso';
  $('b').dispatchEvent(new doc.defaultView.Event('input'));
  assert.match($('l').textContent, /Nenhum ativo/);
});
