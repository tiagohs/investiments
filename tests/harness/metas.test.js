// tests/harness/metas.test.js
//
// 02/10/2026: apps-script/Metas.gs (tela Metas e Objetivos).
//  1) Planilha falsa em memória (dados inventados - o repositório é público):
//     aba aux_metas criada no 1º salvamento, salvar/ler/substituir, arquivar e
//     restaurar (nunca apaga), normalização, câmbio com cache e montarTelaMetas_.
//  2) Planilha REAL (fixtures.json, se existir): GET action=metas pelo Router,
//     POST salvarMeta e o progresso dos vínculos igual ao de metas-calc.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { montarSandboxComFixtures_ } from './gas-vm-harness.mjs';
import { resolverVinculos, calcularMeta } from '../../assets/js/pages/metas-calc.js';

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
  for (const f of ['Metas.gs', 'Proventos.gs']) { // Proventos.gs: mediaRendaPassiva12Meses_ (janela de 12 meses)
    new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), { filename: f }).runInContext(sb);
  }
  // dependências de outros .gs (só o que montarTelaMetas_ chama quando não recebe tudo pronto)
  sb.cotacaoDolarHoje_ = () => 5.5;
  return sb;
}

test('salvarMeta_: cria a aba aux_metas no 1º salvamento, gera id, substitui pelo id e normaliza', () => {
  const sb = sandbox();
  const ss = criarFalsa();
  assert.deepEqual(semRealm(sb.lerMetas_(ss)), [], 'sem aba: lista vazia (não cria só de ler)');
  assert.equal(ss.abas.has('aux_metas'), false);
  const agora = new sb.Date('2026-10-02T12:00:00Z');
  let r = semRealm(sb.salvarMeta_(ss, JSON.stringify({
    tipo: 'viagemInternacional', nome: '=Viagem X', moeda: 'eur', valorAlvo: 5000, dataAlvo: '2027-07-15', lixo: 1,
    itens: [{ nome: 'Comida', valor: 100, moeda: 'EUR' }, { nome: '', valor: 5 }],
    vinculos: [{ tipo: 'ativo', id: 'AAAA11', modo: 'fracao', fracao: 0.5 }, { tipo: 'classe', classe: 'cripto' }],
    contaMensal: { valor: 300, meses: 10, inicio: '2026-08' },
  }), agora));
  assert.equal(r.ok, true);
  assert.ok(ss.abas.has('aux_metas'), 'aba criada sob demanda');
  const aba = ss.abas.get('aux_metas');
  assert.deepEqual(aba.getRange(1, 1, 1, 3).getValues()[0], ['Id', 'Meta (JSON)', 'Atualizado em']);
  const id = r.id;
  assert.ok(id);
  assert.equal(r.meta.nome, 'Viagem X', 'fórmula neutralizada');
  assert.equal(r.meta.moeda, 'EUR');
  assert.equal(r.meta.dataAlvo, '2027-07');
  assert.equal(r.meta.lixo, undefined);
  assert.equal(r.meta.itens.length, 1, 'item sem nome sai');
  assert.equal(r.meta.vinculos.length, 1, 'classe desconhecida sai');
  assert.equal(r.meta.criadaEm, '2026-10-02');
  assert.equal(r.metas.length, 1);
  assert.equal(aba.getRange(2, 1, 1, 1).getValues()[0][0], id);
  assert.equal(JSON.parse(aba.getRange(2, 2, 1, 1).getValues()[0][0]).id, undefined, 'o id fica só na coluna A');

  r = semRealm(sb.salvarMeta_(ss, JSON.stringify({ id, tipo: 'viagemInternacional', nome: 'Viagem Y', valorAlvo: 6000 }), agora));
  assert.equal(r.ok, true);
  assert.equal(aba.getLastRow(), 2, 'substituiu a mesma linha');
  assert.equal(r.meta.criadaEm, '2026-10-02', 'mantém a data de criação');
  sb.salvarMeta_(ss, JSON.stringify({ tipo: 'reservaEmergencia', nome: 'Reserva', especificos: { meses: 6, margem: 0.1 } }), agora);
  assert.deepEqual(semRealm(sb.lerMetas_(ss)).map((m) => m.nome), ['Viagem Y', 'Reserva']);
});

test('salvarMeta_: recusa JSON quebrado, tipo desconhecido, sem nome, número fora do esperado e id que não existe', () => {
  const sb = sandbox();
  const ss = criarFalsa();
  assert.equal(sb.salvarMeta_(ss, '{quebrado').ok, false);
  assert.equal(sb.salvarMeta_(ss, '').ok, false);
  assert.throws(() => sb.salvarMeta_(ss, JSON.stringify({ tipo: 'loteria', nome: 'x' })), /tipo/);
  assert.throws(() => sb.salvarMeta_(ss, JSON.stringify({ tipo: 'acumulo', nome: '  ' })), /nome/);
  assert.throws(() => sb.salvarMeta_(ss, JSON.stringify({ tipo: 'acumulo', nome: 'x', valorAlvo: 'abc' })), /valorAlvo/);
  assert.throws(() => sb.salvarMeta_(ss, JSON.stringify({ tipo: 'acumulo', nome: 'x', rendimentoAnual: 5 })), /rendimentoAnual/);
  assert.equal(sb.salvarMeta_(ss, JSON.stringify({ id: 'naoexiste', tipo: 'acumulo', nome: 'x' })).ok, false);
});

