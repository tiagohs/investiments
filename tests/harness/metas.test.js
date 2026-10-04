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

// ---------------------------------------------------------------------------
// 03/10/2026: Metas v2 - exclusão definitiva, saldo em conta, IR/IOF, histórico
// ---------------------------------------------------------------------------

test('excluirMetaDefinitivo_: só meta arquivada; apaga a linha e as de baixo sobem', () => {
  const sb = sandbox();
  const ss = criarFalsa();
  const agora = new sb.Date('2026-10-03T12:00:00Z');
  const a = sb.salvarMeta_(ss, JSON.stringify({ tipo: 'aposentadoria', nome: 'Teste 1' }), agora).id;
  const b = sb.salvarMeta_(ss, JSON.stringify({ tipo: 'aposentadoria', nome: 'Teste 2' }), agora).id;
  sb.salvarMeta_(ss, JSON.stringify({ tipo: 'carro', nome: 'Carro' }), agora);
  assert.match(sb.excluirMetaDefinitivo_(ss, a).erro, /arquive/, 'ativa não apaga');
  sb.arquivarMeta_(ss, a, false, agora);
  const r = semRealm(sb.excluirMetaDefinitivo_(ss, a));
  assert.equal(r.ok, true);
  assert.deepEqual(semRealm(sb.lerMetas_(ss)).map((m) => m.nome), ['Teste 2', 'Carro']);
  assert.deepEqual(r.arquivadas, []);
  assert.equal(ss.abas.get('aux_metas').getLastRow(), 3, 'a linha saiu (cabeçalho + 2)');
  assert.equal(sb.excluirMetaDefinitivo_(ss, a).ok, false, 'não existe mais');
  // a função de 1x do editor: apaga todas as arquivadas
  sb.arquivarMeta_(ss, b, false, agora);
  sb.SpreadsheetApp.getActiveSpreadsheet = () => ss;
  sb.excluirMetasArquivadasDefinitivamente();
  assert.deepEqual(semRealm(sb.lerMetas_(ss)).map((m) => m.nome), ['Carro']);
});

test('saldo em conta: normaliza, guarda o histórico de cada atualização e entra no progresso pelo câmbio', () => {
  const sb = sandbox();
  const ss = criarFalsa();
  const meta = { tipo: 'viagemInternacional', nome: 'Viagem', moeda: 'EUR', vinculos: [{ tipo: 'saldo', id: 's1', instituicao: 'Conta X', moeda: 'eur', saldo: 100, atualizadoEm: '2026-08-01' }, { tipo: 'saldo', instituicao: '' }] };
  let r = semRealm(sb.salvarMeta_(ss, JSON.stringify(meta), new sb.Date('2026-08-01T12:00:00Z')));
  assert.equal(r.meta.vinculos.length, 1, 'saldo sem instituição sai');
  assert.deepEqual(r.meta.vinculos[0].historico, [{ data: '2026-08-01', saldo: 100 }]);
  const id = r.id;
  // nova atualização: o histórico gravado manda (o navegador não reescreve o passado)
  r = semRealm(sb.salvarMeta_(ss, JSON.stringify({ ...meta, id, vinculos: [{ ...meta.vinculos[0], saldo: 250, atualizadoEm: '2026-09-15', historico: [] }] }), new sb.Date('2026-09-15T12:00:00Z')));
  assert.deepEqual(r.meta.vinculos[0].historico, [{ data: '2026-08-01', saldo: 100 }, { data: '2026-09-15', saldo: 250 }]);
  // mesmo saldo: não duplica
  r = semRealm(sb.salvarMeta_(ss, JSON.stringify({ ...meta, id, vinculos: [{ ...meta.vinculos[0], saldo: 250 }] }), new sb.Date('2026-09-20T12:00:00Z')));
  assert.equal(r.meta.vinculos[0].historico.length, 2);
  const tela = semRealm(sb.montarTelaMetas_(ss, new sb.Date('2026-10-03T12:00:00Z'), { ativos: [], referencias: {}, proventos: { recebidos: [], hoje: '2026-10-03' }, buscarCambio: () => ({ EUR: 6, USD: 5 }), historicoResumo: null }));
  assert.equal(tela.metas[0].progresso.valorVinculado, 1500, '€ 250 x 6');
  assert.equal(tela.metas[0].progresso.valorVinculado, resolverVinculos(tela.metas[0].vinculos, [], tela.cambio).total, 'mesma regra do navegador');
});

