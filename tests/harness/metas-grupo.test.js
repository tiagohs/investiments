// tests/harness/metas-grupo.test.js
//
// 07/10/2026: Metas.gs - categoria "imoveis", meta sem alvo/prazo, aporte crescente, compra em grupo, saldo/investimento FORA DA CARTEIRA
// (nome, % do CDI, "conta no meu patrimônio"), série do CDI no GET metas e a lista pro Patrimônio. Tudo com dados INVENTADOS
// (planilha falsa em memória - o repositório é público). A conta do CDI do servidor é a MESMA do front (metas-calc-fora.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { montarSandboxComFixtures_ } from './gas-vm-harness.mjs';
import { estimarSaldoCdi } from '../../assets/js/pages/metas-calc-fora.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const FIXTURES = path.join(__dirname, 'fixtures.json');
const semRealm = (o) => JSON.parse(JSON.stringify(o));

function criarFalsa() {
  const abas = new Map();
  const nova = (nome) => {
    const cel = new Map();
    return {
      nome,
      cel,
      getLastRow() { let m = 0; for (const [k, v] of cel) if (v !== '' && v != null) m = Math.max(m, Number(k.split(',')[0])); return m; },
      getRange(r0, c0, nr = 1, nc = 1) {
        return {
          getValues() { const o = []; for (let r = r0; r < r0 + nr; r++) { const l = []; for (let c = c0; c < c0 + nc; c++) l.push(cel.get(`${r},${c}`) ?? ''); o.push(l); } return o; },
          setValues(v) { v.forEach((l, i) => l.forEach((x, j) => cel.set(`${r0 + i},${c0 + j}`, x))); },
        };
      },
      setFrozenRows() {},
    };
  };
  return { abas, getSheetByName: (n) => abas.get(n) || null, insertSheet: (n) => { const a = nova(n); abas.set(n, a); return a; } };
}

function sandbox({ cache = new Map(), fetch = null } = {}) {
  const sb = {
    console: { ...console, log() {} },
    SpreadsheetApp: { flush() {} },
    Utilities: { getUuid: (() => { let n = 0; return () => `0000000${++n}-aaaa`; })() },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v) }) },
    UrlFetchApp: { fetch: fetch || (() => { throw new Error('sem rede no teste'); }) },
    Logger: { log() {} },
  };
  vm.createContext(sb);
  new vm.Script('this.Date = Date;').runInContext(sb);
  for (const f of ['Metas.gs', 'Proventos.gs', 'RendaFixaIR.gs', 'Incorporacoes.gs']) { // RendaFixaIR.gs: tabela única de IOF; Incorporacoes.gs: aliases de ticker (A-13/A-14) // Proventos.gs: mediaRendaPassiva12Meses_ (janela de 12 meses)
    new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), { filename: f }).runInContext(sb);
  }
  // dependências de outros .gs (só o que montarTelaMetas_ chama quando não recebe tudo pronto)
  sb.cotacaoDolarHoje_ = () => 5.5;
  return sb;
}


const AGORA = '2026-10-07T12:00:00Z';

/** dias úteis (ago a 05/10) de CDI inventado: 0,05% ao dia, linhas [Data, 'CDI', % do dia] como em aux_historico-indices. */
function linhasCdi(sb) {
  const linhas = [];
  const d = new sb.Date('2026-07-31T12:00:00Z');
  for (let i = 0; i < 66; i += 1) {
    d.setUTCDate(d.getUTCDate() + 1);
    const dow = d.getUTCDay();
    if (dow === 0 || dow === 6) continue;
    linhas.push([new sb.Date(d.getTime()), 'CDI', 0.05]);
  }
  linhas.push([new sb.Date('2026-09-15T12:00:00Z'), 'IPCA', 0.4]); // outro índice: ignorado
  return linhas;
}

