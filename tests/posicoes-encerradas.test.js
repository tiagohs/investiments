// tests/posicoes-encerradas.test.js - 27/10/2026 (Tiago, depois de vender tudo de uma ação: "não quero que ele seja mais
// considerado no ranking do Acompanhamento"). PosicoesEncerradas.gs + assets/js/pages/radar-encerradas.js + a tela.
// Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { JSDOM } from 'jsdom';
import { separarEncerradas, radarSemEncerradas, planoPercentualEncerrada, textoPlano, blocoEncerradasHtml, foraDoRanking } from '../assets/js/pages/radar-encerradas.js';
import { renderRadarOportunidades } from '../assets/js/pages/distribuicoes-metas.js';
import { filtrarPrateleira } from '../assets/js/pages/aportes.js';

function gs(extra = {}) {
  const sb = { console, ...extra };
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(new URL('../apps-script/PosicoesEncerradas.gs', import.meta.url), 'utf8'), { filename: 'PosicoesEncerradas.gs' }).runInContext(sb);
  return sb;
}

const TX = [
  { data: '2026-03-02', tipo: 'Compra', preco: 10, quantidade: 50, total: 500 },
  { data: '2026-04-10', tipo: 'Compra', preco: 8, quantidade: 50, total: 400 },
  { data: '2026-09-15', tipo: 'Venda', preco: 9.5, quantidade: 100, total: 950 },
];
const PROV = [
  { dataCom: '2026-05-20', dataPagamento: '2026-06-10', liquido: 12 },
  { dataCom: '2026-08-30', dataPagamento: '2026-10-05', liquido: 8 }, // data-com no ciclo, pago depois da venda: conta
  { dataCom: '2025-12-01', dataPagamento: '2026-01-10', liquido: 99 }, // de antes do ciclo: não conta
];

test('GS resumoCicloEncerrado_: compras, vendas, proventos do ciclo e o resultado; a cotação de hoje contra a venda', () => {
  const r = gs().resumoCicloEncerrado_(TX, PROV, 9);
  assert.equal(r.inicio, '2026-03-02');
  assert.equal(r.fim, '2026-09-15');
  assert.equal(r.dias, 197);
  assert.equal(r.compras, 900);
  assert.equal(r.vendas, 950);
  assert.equal(r.precoMedioCompra, 9);
  assert.equal(r.precoMedioVenda, 9.5);
  assert.equal(r.lucroRealizado, 50);
  assert.equal(r.proventos, 20);
  assert.equal(r.resultado, 70);
  assert.equal(r.resultadoPct, 0.0778);
  assert.equal(r.desdeAVenda, -0.0526, 'hoje 5,3% abaixo do preço da venda');
});

test('GS resumoCicloEncerrado_: só o ÚLTIMO ciclo; ainda com cotas, só compras ou nada = null', () => {
  const sb = gs();
  const doisCiclos = [
    { data: '2025-01-02', tipo: 'Compra', preco: 20, quantidade: 10, total: 200 },
    { data: '2025-06-02', tipo: 'Venda', preco: 30, quantidade: 10, total: 300 },
    ...TX,
  ];
  assert.equal(sb.resumoCicloEncerrado_(doisCiclos, [], 9).inicio, '2026-03-02');
  assert.equal(sb.resumoCicloEncerrado_(TX.slice(0, 2), [], 9), null, 'só compras');
  assert.equal(sb.resumoCicloEncerrado_([...TX.slice(0, 2), { data: '2026-09-15', tipo: 'Venda', preco: 9, quantidade: 40, total: 360 }], [], 9), null, 'venda parcial');
  assert.equal(sb.resumoCicloEncerrado_([...TX, { data: '2026-10-01', tipo: 'Compra', preco: 9, quantidade: 5, total: 45 }], [], 9), null, 'comprou de novo');
  assert.equal(sb.resumoCicloEncerrado_([], [], 9), null);
});

test('GS anexarPosicoesEncerradasRadar_: marca só quem tem quantidade 0 e vendeu; nunca comprado continua no ranking', () => {
  const txPorTicker = { AAAA3: TX, BBBB3: [] };
  const sb = gs({
    transacoesDoAtivo_: (ss, t) => txPorTicker[t] || [],
    memoAtivo_: (k, fn) => fn(),
    lerLinhasAbaProventos_: () => PROV.map((p) => ({ ...p, ticker: 'AAAA3' })),
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => JSON.stringify({ AAAA3: 'acompanhar' }) }) },
  });
  const itens = [
    { ativo: 'AAAA3', quantidadeCarteira: 0, precoAtual: 9 },
    { ativo: 'BBBB3', quantidadeCarteira: 0, precoAtual: 5 },
    { ativo: 'CCCC3', quantidadeCarteira: 10, precoAtual: 5 },
  ];
  const prefs = sb.anexarPosicoesEncerradasRadar_({}, [{ classe: 'acoes', itens }]);
  assert.equal(itens[0].encerrada.resultado, 70);
  assert.equal(itens[0].encerrada.moeda, 'BRL');
  assert.equal(itens[0].encerrada.preferencia, 'acompanhar');
  assert.equal(itens[1].encerrada, undefined, 'nunca vendeu (só observando)');
  assert.equal(itens[2].encerrada, undefined);
  assert.equal(prefs.AAAA3, 'acompanhar');
});