test('normalização v2: viagem por destinos e itens fixos; aposentadoria com a conta editável', () => {
  const sb = sandbox();
  const ss = criarFalsa();
  const agora = new sb.Date('2026-10-03T12:00:00Z');
  let r = semRealm(sb.salvarMeta_(ss, JSON.stringify({
    tipo: 'viagemInternacional', nome: 'V', especificos: {
      margem: 0.1, destinos: [{ cidade: 'Cidade A', pais: 'País A', moeda: 'gbp', dias: 3, gastos: { alimentacao: 50, lixo: 9 }, extras: 20 }, { cidade: '', pais: '' }],
      fixos: [{ nome: 'Passagem', valor: 3000, parcelas: 10, inicio: '2026-08-15', parte: 0.5 }, { nome: '' }],
    },
  }), agora));
  const e = r.meta.especificos;
  assert.equal(e.destinos.length, 1);
  assert.deepEqual([e.destinos[0].moeda, e.destinos[0].dias, e.destinos[0].gastos.alimentacao, e.destinos[0].gastos.lixo, e.destinos[0].extras], ['GBP', 3, 50, undefined, 20]);
  assert.deepEqual([e.fixos.length, e.fixos[0].inicio, e.fixos[0].parte, e.fixos[0].moeda], [1, '2026-08', 0.5, 'BRL']);
  assert.throws(() => sb.salvarMeta_(ss, JSON.stringify({ tipo: 'viagemInternacional', nome: 'V', especificos: { fixos: [{ nome: 'x', parte: 2 }] } }), agora), /sua parte/);
  r = semRealm(sb.salvarMeta_(ss, JSON.stringify({ tipo: 'aposentadoria', nome: 'A', dataAlvo: '2050-12', especificos: { modoAlvo: 'calculado', extra: 1000, reinvestimento: 0.2, taxaRetirada: 0.06, anoNascimento: 1990, usarDespesasPlanilha: false, despesaMensal: 5000 } }), agora));
  assert.deepEqual(r.meta.especificos, { rendaDesejada: null, taxaRetirada: 0.06, modoAlvo: 'calculado', usarDespesasPlanilha: false, despesaMensal: 5000, extra: 1000, reinvestimento: 0.2, anoNascimento: 1990 });
  assert.equal(r.meta.dataAlvo, '2050-12', 'o prazo da aposentadoria é gravado');
});

test('IR + IOF se resgatasse hoje: IOF nos primeiros 30 dias, IR sobre o rendimento menos o IOF, na proporção do ativo', () => {
  const sb = sandbox();
  assert.equal(sb.aliquotaIofMetas_(1), 0.96);
  assert.equal(sb.aliquotaIofMetas_(10), 0.66);
  assert.equal(sb.aliquotaIofMetas_(30), 0);
  const pos = { isento: false, precisao: 'por-lote', impostoSeResgatasseHoje: 0, valorLiquidoSeResgatasseHoje: 2000,
    detalhes: [{ diasCorridos: 400, rendimento: 100, aliquota: 0.175 }, { diasCorridos: 10, rendimento: 10, aliquota: 0.225 }] };
  const r = semRealm(sb.irResgateDoAtivo_(pos, 1000));
  // lote 1: IR 17,50; lote 2: IOF 6,60 e IR (10 - 6,60) x 22,5% = 0,765 -> metade (o ativo é metade da posição)
  assert.deepEqual(r, { ir: 9.13, iof: 3.3, liquido: 987.57, isento: false, precisao: 'por-lote' });
  assert.deepEqual(semRealm(sb.irResgateDoAtivo_({ isento: true, detalhes: [], valorLiquidoSeResgatasseHoje: 500, impostoSeResgatasseHoje: 0 }, 500)), { ir: 0, iof: 0, liquido: 500, isento: true, precisao: null });
});