const META_CHACARA = {
  tipo: 'acumulo', categoria: 'imoveis', nome: 'Chácara com amigos', moeda: 'BRL', valorAlvo: null, dataAlvo: null,
  aporteMensal: 200, rendimentoAnual: 0.1,
  aporteCrescimento: { tipo: 'valor', valor: 100, mes: 10, referencia: '2026-10', inicio: '2025-10', lixo: 1 },
  especificos: { grupoPessoas: 4, precoReferencia: 300000, custosPct: 0.05, lixo: 1 },
  vinculos: [
    { tipo: 'saldo', id: 'sA', nome: 'Fundo de teste', instituicao: 'Corretora Z', moeda: 'BRL', saldo: 2000, atualizadoEm: '2026-09-14', cdiPct: 100, contaNoPatrimonio: true },
    { tipo: 'saldo', id: 'sB', instituicao: 'Banco Y', moeda: 'BRL', saldo: 500, atualizadoEm: '2026-09-14' },
    { tipo: 'saldo', id: 'sC', nome: 'Conta em euro', instituicao: 'Banco W', moeda: 'EUR', saldo: 100, atualizadoEm: '2026-09-14', cdiPct: 90, contaNoPatrimonio: true },
  ],
};

test('salvarMeta_: categoria imóvel, sem alvo nem prazo, aporte crescente, grupo e saldo fora da carteira vão e voltam (ida e volta)', () => {
  const sb = sandbox();
  const ss = criarFalsa();
  const agora = new sb.Date(AGORA);
  const r = semRealm(sb.salvarMeta_(ss, JSON.stringify(META_CHACARA), agora));
  assert.equal(r.ok, true);
  const lida = semRealm(sb.lerMetas_(ss))[0];
  assert.equal(lida.categoria, 'imoveis');
  assert.equal(lida.valorAlvo, null, 'alvo opcional');
  assert.equal(lida.dataAlvo, null, 'prazo opcional');
  assert.equal(lida.aporteMensal, 200);
  assert.deepEqual(lida.aporteCrescimento, { tipo: 'valor', valor: 100, mes: 10, referencia: '2026-10', inicio: '2025-10' }, 'campo desconhecido sai');
  assert.deepEqual(lida.especificos, { grupoPessoas: 4, precoReferencia: 300000, custosPct: 0.05 });
  const [a, b, c] = lida.vinculos;
  assert.deepEqual([a.tipo, a.nome, a.instituicao, a.saldo, a.cdiPct, a.contaNoPatrimonio], ['saldo', 'Fundo de teste', 'Corretora Z', 2000, 100, true]);
  assert.equal(b.nome, undefined);
  assert.equal(b.cdiPct, undefined);
  assert.equal(b.contaNoPatrimonio, undefined, 'só vai pro patrimônio quando marcado');
  assert.deepEqual([c.moeda, c.cdiPct, c.contaNoPatrimonio], ['EUR', 90, true]);
  // salvar de novo o que veio não muda nada
  const r2 = semRealm(sb.salvarMeta_(ss, JSON.stringify(lida), agora));
  assert.equal(r2.ok, true);
  const lida2 = semRealm(sb.lerMetas_(ss))[0];
  assert.deepEqual(lida2.vinculos.map((v) => [v.nome, v.cdiPct, v.contaNoPatrimonio, v.saldo]), lida.vinculos.map((v) => [v.nome, v.cdiPct, v.contaNoPatrimonio, v.saldo]));
  assert.deepEqual(lida2.aporteCrescimento, lida.aporteCrescimento);
  assert.deepEqual(lida2.especificos, lida.especificos);
});