test('GS handleSalvarPercentuaisRadar: confere todas as linhas antes de gravar (tudo ou nada)', () => {
  const celulas = { C42: 'AAAA3', C43: 'BBBB3' };
  const gravadas = [];
  const dm = { getRange: (a1) => ({ getValue: () => celulas[a1] || '', setValue: (v) => gravadas.push([a1, v]) }) };
  const sb = gs({
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: () => dm }) },
    localDistribuicaoMetas_: () => ({ radarAcoes: 42, radarUsa: 59, radarFiis: 82 }),
    jsonOut: (o) => o,
  });
  const ok = sb.handleSalvarPercentuaisRadar({ parameter: { tabela: 'acoesNacionais', itens: JSON.stringify([{ linha: 42, ativo: 'AAAA3', percentualDesejado: 0 }, { linha: 43, ativo: 'BBBB3', percentualDesejado: 0.125 }]) } });
  assert.equal(ok.ok, true);
  assert.deepEqual(gravadas, [['L42', 0], ['L43', 0.125]]);
  gravadas.length = 0;
  const errado = sb.handleSalvarPercentuaisRadar({ parameter: { tabela: 'acoesNacionais', itens: JSON.stringify([{ linha: 42, ativo: 'AAAA3', percentualDesejado: 0 }, { linha: 43, ativo: 'ZZZZ3', percentualDesejado: 0.1 }]) } });
  assert.equal(errado.ok, false);
  assert.match(errado.erro, /não é mais o ativo ZZZZ3/);
  assert.deepEqual(gravadas, [], 'nada gravado');
  assert.equal(sb.handleSalvarPercentuaisRadar({ parameter: { tabela: 'x', itens: '[]' } }).ok, false);
});

// ---- front ----
const ENC = (extra = {}) => ({ inicio: '2026-03-02', fim: '2026-09-15', dias: 197, compras: 900, vendas: 950, precoMedioCompra: 9, precoMedioVenda: 9.5, lucroRealizado: 50, proventos: 20, resultado: 70, resultadoPct: 0.0778, desdeAVenda: -0.0526, moeda: 'BRL', preferencia: null, ...extra });
const item = (ativo, linha, pct, extra = {}) => ({ linha, ranking: linha - 41, ativo, precoAtual: 9, precoTeto: 12, vies: 'Comprar', percentualDesejado: pct, percentualAtual: 0.05, carteiraAtual: 500, ...extra });

test('separarEncerradas / radarSemEncerradas: encerrada sai do ranking; "acompanhar" volta; "oculta" some do bloco', () => {
  const itens = [item('AAAA3', 42, 0.1, { encerrada: ENC() }), item('BBBB3', 43, 0.5), item('CCCC3', 44, 0.4, { encerrada: ENC({ preferencia: 'acompanhar' }) }), item('DDDD3', 45, 0, { encerrada: ENC({ preferencia: 'oculta' }) })];
  const s = separarEncerradas(itens);
  assert.deepEqual(s.ativos.map((i) => i.ativo), ['BBBB3', 'CCCC3']);
  assert.deepEqual(s.encerradas.map((i) => i.ativo), ['AAAA3']);
  assert.deepEqual(s.ocultas.map((i) => i.ativo), ['DDDD3']);
  assert.equal(foraDoRanking(itens[2]), false);
  const r = radarSemEncerradas({ acoesNacionais: { itens, total: {} }, fiis: { itens: [] }, cotacaoDolar: 5 });
  assert.equal(r.acoesNacionais.itens.length, 2);
  assert.equal(r.cotacaoDolar, 5);
});

test('planoPercentualEncerrada: as outras já somam 100% ou mais = só zerar (redistribuir passaria de 100%)', () => {
  const itens = [item('AAAA3', 42, 0.11, { encerrada: ENC() }), item('BBBB3', 43, 0.6), item('CCCC3', 44, 0.4)];
  const p = planoPercentualEncerrada(itens, 'AAAA3');
  assert.equal(p.modo, 'zerar');
  assert.deepEqual(p.mudancas, [{ linha: 42, ativo: 'AAAA3', de: 0.11, para: 0 }]);
  assert.match(textoPlano(p), /já somam 100,0%, então basta zerar/);
  assert.equal(planoPercentualEncerrada([item('AAAA3', 42, 0, { encerrada: ENC() })], 'AAAA3'), null, 'já está em 0%');
});