test('montarHistoricoMetas_: valor e aporte mês a mês por classe, ativo (RV/RF) e saldo; aporte médio de 12 meses; renda mensal', () => {
  const sb = sandbox();
  sb.normalizarInstituicaoRF_ = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  const ss = criarFalsa();
  const agora = new sb.Date('2026-10-03T12:00:00Z');
  const D = (iso) => new sb.Date(`${iso}T15:00:00Z`);
  const id = sb.salvarMeta_(ss, JSON.stringify({
    tipo: 'rendaPassiva', nome: 'RP', vinculos: [
      { tipo: 'classe', classe: 'fiis', modo: 'fracao', fracao: 0.5 },
      { tipo: 'ativo', id: 'AAAA3' },
      { tipo: 'ativo', id: 'rf:Tesouro Z 2030|Banco Q@longo-prazo', modo: 'valor', valor: 150 },
      { tipo: 'saldo', id: 's', instituicao: 'Conta X', moeda: 'EUR', saldo: 20, atualizadoEm: '2026-09-10', historico: [{ data: '2026-08-05', saldo: 10 }, { data: '2026-09-10', saldo: 20 }] },
    ],
  }), agora).id;
  const serieInicio = [
    { data: '2026-07-31', fiis: 1000, fluxoAplicadoFiis: 0, indiceCdi: 100 },
    { data: '2026-08-10', fiis: 1300, fluxoAplicadoFiis: 300, indiceCdi: 100.5 },
    { data: '2026-08-31', fiis: 1320, fluxoAplicadoFiis: 0, indiceCdi: 101 },
    { data: '2026-09-30', fiis: 1500, fluxoAplicadoFiis: 200, indiceCdi: 102 },
    { data: '2026-10-02', fiis: 1510, fluxoAplicadoFiis: 0, indiceCdi: 102.1 },
  ];
  const linhasPatrimonio = [[D('2026-08-28'), 'AAAA3', 'BR', 10, 10, 100, '', 100], [D('2026-09-29'), 'AAAA3', 'BR', 20, 10, 200, '', 200], [D('2026-10-02'), 'AAAA3', 'BR', 20, 11, 220, '', 220], [D('2026-09-29'), 'ZZZZ3', 'BR', 1, 1, 1, '', 1]];
  const linhasRf = [[D('2026-08-31'), 'Tesouro Z 2030', 'Banco Q', 'IPCA', 'Renda Fixa', 100], [D('2026-09-30'), 'Tesouro Z 2030', 'Banco Q', 'IPCA', 'Renda Fixa', 300], [D('2026-09-30'), 'Tesouro Z 2030', 'Banco Q', 'IPCA', 'Renda Emergencial', 999], [D('2026-10-02'), 'Tesouro Z 2030', 'Banco Q', 'IPCA', 'Renda Fixa', 310]];
  const transacoes = { br: [['AAAA3', D('2026-08-20'), 'Compra', 10, 10, 0, '', 100], ['AAAA3', D('2026-09-20'), 'Compra', 10, 10, 0, '', 100]], usa: [], rf: [['Tesouro Z 2030', D('2026-09-02'), 'Compra', 'Debit', 'Banco Q', 1, 200, 200]] };
  const proventos = { recebidos: [{ ticker: 'FFFF11', classe: 'fiis', data: '2026-08-15', valor: 10 }, { ticker: 'AAAA3', classe: 'acoes', data: '2026-09-15', valor: 4 }, { ticker: 'BBBB3', classe: 'acoes', data: '2026-09-15', valor: 99 }, { ticker: 'FFFF11', classe: 'fiis', data: '2026-09-15', valor: 12 }] };
  const r = semRealm(sb.montarHistoricoMetas_(ss, agora, { serieInicio, linhasPatrimonio, linhasRf, transacoes, proventos, cambio: { EUR: 6 }, semCache: true }));
  const h = r.metas[id];
  assert.deepEqual(h.meses.map((x) => x.mes), ['2026-07', '2026-08', '2026-09', '2026-10']);
  // ago: FIIs 1320/2 + AAAA3 100 + RF min(100,150) + € 10 x 6
  assert.deepEqual(h.meses.map((x) => x.valor), [500, 660 + 100 + 100 + 60, 750 + 200 + 150 + 120, 755 + 220 + 150 + 120]);
  // fluxo de set: FIIs 200/2 + compra AAAA3 100 + RF 200 x (150/300) + saldo +60
  assert.deepEqual(h.meses.map((x) => x.fluxo), [0, 150 + 100 + 0 + 60, 100 + 100 + 100 + 60, 0]);
  assert.equal(h.aporteMedio, Math.round(((310 + 360) / 3) * 100) / 100, 'média dos meses fechados (jul, ago, set)');
  assert.equal(h.aporte3m, h.aporteMedio);
  assert.deepEqual(h.renda, [{ mes: '2026-08', valor: 5 }, { mes: '2026-09', valor: 10 }, { mes: '2026-10', valor: 0 }], 'metade dos FIIs + AAAA3 (BBBB3 não é vinculado)');
  assert.deepEqual(r.indices.map((x) => x.mes), ['2026-07', '2026-08', '2026-09', '2026-10']);
});