test('salvarMeta_: aporte crescente em % e valores fora do esperado', () => {
  const sb = sandbox();
  const ss = criarFalsa();
  const agora = new sb.Date(AGORA);
  const ok = semRealm(sb.salvarMeta_(ss, JSON.stringify({ tipo: 'acumulo', nome: 'P', aporteMensal: 300, aporteCrescimento: { tipo: 'pct', valor: 0.08, mes: 1 }, especificos: { grupoPessoas: 1 } }), agora));
  assert.equal(ok.meta.aporteCrescimento.tipo, 'pct');
  assert.equal(ok.meta.aporteCrescimento.valor, 0.08);
  assert.equal(ok.meta.aporteCrescimento.mes, 1);
  assert.equal(ok.meta.especificos.grupoPessoas, undefined, '1 pessoa = sem grupo');
  const sem = semRealm(sb.salvarMeta_(ss, JSON.stringify({ tipo: 'acumulo', nome: 'Q', aporteMensal: 300, aporteCrescimento: { tipo: 'valor', valor: 0 } }), agora));
  assert.equal(sem.meta.aporteCrescimento, undefined, 'crescimento zero = sem crescimento (comportamento de sempre)');
  assert.throws(() => sb.salvarMeta_(ss, JSON.stringify({ tipo: 'acumulo', nome: 'R', aporteCrescimento: { tipo: 'valor', valor: 'abc' } }), agora));
  assert.throws(() => sb.salvarMeta_(ss, JSON.stringify({ tipo: 'acumulo', nome: 'S', especificos: { custosPct: 0.9 } }), agora));
});

test('serieCdiDeLinhasMetas_ e estimarSaldoCdiMetas_: a conta do servidor é a mesma do front (metas-calc-fora.js)', () => {
  const sb = sandbox();
  const agora = new sb.Date(AGORA);
  const serie = semRealm(sb.serieCdiDeLinhasMetas_(linhasCdi(sb), agora, 430));
  assert.ok(serie && serie.pontos.length >= 30);
  assert.equal(serie.pontos[0][1], 1, 'base 1');
  assert.equal(serie.ate, serie.pontos[serie.pontos.length - 1][0]);
  assert.equal(sb.serieCdiDeLinhasMetas_(linhasCdi(sb).slice(0, 10), agora, 430), null, 'pouco dado: sem série (as telas mostram o último valor informado)');
  for (const v of [
    { saldo: 2000, moeda: 'BRL', atualizadoEm: '2026-09-14', cdiPct: 100 },
    { saldo: 1000, moeda: 'BRL', atualizadoEm: '2026-09-14', cdiPct: 80 },
    { saldo: 1000, moeda: 'BRL', atualizadoEm: '2026-09-14' },
    { saldo: 1000, moeda: 'EUR', atualizadoEm: '2026-09-14', cdiPct: 100 },
    { saldo: 1000, moeda: 'BRL', atualizadoEm: serie.ate, cdiPct: 100 },
  ]) {
    const s = semRealm(sb.estimarSaldoCdiMetas_(v, serie));
    const f = estimarSaldoCdi(v, serie);
    assert.equal(s.valor, f.valor, JSON.stringify(v));
    assert.equal(s.estimado, f.estimado);
    assert.equal(s.ate, f.ate);
  }
  const e = semRealm(sb.estimarSaldoCdiMetas_({ saldo: 2000, moeda: 'BRL', atualizadoEm: '2026-09-14', cdiPct: 100 }, serie));
  assert.equal(e.estimado, true);
  assert.ok(e.valor > 2000 && e.valor < 2100, `~0,05% x ~17 dias úteis: ${e.valor}`);
});

test('montarTelaMetas_: manda a série do CDI só quando alguma meta usa "% do CDI"', () => {
  const sb = sandbox();
  const ss = criarFalsa();
  const agora = new sb.Date(AGORA);
  const opc = { ativos: [], referencias: {}, proventos: { recebidos: [], hoje: '2026-10-07' }, buscarCambio: () => ({ EUR: 6, USD: 5 }), historicoResumo: null };
  sb.salvarMeta_(ss, JSON.stringify({ tipo: 'acumulo', nome: 'Sem CDI' }), agora);
  assert.equal(semRealm(sb.montarTelaMetas_(ss, agora, opc)).cdi, undefined);
  sb.salvarMeta_(ss, JSON.stringify(META_CHACARA), agora);
  const serie = semRealm(sb.serieCdiDeLinhasMetas_(linhasCdi(sb), agora, 430));
  const r = semRealm(sb.montarTelaMetas_(ss, agora, { ...opc, serieCdi: serie }));
  assert.deepEqual(r.cdi, serie);
  assert.equal(r.metas.find((m) => m.nome === 'Chácara com amigos').valorAlvo, null);
});

