// tests/ir-resgate-rf.test.js - 09/10/2026: IR de um título de Renda Fixa resgatando hoje x no vencimento
// (assets/js/ir-resgate-rf.js) e a seção da tela do título (pages/ativo-ir-resgate.js). Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import {
  aliquotaIR, aliquotaIof, compararResgate, taxaProjetada, dataVencimento, custodiaDoTitulo, diasEntre, somarDias,
} from '../assets/js/ir-resgate-rf.js';

const perto = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test('tabela regressiva e IOF: as mesmas do Apps Script', () => {
  assert.deepEqual([180, 181, 360, 361, 720, 721].map(aliquotaIR), [0.225, 0.2, 0.2, 0.175, 0.175, 0.15]);
  assert.equal(aliquotaIof(1), 0.96);
  assert.equal(aliquotaIof(29), 0.03);
  assert.equal(aliquotaIof(30), 0);
  assert.equal(diasEntre('2024-11-06', '2026-10-28'), 721);
  assert.equal(somarDias('2024-11-06', 721), '2026-10-28');
});

test('taxaProjetada: Selic + contratado, % do CDI, CDI +, IPCA +, prefixado; sem mercado = null', () => {
  const juros = { selic: 0.14, ipcaEsperado: 0.04, cdi12m: 0.13 };
  perto(taxaProjetada({ indexador: 'SELIC', texto: 'SELIC + 0,1%', juros }).taxa, 1.14 * 1.001 - 1, 1e-12);
  perto(taxaProjetada({ indexador: 'CDI', texto: '110% do CDI', juros }).taxa, 0.139 * 1.1, 1e-12);
  perto(taxaProjetada({ indexador: 'CDI', texto: 'CDI + 1%', juros }).taxa, 1.139 * 1.01 - 1, 1e-12);
  perto(taxaProjetada({ indexador: 'IPCA', texto: 'IPCA + 6,5%', juros }).taxa, 1.04 * 1.065 - 1, 1e-12);
  perto(taxaProjetada({ indexador: 'PRE', texto: '12,5% a.a.', juros }).taxa, 0.125, 1e-12);
  assert.equal(taxaProjetada({ indexador: 'SELIC', texto: 'SELIC + 0,1%', juros: null }), null);
});

test('dataVencimento: data completa quando vem; só MM/aaaa = dia 1º, aproximada', () => {
  assert.deepEqual(dataVencimento({ vencimentoData: '2027-03-01', vencimento: '03/2027' }), { data: '2027-03-01', aproximada: false });
  assert.deepEqual(dataVencimento({ vencimento: '05/2029' }), { data: '2029-05-01', aproximada: true });
  assert.equal(dataVencimento({}), null);
});

test('custódia: Tesouro 0,20% a.a.; Tesouro Selic com isenção de R$ 10 mil; fora do Tesouro, nada', () => {
  assert.deepEqual(custodiaDoTitulo('Tesouro Selic 2027', 'Tesouro Selic (LFT)'), { taxa: 0.002, isencao: 10000 });
  assert.deepEqual(custodiaDoTitulo('Tesouro IPCA+ 2029', 'Tesouro IPCA+'), { taxa: 0.002, isencao: 0 });
  assert.equal(custodiaDoTitulo('CDB Banco X', 'CDB'), null);
});

// 3 lotes: um já em 15%, dois em 17,5% que cruzam os 720 dias antes do vencimento
const LOTES = [
  { dataAplicacao: '15/03/2022', valorInvestido: 1000, valorAtual: 1800, imposto: 120, iof: 0, aliquota: 0.15 },
  { dataAplicacao: '06/11/2024', valorInvestido: 2000, valorAtual: 2500, imposto: 87.5, iof: 0, aliquota: 0.175 },
  { dataAplicacao: '06/12/2024', valorInvestido: 1000, valorAtual: 1200, imposto: 35, iof: 0, aliquota: 0.175 },
];

test('compararResgate: hoje usa o IR do Apps Script e dá a alíquota efetiva; no vencimento tudo a 15% e o líquido maior', () => {
  const r = compararResgate({ lotes: LOTES, valorAtual: 5500, hoje: '2026-10-07', vencimento: '2027-03-01', taxaAnual: 0.14, custodia: { taxa: 0.002, isencao: 0 } });
  perto(r.hoje.imposto, 242.5);
  perto(r.hoje.ganho, 1500);
  perto(r.hoje.aliquotaEfetiva, 242.5 / 1500, 1e-9);
  perto(r.hoje.liquido, 5500 - 242.5);
  const fator = 1.14 ** (145 / 365);
  perto(r.vencimento.fator, fator, 1e-12);
  perto(r.vencimento.bruto, 5500 * fator);
  assert.equal(r.vencimento.aliquotaEfetiva, 0.15, 'todos os lotes passam de 720 dias até o vencimento');
  perto(r.vencimento.imposto, (5500 * fator - 4000) * 0.15);
  assert.ok(r.vencimento.custodia > 0);
  assert.ok(r.diferenca.imposto > 0, 'paga mais IR em reais (o ganho cresce)');
  assert.ok(r.diferenca.liquido > 0, 'mas o líquido é maior');
  assert.equal(r.todos15, '2026-11-27', 'o último lote cruza 720 dias em 27/11/2026');
  assert.deepEqual(r.marcos.map((m) => m.data), ['2026-10-28', '2026-11-27']);
  assert.equal(r.jaTudo15, false);
});