test('Metas v2 (planilha real): GET metasHistorico pelo Router, resumo vai junto no GET metas, exclusão definitiva', (t) => {
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
  const get = (p) => JSON.parse(sb.doGet({ parameter: { token: 'x', ...p } }).getContent());
  const post = (p) => JSON.parse(sb.doPost({ parameter: { token: 'x', ...p } }).getContent());
  const s = post({ action: 'salvarMeta', meta: JSON.stringify({ tipo: 'reservaEmergencia', nome: 'Teste v2', vinculos: [{ tipo: 'marca', marca: 'emergencial', modo: 'total' }] }) });
  assert.equal(s.ok, true, s.erro);
  const h = get({ action: 'metasHistorico' });
  assert.equal(h.ok, true, h.erro);
  const hm = h.metas[s.id];
  assert.ok(hm.meses.length >= 6, 'meses de histórico');
  assert.ok(hm.meses.every((x) => typeof x.valor === 'number' && typeof x.fluxo === 'number'));
  const m = get({ action: 'metas' });
  assert.equal(m.historicoResumo[s.id].aporteMedio, hm.aporteMedio, 'resumo em cache no GET metas');
  const ultimo = hm.meses[hm.meses.length - 1].valor;
  const hoje = m.ativos.filter((a) => a.classe === 'rf' && a.marca === 'emergencial').reduce((x, a) => x + a.valorBRL, 0);
  assert.ok(Math.abs(ultimo - hoje) / hoje < 0.03, `histórico termina perto do valor de hoje (${ultimo} x ${hoje})`);
  assert.ok(m.ativos.filter((a) => a.classe === 'rf').every((a) => a.irResgate && a.irResgate.liquido <= a.valorBRL + 0.01), 'todo título com IR se resgatasse hoje');
  assert.equal(post({ action: 'excluirMetaDefinitivo', id: s.id }).ok, false, 'ativa não apaga');
  assert.equal(post({ action: 'excluirMeta', id: s.id }).ok, true);
  assert.equal(post({ action: 'excluirMetaDefinitivo', id: s.id }).ok, true);
  const depois = get({ action: 'metas' });
  assert.ok(!depois.metas.concat(depois.arquivadas).some((x) => x.id === s.id), 'sumiu de vez');
});

// ---------------------------------------------------------------------------
// 04/10/2026 (Tiago: "incluí [a cotação] na aba 'Bolsa USA >>>': D8 é a cotação
// do Dólar, D9 Libra, D10 Franco Suíço e D11 Euro; uso =GOOGLEFINANCE("EURBRL");
// se puder variar para todas as moedas, ótimo") - dados inventados.
// ---------------------------------------------------------------------------

function abaBolsaUsa(ss, { d8 = 5.21, d9 = 7.4, d10 = 6.6, d11 = 6.2, rotulos = true } = {}) {
  const aba = ss.insertSheet('Bolsa USA >>>');
  aba.cel.set('6,1', 'Os resultados estimados em R$ se baseiam na cotação do dólar no dia.'); // A6 (nota, não é cotação)
  if (rotulos) aba.cel.set('8,1', 'Cotação do dólar hoje:');
  aba.cel.set('8,4', d8); aba.cel.set('9,4', d9); aba.cel.set('10,4', d10); aba.cel.set('11,4', d11);
  return aba;
}

