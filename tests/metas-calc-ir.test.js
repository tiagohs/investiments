// tests/metas-calc-ir.test.js - 09/10/2026 (Tiago: "considere [o IR hoje × no vencimento] também nos cálculos das metas, que
// considera valor líquido se incluir um vencimento"). assets/js/pages/metas-calc-ir.js + o uso em calcularMeta.
// Dados inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { projetarTituloAte, rendaFixaNaData, diaDaMeta, hojeIso } from '../assets/js/pages/metas-calc-ir.js';
import { compararResgate, custodiaDoTitulo } from '../assets/js/ir-resgate-rf.js';
import { calcularMeta, dicasAcelerar, eventosVencimento } from '../assets/js/pages/metas-calc.js';

const HOJE = '2026-10-09';
const JUROS = { selic: 0.15, ipcaEsperado: 0.045, ipca12m: 0.05, cdi12m: 0.145 };
// 2 lotes: um de jan/2024 (já em 15%) e um de jun/2026 (22,5% hoje, 20% no vencimento)
const LOTES = [
  { dataAplicacao: '10/01/2024', valorInvestido: 5000, valorAtual: 6500, imposto: 225, iof: 0, aliquota: 0.15 },
  { dataAplicacao: '01/06/2026', valorInvestido: 3000, valorAtual: 3150, imposto: 33.75, iof: 0, aliquota: 0.225 },
];
const TESOURO = {
  id: 'rf:Tesouro Selic 2027|Corretora X@objetivo', ref: 'rf:Tesouro Selic 2027|Corretora X', nome: 'Tesouro Selic 2027 · 03/2027', classe: 'rf', marca: 'objetivo',
  indexador: 'SELIC', vencimento: '03/2027', vencimentoData: '2027-03-01', descricao: 'Tesouro Selic 2027', valorBRL: 9650,
  irResgate: { ir: 258.75, iof: 0, liquido: 9391.25, isento: false, precisao: 'por-lote', lotes: LOTES },
};
const CTX = { ativos: [TESOURO], cambio: {}, hoje: HOJE, referencias: {}, juros: JUROS };
const META = { id: 'm1', tipo: 'acumulo', nome: 'Entrada do apê', valorAlvo: 60000, dataAlvo: '2028-06', rendimentoAnual: 0.1, aporteMensal: 1500, vinculos: [{ tipo: 'ativo', id: TESOURO.id, modo: 'total' }], status: 'ativa' };

test('datas: hoje em ISO e o dia usado pra data da meta (meio do mês)', () => {
  assert.equal(hojeIso('2026-10-09'), '2026-10-09');
  assert.equal(hojeIso('2026-10'), '2026-10-01');
  assert.equal(diaDaMeta('2028-06'), '2028-06-15');
  assert.equal(diaDaMeta('x'), null);
});

test('até o vencimento: a mesma conta da tela do título (taxa Selic, IR de cada lote no dia, custódia)', () => {
  const p = projetarTituloAte(TESOURO, { hoje: HOJE, juros: JUROS });
  const ref = compararResgate({ lotes: LOTES, valorAtual: 9650, hoje: HOJE, vencimento: '2027-03-01', taxaAnual: 0.15, custodia: custodiaDoTitulo(TESOURO.nome, TESOURO.descricao) });
  assert.equal(p.venceAntes, true);
  assert.equal(p.data, '2027-03-01');
  assert.equal(p.base, 'Selic');
  assert.equal(p.estimado, false);
  assert.ok(Math.abs(p.bruto - ref.vencimento.bruto) < 0.01);
  assert.ok(Math.abs(p.imposto - ref.vencimento.imposto) < 0.01);
  assert.ok(Math.abs(p.liquido - ref.vencimento.liquido) < 0.01);
  // o lote novo sai de 22,5% (hoje) pra 20% no vencimento; o antigo fica em 15%
  assert.deepEqual(ref.lotes.map((l) => l.vencimento.aliquota), [0.15, 0.2]);
  assert.ok(p.hoje.imposto > 258 && p.hoje.imposto < 259, 'IR de hoje = o do Apps Script');
});