test('arquivarMeta_: "excluir" só marca arquivada (a linha fica); restaurar volta pra lista', () => {
  const sb = sandbox();
  const ss = criarFalsa();
  const agora = new sb.Date('2026-10-02T12:00:00Z');
  const { id } = sb.salvarMeta_(ss, JSON.stringify({ tipo: 'acumulo', categoria: 'pets', nome: 'Pet' }), agora);
  sb.salvarMeta_(ss, JSON.stringify({ tipo: 'carro', nome: 'Carro' }), agora);
  let r = semRealm(sb.arquivarMeta_(ss, id, false, agora));
  assert.equal(r.ok, true);
  assert.equal(r.status, 'arquivada');
  assert.deepEqual(r.metas.map((m) => m.nome), ['Carro']);
  assert.equal(ss.abas.get('aux_metas').getLastRow(), 3, 'nada apagado');
  const arq = semRealm(sb.lerMetas_(ss, { arquivadas: true }));
  assert.deepEqual([arq.length, arq[0].nome, arq[0].arquivadaEm], [1, 'Pet', '2026-10-02']);
  r = semRealm(sb.arquivarMeta_(ss, id, true, agora));
  assert.deepEqual(r.metas.map((m) => m.nome).sort(), ['Carro', 'Pet']);
  assert.equal(sb.arquivarMeta_(ss, 'zzz', false, agora).ok, false);
});

test('câmbio: AwesomeAPI; se falhar, PTAX do BCB; em último caso a planilha - e guarda no cache', () => {
  const urls = [];
  const cache = new Map();
  const fetch = (url) => {
    urls.push(url);
    if (url.includes('awesomeapi')) return { getResponseCode: () => 429, getContentText: () => '{}' };
    if (url.includes("moeda='EUR'")) return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ value: [{ cotacaoVenda: 6.01, dataHoraCotacao: '2026-10-01 13:00' }, { cotacaoVenda: 6.05, dataHoraCotacao: '2026-10-02 13:00' }] }) };
    return { getResponseCode: () => 500, getContentText: () => '' };
  };
  const sb = sandbox({ cache, fetch });
  const ss = criarFalsa();
  ss.insertSheet('Auxiliar_app');
  const agora = new sb.Date('2026-10-02T15:00:00Z');
  const r = semRealm(sb.cambioMetas_(ss, ['EUR', 'USD', 'BRL'], agora));
  assert.deepEqual(r.EUR, { valor: 6.05, fonte: 'PTAX (BCB)', data: '2026-10-02' });
  assert.deepEqual(r.USD, { valor: 5.5, fonte: 'planilha', data: '2026-10-02' }, 'USD sem API: dólar da planilha');
  assert.equal(r.BRL, undefined);
  assert.ok(urls[0].includes('EUR-BRL,USD-BRL'));
  const n = urls.length;
  sb.cambioMetas_(ss, ['EUR', 'USD'], new sb.Date('2026-10-02T15:10:00Z'));
  assert.equal(urls.length, n, 'cache: não buscou de novo (e a planilha segura 30 min antes de tentar a rede)');

  const ok = sandbox({ fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ EURBRL: { bid: '6.2', create_date: '2026-10-02 10:00:00' }, GBPBRL: { bid: '7.1' } }) }) });
  const r2 = semRealm(ok.cambioMetas_(criarFalsa(), ['EUR', 'GBP'], agora));
  assert.deepEqual([r2.EUR.valor, r2.EUR.fonte, r2.GBP.valor], [6.2, 'AwesomeAPI', 7.1]);
});