test('câmbio: a aba "Bolsa USA >>>" (D8 USD, D9 GBP, D10 CHF, D11 EUR) é a 1ª fonte - sem rede', () => {
  const sb = sandbox(); // sem rede: se tentasse a API, estouraria
  const ss = criarFalsa();
  abaBolsaUsa(ss);
  const r = semRealm(sb.cambioMetas_(ss, ['USD', 'GBP', 'CHF', 'EUR', 'BRL'], new sb.Date('2026-10-04T12:00:00Z')));
  assert.deepEqual(['USD', 'GBP', 'CHF', 'EUR'].map((m) => r[m].valor), [5.21, 7.4, 6.6, 6.2]);
  assert.equal(r.CHF.origem, 'planilha');
  assert.match(r.CHF.fonte, /Bolsa USA >>> D10/);
  assert.equal(r.CHF.data, '2026-10-04');
  assert.equal(r.BRL, undefined);
});

test('câmbio: valor fora da faixa plausível é ignorado (cai pra API); a fórmula GOOGLEFINANCE manda mais que a posição', () => {
  const urls = [];
  const sb = sandbox({ fetch: (u) => { urls.push(u); return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ CHFBRL: { bid: '6.55', create_date: '2026-10-04 10:00:00' } }) }; } });
  const ss = criarFalsa();
  const aba = abaBolsaUsa(ss, { d10: 66 }); // CHF a R$ 66: estranho (célula errada?)
  // a célula D9 traz uma fórmula de EURBRL: vale a moeda da fórmula, não a posição combinada (GBP)
  const orig = aba.getRange.bind(aba);
  aba.getRange = (...a) => {
    const rg = orig(...a);
    rg.getFormulas = () => { const f = []; for (let i = 0; i < a[2]; i++) f.push(['', '', '', a[0] + i === 9 ? '=GOOGLEFINANCE("EURBRL")' : '']); return f; };
    return rg;
  };
  const r = semRealm(sb.cambioMetas_(ss, ['EUR', 'GBP', 'CHF'], new sb.Date('2026-10-04T12:00:00Z')));
  assert.equal(r.EUR.valor, 7.4, 'D9 tem =GOOGLEFINANCE("EURBRL"): é o euro');
  assert.equal(r.EUR.origem, 'planilha');
  assert.equal(r.CHF.valor, 6.55, 'D10 = 66 não é plausível: usa a API');
  assert.equal(r.CHF.fonte, 'AwesomeAPI');
  assert.ok(urls.length >= 1);
});

test('câmbio: outras moedas pela aba aux_cambio (=GOOGLEFINANCE("CURRENCY:XXXBRL"), criada sob demanda) com fallback na API', () => {
  const formulas = [];
  const sb = sandbox({ fetch: () => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ CZKBRL: { bid: '0.25', create_date: '2026-10-04 10:00:00' } }) }) });
  const ss = criarFalsa();
  abaBolsaUsa(ss);
  const antes = ss.insertSheet; // a aba criada ganha setFormula (a planilha de verdade guarda a fórmula e calcula depois)
  ss.insertSheet = (nome) => {
    const aba = antes(nome);
    const orig = aba.getRange.bind(aba);
    aba.getRange = (...a) => { const rg = orig(...a); rg.setFormula = (f) => formulas.push([nome, a[0], f]); return rg; };
    return aba;
  };
  const agora = new sb.Date('2026-10-04T12:00:00Z');
  // 1ª vez: o Google ainda está calculando (célula vazia) -> a API cobre, e a linha com a fórmula fica criada
  let r = semRealm(sb.cambioMetas_(ss, ['EUR', 'CZK'], agora));
  assert.equal(r.EUR.valor, 6.2, 'EUR continua pela Bolsa USA');
  assert.equal(r.CZK.valor, 0.25);
  assert.equal(r.CZK.fonte, 'AwesomeAPI');
  assert.deepEqual(formulas, [['aux_cambio', 2, '=IFERROR(GOOGLEFINANCE("CURRENCY:CZKBRL");"")']]);
  const aux = ss.getSheetByName('aux_cambio');
  assert.equal(aux.cel.get('1,1'), 'Moeda');
  assert.equal(aux.cel.get('2,1'), 'CZK');
  // 2ª vez: o Google calculou -> vale o número da aba (sem nova linha, sem rede)
  aux.cel.set('2,2', 0.2431);
  const sb2 = sandbox();
  r = semRealm(sb2.cambioMetas_(ss, ['CZK'], agora));
  assert.equal(r.CZK.valor, 0.2431);
  assert.equal(r.CZK.origem, 'planilha');
  assert.match(r.CZK.fonte, /aux_cambio/);
  assert.equal(aux.getLastRow(), 2, 'não duplica a linha');
});