test('meta ANTES do vencimento: vai só até a data da meta (sem reaplicar); meta DEPOIS: IR no vencimento e o líquido reaplicado', () => {
  const antes = projetarTituloAte(TESOURO, { hoje: HOJE, ate: '2026-12-15', juros: JUROS });
  assert.equal(antes.venceAntes, false);
  assert.equal(antes.reaplicado, null);
  assert.equal(antes.data, '2026-12-15');
  const noVenc = projetarTituloAte(TESOURO, { hoje: HOJE, juros: JUROS });
  assert.ok(antes.bruto < noVenc.bruto);
  const depois = projetarTituloAte(TESOURO, { hoje: HOJE, ate: '2028-06-15', juros: JUROS });
  assert.equal(depois.venceAntes, true);
  assert.equal(depois.vencimento.data, '2027-03-01');
  assert.ok(depois.reaplicado && depois.reaplicado.dias > 400);
  assert.ok(depois.liquido > depois.vencimento.liquido, 'o líquido do vencimento continua rendendo');
  assert.ok(depois.imposto > depois.vencimento.imposto, 'o rendimento depois do vencimento paga IR de novo');
  assert.ok(Math.abs(depois.bruto - depois.imposto - depois.custodia - depois.liquido) < 0.02);
  // vence no mesmo mês da meta: conta como "esperou o vencimento", não como venda antecipada
  const mesmoMes = projetarTituloAte(TESOURO, { hoje: HOJE, ate: '2027-03-15', juros: JUROS });
  assert.equal(mesmoMes.venceAntes, true);
});

test('sem lotes = null (quem chama usa a conta antiga); sem taxa do título = rendimento da meta (estimado); parte do vínculo', () => {
  assert.equal(projetarTituloAte({ ...TESOURO, irResgate: { ir: 1, iof: 0 } }, { hoje: HOJE, juros: JUROS }), null);
  const semTaxa = projetarTituloAte({ ...TESOURO, indexador: null, descricao: 'Título X', nome: 'Título X' }, { hoje: HOJE, juros: JUROS, taxaMetaAnual: 0.1 });
  assert.equal(semTaxa.base, 'meta');
  assert.equal(semTaxa.estimado, true);
  const metade = projetarTituloAte(TESOURO, { hoje: HOJE, juros: JUROS, parte: 0.5 });
  const todo = projetarTituloAte(TESOURO, { hoje: HOJE, juros: JUROS });
  assert.ok(Math.abs(metade.imposto * 2 - todo.imposto) < 0.05);
});

test('isento (LCI/LCA): sem IR em data nenhuma', () => {
  const lci = { ...TESOURO, nome: 'LCI Banco Y', descricao: 'LCI', indexador: 'CDI', taxaTexto: '95% do CDI', irResgate: { ir: 0, iof: 0, isento: true, lotes: LOTES.map((l) => ({ ...l, imposto: 0, aliquota: 0 })) } };
  const p = projetarTituloAte(lci, { hoje: HOJE, ate: '2028-06-15', juros: JUROS });
  assert.equal(p.imposto, 0);
  assert.equal(p.custodia, 0, 'fora do Tesouro não tem custódia da B3');
});

test('rendaFixaNaData: soma os títulos vinculados na data da meta e separa o IR a mais', () => {
  const nd = rendaFixaNaData([{ valorBRL: 9650, base: 9650, ativos: [TESOURO] }], { mes: '2028-06', hoje: HOJE, juros: JUROS });
  assert.equal(nd.titulos.length, 1);
  assert.equal(nd.vencemAntes, 1);
  assert.ok(nd.imposto > nd.hoje.imposto);
  assert.ok(Math.abs(nd.impostoExtra - (nd.imposto - nd.hoje.imposto)) < 0.01);
  assert.equal(rendaFixaNaData([], { mes: '2028-06', hoje: HOJE }), null);
});