test('montarTelaMetas_: metas + ativos + câmbio + referências; progresso dos vínculos = metas-calc', () => {
  const sb = sandbox();
  const ss = criarFalsa();
  const agora = new sb.Date('2026-10-02T12:00:00Z');
  const ativos = [
    { id: 'AAAA11', ref: 'AAAA11', nome: 'AAAA11', classe: 'fiis', valorBRL: 1000 },
    { id: 'rf:T|B@emergencial', ref: 'rf:T|B', nome: 'T', classe: 'rf', marca: 'emergencial', valorBRL: 4000 },
  ];
  const vinculos = [{ tipo: 'ativo', id: 'AAAA11', modo: 'valor', valor: 600 }, { tipo: 'marca', marca: 'emergencial', modo: 'fracao', fracao: 0.25 }];
  sb.salvarMeta_(ss, JSON.stringify({ tipo: 'acumulo', nome: 'Meta', moeda: 'USD', valorAlvo: 1000, itens: [{ nome: 'i', valor: 10, moeda: 'GBP' }], vinculos }), agora);
  const pedidas = [];
  const r = semRealm(sb.montarTelaMetas_(ss, agora, {
    ativos, referencias: { reserva: { custoDeVida: 1000 } },
    proventos: { hoje: '2026-10-02', recebidos: [{ ticker: 'aaaa11', data: '2026-05-10', valor: 10 }, { ticker: 'AAAA11', data: '2026-10-01', valor: 99 }, { ticker: 'AAAA11', data: '2025-09-30', valor: 99 }] },
    buscarCambio: (moedas) => { pedidas.push(...moedas); return { USD: 5, EUR: 6, GBP: 7 }; },
  }));
  assert.deepEqual(pedidas.sort(), ['EUR', 'GBP', 'USD'], 'USD, EUR e as moedas usadas nas metas');
  assert.equal(r.cambio.USD.valor, 5);
  assert.equal(r.metas.length, 1);
  assert.deepEqual(r.proventos12m, { inicio: '2025-10', fim: '2026-09', porTicker: { AAAA11: 10 } }, '12 meses fechados (o mês de hoje fica fora)');
  assert.equal(r.metas[0].progresso.valorVinculado, 1600);
  assert.equal(r.metas[0].progresso.valorVinculado, resolverVinculos(vinculos, ativos).total, 'mesma regra do navegador');
  const c = calcularMeta(r.metas[0], { ativos: r.ativos, cambio: r.cambio, hoje: r.hoje });
  assert.equal(c.alvoBRL, 70, 'com sub-itens o alvo é a soma deles (10 GBP x 7)');
  assert.equal(c.atualBRL, 1600);
});

test('Metas (planilha real): GET action=metas pelo Router, POST salvarMeta/excluirMeta, vínculos = metas-calc', (t) => {
  if (!fs.existsSync(FIXTURES)) { t.skip('sem fixtures.json'); return; }
  const raw = JSON.parse(fs.readFileSync(FIXTURES, 'utf8'));
  const sb = { console: { ...console, log() {} } };
  vm.createContext(sb);
  montarSandboxComFixtures_(raw, sb);
  if (!sb.SpreadsheetApp.flush) sb.SpreadsheetApp.flush = () => {};
  for (const f of fs.readdirSync(path.join(ROOT, 'apps-script')).filter((x) => x.endsWith('.gs')).sort()) {
    new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', f), 'utf8'), { filename: f }).runInContext(sb);
  }
  sb.verificarToken = () => ({ ok: true });
  const get = () => JSON.parse(sb.doGet({ parameter: { action: 'metas', token: 'x' } }).getContent());
  let r = get();
  assert.equal(r.ok, true, r.erro);
  assert.ok(r.ativos.length > 0, 'ativos com valor');
  assert.ok(r.ativos.every((a) => a.valorBRL > 0 && a.id), 'todo ativo com id e valor');
  assert.equal(new Set(r.ativos.map((a) => a.id)).size, r.ativos.length, 'ids únicos');
  assert.ok(r.cambio.USD && r.cambio.USD.valor > 0, 'dólar (planilha no sandbox, sem rede)');
  assert.ok(r.referencias.reserva && r.referencias.reserva.custoDeVida > 0, 'custo de vida das Despesas essenciais');
  const emergencial = r.ativos.filter((a) => a.classe === 'rf' && a.marca === 'emergencial').reduce((s, a) => s + a.valorBRL, 0);
  if (typeof r.referencias.reserva.atual === 'number') assert.ok(Math.abs(emergencial - r.referencias.reserva.atual) < 1, 'títulos Renda Emergencial = reserva atual da DM');
  const vinculos = [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }, { tipo: 'classe', classe: 'fiis', modo: 'fracao', fracao: 0.5 }];
  const post = (p) => JSON.parse(sb.doPost({ parameter: { token: 'x', ...p } }).getContent());
  const s = post({ action: 'salvarMeta', meta: JSON.stringify({ tipo: 'reservaEmergencia', nome: 'Teste harness', especificos: { meses: 6 }, vinculos }) });
  assert.equal(s.ok, true, s.erro);
  r = get();
  const meta = r.metas.find((m) => m.id === s.id);
  assert.ok(meta);
  assert.ok(Math.abs(meta.progresso.valorVinculado - resolverVinculos(vinculos, r.ativos).total) < 0.02);
  assert.equal(post({ action: 'excluirMeta', id: s.id }).ok, true);
  r = get();
  assert.ok(!r.metas.some((m) => m.id === s.id));
  assert.ok(r.arquivadas.some((m) => m.id === s.id));
  t.diagnostic(`${r.ativos.length} ativos · avisos: ${JSON.stringify(r.avisos || {})}`);
});