test('planoPercentualEncerrada: abaixo de 100% = redistribui só o que o encerrado tinha (no máximo até 100%), na proporção', () => {
  const itens = [item('AAAA3', 42, 0.2, { encerrada: ENC() }), item('BBBB3', 43, 0.5), item('CCCC3', 44, 0.25), item('DDDD3', 45, 0)];
  const p = planoPercentualEncerrada(itens, 'AAAA3');
  assert.equal(p.modo, 'redistribuir');
  assert.equal(p.distribuido, 0.2);
  const para = Object.fromEntries(p.mudancas.map((m) => [m.ativo, m.para]));
  assert.equal(para.AAAA3, 0);
  assert.equal(para.BBBB3, 0.6333);
  assert.equal(para.CCCC3, 0.3167);
  assert.equal(para.DDDD3, undefined, 'quem está em 0% não ganha nada');
  assert.equal(Math.round((para.BBBB3 + para.CCCC3) * 10000), 9500, 'a soma volta ao que era com o encerrado (95%)');
  // faltava menos do que o encerrado tinha: só completa 100%
  const p2 = planoPercentualEncerrada([item('AAAA3', 42, 0.3, { encerrada: ENC() }), item('BBBB3', 43, 0.9)], 'AAAA3');
  assert.equal(p2.distribuido, 0.1);
  assert.equal(p2.mudancas[1].para, 1);
  assert.match(textoPlano(p2), /os 10,0% que faltam pra 100%/);
  assert.match(textoPlano(p), /a soma continua em 95,0%/);
});

test('blocoEncerradasHtml: resultado, período, cotação de hoje contra a venda e as ações', () => {
  const html = blocoEncerradasHtml([item('AAAA3', 42, 0, { encerrada: ENC() })], { ocultas: [item('DDDD3', 45, 0, { encerrada: ENC({ preferencia: 'oculta' }) })] });
  assert.match(html, /Posições encerradas <b>\(1\)<\/b>/);
  assert.match(html, /02\/03\/2026 → 15\/09\/2026 · 6 meses/);
  assert.match(html, /\+R\$\s70,00/);
  assert.match(html, /5,3% abaixo da sua venda/);
  assert.match(html, /data-enc-acao="acompanhar"/);
  assert.match(html, /1 oculta/);
  assert.equal(blocoEncerradasHtml([], { ocultas: [] }), '');
});

const makeDom = () => new JSDOM('<!doctype html><html><body><div id="c"></div></body></html>').window.document;

test('tela: a encerrada não entra na tabela nem no "X de N"; aviso do % desejado grava o plano; bloco com as ações', async () => {
  const doc = makeDom();
  const container = doc.getElementById('c');
  const radar = {
    acoesNacionais: { itens: [item('AAAA3', 42, 0.2, { encerrada: ENC() }), item('BBBB3', 43, 0.5), item('CCCC3', 44, 0.25)], total: { carteiraAtual: 1000 } },
    acoesInternacionais: { itens: [], total: {} }, fiis: { itens: [], total: {} },
  };
  const planos = []; const prefs = [];
  renderRadarOportunidades(doc, container, radar, {
    onPlanoPercentual: async (tabela, mudancas) => { planos.push([tabela, mudancas]); },
    onPreferenciaEncerrada: async (t, p) => { prefs.push([t, p]); },
  });
  const linhas = [...container.querySelectorAll('.radar-table tbody tr.radar-linha')].map((tr) => tr.textContent);
  assert.equal(linhas.length, 2);
  assert.ok(!linhas.some((t) => /AAAA3/.test(t)));
  const aviso = container.querySelector('.radar-enc-aviso');
  assert.match(aviso.textContent, /AAAA3 foi vendido por completo/);
  aviso.querySelector('[data-plano="principal"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(planos[0][0], 'acoesNacionais');
  assert.equal(planos[0][1].length, 3);
  const bloco = container.querySelector('.radar-encerradas');
  assert.match(bloco.textContent, /Posições encerradas \(1\)/);
  bloco.querySelector('[data-enc-acao="oculta"]').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(prefs, [['AAAA3', 'oculta']]);
});

test('Aportes: posição encerrada vai pro fim da prateleira e sai do "só Comprar"', () => {
  const lista = [
    { ticker: 'AAAA3', vies: 'Comprar', totalAtualizado: 0, encerrada: { data: '2026-09-15' } },
    { ticker: 'BBBB3', vies: 'Comprar', totalAtualizado: 100 },
    { ticker: 'CCCC3', vies: 'Comprar', totalAtualizado: 50 },
  ];
  assert.deepEqual(filtrarPrateleira(lista, { classeAtiva: 'acoes', ordem: 'nome' }).map((a) => a.ticker), ['BBBB3', 'CCCC3', 'AAAA3']);
  assert.deepEqual(filtrarPrateleira(lista, { classeAtiva: 'acoes', soComprar: true }).map((a) => a.ticker), ['BBBB3', 'CCCC3']);
});