test('calcularMeta: com data, o IR da renda fixa NA DATA soma ao alvo do ritmo (aporte necessário maior) e vira dica', () => {
  const c = calcularMeta(META, CTX);
  assert.ok(c.rfNaData, 'projetou a renda fixa até jun/2028');
  assert.ok(c.impostoNaData > 0);
  assert.equal(c.alvoParaRitmo, Math.round((c.alvoBRL + c.impostoNaData) * 100) / 100);
  const semLotes = calcularMeta(META, { ...CTX, ativos: [{ ...TESOURO, irResgate: { ...TESOURO.irResgate, lotes: undefined } }] });
  assert.equal(semLotes.rfNaData, null);
  assert.equal(semLotes.impostoNaData, 0);
  assert.ok(c.aporteNecessario > semLotes.aporteNecessario, 'pra chegar com o alvo líquido');
  const d = dicasAcelerar(c, META, { hoje: '2026-10' }).find((x) => x.id === 'imposto-data');
  assert.ok(d, 'dica do IR na data');
  assert.match(d.texto, /jun\/2028/);
  // sem data (sem prazo) não há "data da meta"
  assert.equal(calcularMeta({ ...META, dataAlvo: null }, CTX).rfNaData, null);
});

test('vencimentos: título com lotes usa a taxa dele e a custódia; meta comum só vê o que vence até a data, sem "mínimo"', () => {
  const c = calcularMeta(META, CTX);
  const e = c.vencimentos.eventos[0];
  assert.equal(c.vencimentos.reserva, false);
  assert.equal(c.vencimentos.porLote, true);
  assert.equal(e.mes, '2027-03');
  assert.equal(e.titulos[0].porLote, true);
  assert.equal(e.titulos[0].taxaBase, 'Selic');
  assert.doesNotMatch(e.texto, /reserva/i);
  const curta = calcularMeta({ ...META, dataAlvo: '2027-01' }, CTX);
  assert.equal(curta.vencimentos, null, 'vence depois da data da meta: não entra');
  // reserva: segue com o mínimo e a mesma conta por lote
  const reserva = { id: 'r1', tipo: 'reservaEmergencia', nome: 'Reserva', rendimentoAnual: 0.1, especificos: { despesaMensal: 1000, meses: 6 }, vinculos: [{ tipo: 'ativo', id: TESOURO.id, modo: 'total' }], status: 'ativa' };
  const cr = calcularMeta(reserva, CTX);
  assert.equal(cr.vencimentos.reserva, true);
  assert.ok(cr.vencimentos.minimo > 0);
  assert.equal(cr.vencimentos.eventos[0].titulos[0].porLote, true);
  assert.equal(eventosVencimento(null), null);
});

// ---- Apps Script (Metas.gs): lotes na proporção do ativo e os juros sem rede ----

function gsMetas({ cache = null, benchmarks = null } = {}) {
  const sb = {
    console, Utilities: {}, Session: { getScriptTimeZone: () => 'America/Sao_Paulo' },
    CacheService: { getScriptCache: () => ({ get: () => cache }) },
  };
  vm.createContext(sb);
  for (const f of ['RendaFixaIR.gs', 'Metas.gs']) new vm.Script(fs.readFileSync(new URL(`../apps-script/${f}`, import.meta.url), 'utf8'), { filename: f }).runInContext(sb);
  sb.MACRO_CACHE_CHAVE_ = 'macro_v1';
  sb.benchmarksRendaFixaSemRede_ = () => benchmarks;
  return sb;
}