test('compararResgate: sem taxa ou sem vencimento = só hoje e os marcos; tudo em 15% = jaTudo15; isento = sem imposto', () => {
  const s = compararResgate({ lotes: LOTES, valorAtual: 5500, hoje: '2026-10-07', vencimento: '2027-03-01', taxaAnual: null });
  assert.equal(s.vencimento, null);
  assert.equal(s.diferenca, null);
  assert.equal(s.marcos.length, 2);
  const velho = compararResgate({ lotes: [LOTES[0]], hoje: '2026-10-07' });
  assert.equal(velho.jaTudo15, true);
  assert.equal(velho.todos15, null);
  const isento = compararResgate({ lotes: [{ dataAplicacao: '2026-01-02', valorInvestido: 100, valorAtual: 110 }], hoje: '2026-10-07', vencimento: '2027-01-01', taxaAnual: 0.1, isento: true });
  assert.equal(isento.hoje.imposto, 0);
  assert.equal(isento.vencimento.imposto, 0);
  assert.equal(compararResgate({ lotes: [], hoje: '2026-10-07' }), null);
});

// ---------------------------------------------------------------------------
// A seção na tela do título
// ---------------------------------------------------------------------------

function montarDom() {
  const dom = new JSDOM(`<!doctype html><html><head></head><body data-section="carteiras">
    <header id="ativoCabecalho"></header>
    <div id="ativoLoading"></div><div id="ativoErro" hidden></div><div id="ativoConteudo" hidden></div></body></html>`,
  { url: 'https://exemplo.test/repo/ativo/index.html?ref=rf%3ATesouro%20Teste%202027%7CCORRETORA%20X', pretendToBeVisual: true });
  const w = dom.window;
  w.matchMedia = (q) => ({ matches: /prefers-reduced-motion/.test(q), media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
  globalThis.sessionStorage = w.sessionStorage;
  globalThis.localStorage = w.localStorage;
  return { doc: w.document, w };
}
const txt = (el) => el.textContent.replace(/\s+/g, ' ').trim();

function respostaRf() {
  return {
    ok: true, hoje: '2026-10-07', tipo: 'rf', ticker: 'Tesouro Teste 2027', classe: 'rendaFixa', moeda: 'BRL',
    ativo: { nomePersonalizado: 'Tesouro Teste 2027', tipoInvestimento: 'Tesouro Selic (LFT)', indexador: 'SELIC', instituicao: 'CORRETORA X', tipoCarteira: 'longo-prazo',
      quantidade: 0.4, vencimento: '03/2027', vencimentoData: '2027-03-01', totalInvestido: 4000, totalAtualizado: 5500,
      rentabilidadeContratada: { indice: 'SELIC', texto: 'SELIC + 0,05%' },
      irSeResgatasseHoje: { impostoSeResgatasseHoje: 242.5, valorLiquidoSeResgatasseHoje: 5257.5, precisao: 'por-lote', detalhes: LOTES } },
    serie: [{ data: '2026-10-01', valor: 5480 }, { data: '2026-10-07', valor: 5500 }],
    transacoes: [], proventos: [], aReceber: [], pagosNaoLancados: [], indices: [{ data: '2026-10-01', cdi: 100, ipca: 50, patrimonio: 1000 }],
  };
}

async function montar({ macro = null } = {}) {
  const { doc, w } = montarDom();
  const { montarPaginaAtivo } = await import('../assets/js/pages/ativo.js');
  await montarPaginaAtivo('tk', {
    doc,
    getAtivoImpl: async () => structuredClone(respostaRf()),
    getNoticiasImpl: async () => ({ ok: true, noticias: [] }),
    getTesesImpl: async () => ({ ok: true, configurado: false, teses: [], resumos: [] }),
    getIntradiaImpl: async (t, chaves) => ({ ok: true, resultado: Object.fromEntries(chaves.map((c) => [c, null])) }),
    getMetasImpl: async () => ({ ok: false }),
    getMacroImpl: macro ? async () => macro : undefined,
    carregarEstaticosImpl: async () => ({}),
    agora: () => new Date('2026-10-07T15:00:00Z'),
  });
  await new Promise((r) => setTimeout(r, 20));
  return { doc, w };
}

test('tela do título: IR hoje com a alíquota efetiva, o marco dos 15%, os lotes e as notas; sem Selic, pede a taxa', async () => {
  const { doc, w } = await montar();
  const sec = doc.getElementById('at-ir-resgate');
  assert.ok(sec, 'seção no corpo do título');
  assert.match(txt(sec), /Resgatando hoje, o IR fica em R\$\s242,50 \(16,2% do ganho\)/);
  assert.match(txt(sec), /a partir de 27\/11\/2026 já garante 15% em toda a posição/);
  assert.equal(sec.querySelectorAll('.at-irr-lotes tbody tr').length, 3);
  assert.match(txt(sec), /retido na fonte/);
  assert.match(txt(sec), /0,20% ao ano/);
  assert.match(txt(sec), /sem taxa do mercado agora/);
  // digitando a taxa, aparece o vencimento
  const inp = doc.getElementById('atIrrTaxa');
  inp.value = '14';
  inp.dispatchEvent(new w.Event('change'));
  assert.match(txt(doc.getElementById('atIrResgate')), /No vencimento \(01\/03\/2027\)/);
  assert.match(txt(doc.getElementById('atIrResgate')), /taxa que você digitou/);
});