test('listarOutrosInvestimentosMetas_: só os marcados "conta no meu patrimônio", em reais, com a estimativa do CDI; arquivada fica de fora', () => {
  const sb = sandbox();
  const ss = criarFalsa();
  const agora = new sb.Date(AGORA);
  assert.deepEqual(semRealm(sb.listarOutrosInvestimentosMetas_(ss, agora, { serieCdi: null })), [], 'sem aba: vazio');
  const { id } = sb.salvarMeta_(ss, JSON.stringify(META_CHACARA), agora);
  sb.salvarMeta_(ss, JSON.stringify({ tipo: 'acumulo', nome: 'Outra', vinculos: [{ tipo: 'saldo', id: 'x1', instituicao: 'Banco V', moeda: 'BRL', saldo: 700, atualizadoEm: '2026-09-01' }] }), agora);
  const serie = semRealm(sb.serieCdiDeLinhasMetas_(linhasCdi(sb), agora, 430));
  const lista = semRealm(sb.listarOutrosInvestimentosMetas_(ss, agora, { serieCdi: serie, buscarCambio: () => ({ EUR: 6 }) }));
  assert.equal(lista.length, 2, 'o sB (sem marca) e o da outra meta não entram');
  const a = lista.find((x) => x.nome === 'Fundo de teste');
  assert.ok(a.id.endsWith(':sA'));
  assert.equal(a.saldoInformado, 2000);
  assert.equal(a.estimado, true);
  assert.equal(a.valor, estimarSaldoCdi({ saldo: 2000, moeda: 'BRL', atualizadoEm: '2026-09-14', cdiPct: 100 }, serie).valor);
  assert.equal(a.meta, 'Chácara com amigos');
  const eur = lista.find((x) => x.nome === 'Conta em euro');
  assert.equal(eur.valor, 600, 'EUR x 6 (câmbio do dia), sem CDI em outra moeda');
  assert.equal(eur.estimado, false);
  // sem série: vale o último saldo informado
  const semSerie = semRealm(sb.listarOutrosInvestimentosMetas_(ss, agora, { serieCdi: null, buscarCambio: () => ({ EUR: 6 }) }));
  assert.equal(semSerie.find((x) => x.nome === 'Fundo de teste').valor, 2000);
  // arquivada: sai
  sb.arquivarMeta_(ss, id, false, agora);
  assert.deepEqual(semRealm(sb.listarOutrosInvestimentosMetas_(ss, agora, { serieCdi: serie, buscarCambio: () => ({ EUR: 6 }) })), []);
});

test('Patrimonio.gs: montarTelaPatrimonio_ devolve `outrosInvestimentos` (lista de aux_metas, nunca quebra a tela)', (t) => {
  if (!fs.existsSync(FIXTURES)) { t.skip('sem fixtures.json'); return; }
  const raw = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
  const sb = { console: { ...console, log() {} } };
  vm.createContext(sb);
  montarSandboxComFixtures_(raw, sb);
  for (const f of fs.readdirSync(path.join(ROOT, 'apps-script')).filter((x) => x.endsWith('.gs')).sort()) {
    new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), { filename: f }).runInContext(sb);
  }
  const ss = sb.SpreadsheetApp.getActiveSpreadsheet();
  const indices = { fipezap: () => ({ serie: [['2024-01', 100], ['2025-01', 110]], precoM2: 9000, mesPreco: '2025-01' }), ivgr: () => [['2024-01', 500], ['2025-01', 520]] };
  const r = semRealm(sb.montarTelaPatrimonio_(ss, new sb.Date(), { buscarIndices: indices, serieCdi: null }));
  assert.ok(Array.isArray(r.outrosInvestimentos));
});