test('salvar: viagem com país/cidade, roteiro (Wanderlog), taxa turística, forma dos itens e entradas programadas', () => {
  const sb = sandbox();
  const ss = criarFalsa();
  const agora = new sb.Date('2026-10-04T12:00:00Z');
  const r = semRealm(sb.salvarMeta_(ss, JSON.stringify({
    tipo: 'viagemInternacional', nome: 'Viagem Teste', moeda: 'EUR', dataAlvo: '2027-06',
    especificos: {
      roteiroUrl: 'https://wanderlog.com/plan/abc', pessoas: 2,
      destinos: [{ pais: 'Suíça', paisCodigo: 'ch', cidade: 'Zurique', moeda: 'CHF', dias: 3, gastos: { alimentacao: 100 }, taxaTuristica: 2.5, taxaNoites: 3, taxaPessoas: 2 }],
      fixos: [
        { nome: 'Passagem', valor: 1000, parcelas: 5, inicio: '2026-08', forma: 'cartao', cartao: 'Cartão X', confirmado: true },
        { nome: 'Antigo pago', valor: 10, pago: true },
        { nome: 'Ingresso', valor: 50, forma: 'juntar' },
      ],
    },
    entradas: [
      { tipo: 'decimo13', pct: 0.9 }, { tipo: 'fgts', pct: 0.9, mes: '2027-03' }, { tipo: 'invalido', pct: 1 },
    ],
    links: [{ rotulo: 'Roteiro', url: 'https://wanderlog.com/plan/abc' }, { rotulo: 'ruim', url: 'javascript:alert(1)' }],
  }), agora));
  assert.equal(r.ok, true, r.erro);
  const m = r.meta;
  assert.equal(m.especificos.roteiroUrl, 'https://wanderlog.com/plan/abc');
  assert.equal(m.especificos.destinos[0].paisCodigo, 'CH');
  assert.deepEqual([m.especificos.destinos[0].taxaTuristica, m.especificos.destinos[0].taxaNoites, m.especificos.destinos[0].taxaPessoas], [2.5, 3, 2]);
  assert.deepEqual(m.especificos.fixos.map((f) => [f.forma, f.pago, f.cartao, f.confirmado]), [['cartao', false, 'Cartão X', true], ['pago', true, '', false], ['juntar', false, '', false]]);
  assert.deepEqual(m.entradas.map((e) => [e.tipo, e.pct, e.mes, e.recorrencia]), [['decimo13', 0.9, null, 'anual'], ['fgts', 0.9, '2027-03', 'anual']]);
  assert.deepEqual(m.links.map((l) => l.url), ['https://wanderlog.com/plan/abc'], 'javascript: é descartado');
});

test('salvar: link de roteiro que não é http(s) é recusado ou descartado (não vira link clicável)', () => {
  const sb = sandbox();
  const ss = criarFalsa();
  const r = semRealm(sb.salvarMeta_(ss, JSON.stringify({ tipo: 'viagemInternacional', nome: 'V', moeda: 'EUR', especificos: { roteiroUrl: 'javascript:alert(1)' } }), new sb.Date('2026-10-04T12:00:00Z')));
  if (r.ok) assert.ok(!r.meta.especificos.roteiroUrl || /^https?:/.test(r.meta.especificos.roteiroUrl));
  else assert.match(r.erro, /link|url/i);
});