test('Metas.gs: irResgateDoAtivo_ manda os lotes na proporção do ativo (posição dividida entre metas)', () => {
  const sb = gsMetas();
  const pos = { isento: false, precisao: 'por-lote', valorLiquidoSeResgatasseHoje: 9391.25, impostoSeResgatasseHoje: 258.75, detalhes: [
    { dataAplicacao: '10/01/2024', diasCorridos: 1003, valorInvestido: 5000, valorAtual: 6500, rendimento: 1500, aliquota: 0.15, iof: 0, imposto: 225 },
    { dataAplicacao: '01/06/2026', diasCorridos: 130, valorInvestido: 3000, valorAtual: 3150, rendimento: 150, aliquota: 0.225, iof: 0, imposto: 33.75 },
    { dataAplicacao: '02/06/2026', diasCorridos: 129, valorInvestido: null, valorAtual: null, rendimento: 0, aliquota: 0.225, iof: 0, imposto: 0 },
  ] };
  const r = sb.irResgateDoAtivo_(pos, 4825, '03/2027'); // metade da posição
  assert.equal(r.lotes.length, 2, 'lote sem valores fica de fora');
  assert.deepEqual(JSON.parse(JSON.stringify(r.lotes[0])), ['10/01/2024', 2500, 3250, 112.5]);
  // o front lê o formato compacto e dá a mesma projeção que com os lotes em objeto
  const compacto = projetarTituloAte({ ...TESOURO, irResgate: { ...TESOURO.irResgate, lotes: LOTES.map((l) => [l.dataAplicacao, l.valorInvestido, l.valorAtual, l.imposto]) } }, { hoje: HOJE, juros: JUROS });
  assert.equal(compacto.liquido, projetarTituloAte(TESOURO, { hoje: HOJE, juros: JUROS }).liquido);
  assert.ok(r.vencimento, 'continua mandando a conta antiga (alíquota média)');
});

test('Metas.gs: jurosParaMetas_ usa o macro em cache; sem ele, os índices da planilha; sem nada, null', () => {
  const comMacro = gsMetas({ cache: JSON.stringify({ juros: { selic: 0.15, ipcaEsperado12m: 0.045, ipca12m: 0.05, cdi12m: 0.145 } }) });
  assert.deepEqual(JSON.parse(JSON.stringify(comMacro.jurosParaMetas_({}))), { selic: 0.15, ipcaEsperado: 0.045, ipca12m: 0.05, cdi12m: 0.145, fonte: 'macro' });
  const semMacro = gsMetas({ benchmarks: { selic: 0.149, cdi: 0.148, ipca: 0.05 } });
  assert.equal(semMacro.jurosParaMetas_({}).fonte, 'planilha');
  assert.equal(semMacro.jurosParaMetas_({}).selic, 0.149);
  assert.equal(gsMetas().jurosParaMetas_({}), null);
});

test('tela da meta: linha "Renda fixa em jun/2028" nos vínculos e bloco "Títulos que vencem antes da data"', async () => {
  const { JSDOM } = await import('jsdom');
  const { montarPaginaMetas, TEMPLATE_METAS } = await import('../assets/js/pages/metas.js');
  const dom = new JSDOM(`<!doctype html><html><head></head><body data-section="metas"><main>${TEMPLATE_METAS}</main></body></html>`, { url: 'https://exemplo.test/metas.html#meta=m1', pretendToBeVisual: true });
  const w = dom.window; w.confirm = () => true; w.alert = () => {};
  const servidor = { ok: true, hoje: HOJE, arquivadas: [], cambio: {}, referencias: {}, proventos12m: { porTicker: {} }, ativos: [TESOURO], metas: [META], juros: JUROS };
  await montarPaginaMetas('tk', {
    doc: w.document, win: w, usarCache: false,
    getMetasImpl: async () => JSON.parse(JSON.stringify(servidor)), salvarMetaImpl: async () => ({ ok: true }), excluirMetaImpl: async () => ({ ok: true }),
    getMetasHistoricoImpl: async () => ({ ok: true, hoje: HOJE, metas: {}, indices: [] }), carregarDadosViagemImpl: async () => ({ paises: [], cidades: [], taxas: {} }),
  });
  for (let i = 0; i < 3; i++) await new Promise((r) => setTimeout(r, 0));
  const linha = w.document.querySelector('.mt-vinculos li.liquido-data');
  assert.ok(linha, 'linha da renda fixa na data');
  assert.match(linha.textContent, /Renda fixa em jun\/2028/);
  assert.match(linha.textContent, /1 título vence antes/);
  const bloco = w.document.querySelector('#mtVencimentos');
  assert.ok(bloco, 'bloco de vencimentos fora da reserva');
  assert.match(bloco.textContent, /Títulos que vencem antes da data/);
  assert.match(bloco.textContent, /mar\/2027/);
  assert.doesNotMatch(bloco.textContent, /Reserva sem reaplicar/);
});
