// 05/10/2026 (Tiago: "Carteiras: Renda Fixa demora muito pra carregar, tem algo que dê pra cachear ou
// melhorar nesse tempo?"): leitura única em blocos, nada de rede no caminho da tela e cache do resultado
// montado (CacheService, chave por conteúdo/contagens/dia/versão). Resultado idêntico com e sem cache.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { montarSandboxPrevia } from './previa.mjs';

const temFixtures = fs.existsSync(new URL('./fixtures.json', import.meta.url));
const skip = !temFixtures && 'sem fixtures.json';

/** Propriedades de script de verdade (em memória) - o fake do harness devolve sempre null. */
function comPropriedades(sb) {
  const props = new Map();
  sb.PropertiesService = { getScriptProperties: () => ({ getProperty: (k) => (props.has(k) ? props.get(k) : null), setProperty: (k, v) => props.set(k, String(v)), deleteProperty: (k) => props.delete(k) }) };
  return props;
}

/** Conta quantas vezes o cálculo pesado roda (o wrapper com cache chama calcularCarteirasRendaFixa_ só no miss). */
function contarCalculos(sb) {
  const original = sb.calcularCarteirasRendaFixa_;
  const c = { n: 0 };
  sb.calcularCarteirasRendaFixa_ = (...a) => { c.n++; return original(...a); };
  return c;
}

const json = (x) => JSON.parse(JSON.stringify(x));

test('Renda Fixa: resultado idêntico com cache frio, com cache quente e sem CacheService', { skip }, () => {
  const sbSem = montarSandboxPrevia();
  sbSem.CacheService = { getScriptCache: () => ({ get: () => null, put() {}, getAll: () => ({}), putAll() {}, remove() {}, removeAll() {} }) };
  const semCache = json(sbSem.montarCarteirasRendaFixa_());

  const sb = montarSandboxPrevia();
  comPropriedades(sb);
  const calc = contarCalculos(sb);
  const miss = json(sb.montarCarteirasRendaFixa_());
  const hit = json(sb.montarCarteirasRendaFixa_());
  assert.equal(calc.n, 1, 'a 2a chamada vem do cache');
  assert.deepEqual(miss, semCache);
  assert.deepEqual(hit, semCache);
  assert.ok(semCache.ativos.length > 0);
});

test('Renda Fixa: benchmarks da tela = os mesmos números das funções antigas, sem nenhuma chamada de rede', { skip }, () => {
  const sb = montarSandboxPrevia();
  comPropriedades(sb);
  const esperadoCdiSelic = json(sb.buscarCdiSelicAnualizadosHoje_());
  const esperadoIpca = sb.ipca12MesesDaAba_();
  let fetches = 0;
  sb.UrlFetchApp = { fetch(url) { fetches++; throw new Error('rede no caminho da tela: ' + url); } };
  const r = sb.montarCarteirasRendaFixa_();
  const h = JSON.parse(sb.handleCarteirasRendaFixa({}, { ok: true }).getContent());
  assert.equal(h.ok, true);
  assert.equal(fetches, 0, 'sem UrlFetchApp no caminho da tela');
  assert.equal(r.benchmarks.cdi, esperadoCdiSelic.cdi);
  assert.equal(r.benchmarks.selic, esperadoCdiSelic.selic);
  assert.equal(r.benchmarks.ipca, esperadoIpca);
  assert.ok(esperadoIpca > 0, 'IPCA 12m veio da aba');
});

test('Renda Fixa: IPCA sem dado na aba cai no cache e depois no último valor bom, sem rede', { skip }, () => {
  const sb = montarSandboxPrevia();
  const props = comPropriedades(sb);
  sb.UrlFetchApp = { fetch() { throw new Error('rede'); } };
  const ss = sb.SpreadsheetApp.getActiveSpreadsheet();
  const semIpcaNaAba = { ...ss, getSheetByName: (n) => (n === 'aux_historico-indices' ? null : ss.getSheetByName(n)) };
  props.set('benchmark_ipca12m', '0.0412');
  const b = sb.benchmarksRendaFixaSemRede_(semIpcaNaAba);
  assert.equal(b.ipca, 0.0412);
  assert.equal(b.cdi, null);
  sb.CacheService.getScriptCache().put('benchmark_ipca12m', '0.0399');
  assert.equal(sb.benchmarksRendaFixaSemRede_(semIpcaNaAba).ipca, 0.0399, 'cache (6h) vem antes do guardado');
});

test('Renda Fixa: o cache é invalidado por lançamento de RF, edição na carteira e pela versão (sync/agenda/Limpar cache)', { skip }, () => {
  const sb = montarSandboxPrevia();
  const props = comPropriedades(sb);
  const ss = sb.SpreadsheetApp.getActiveSpreadsheet();
  const calc = contarCalculos(sb);
  sb.montarCarteirasRendaFixa_();
  sb.montarCarteirasRendaFixa_();
  assert.equal(calc.n, 1);

  // 1) lançamento de Renda Fixa: a aba ganha uma linha
  const abaTx = ss.getSheetByName('Transações Renda Fixa');
  const ult = abaTx.getLastRow();
  abaTx.getRange(ult + 1, 1, 1, 8).setValues([['PRODUTO TESTE', new Date(2026, 9, 1), 'Compra', 'Credito', 'INST TESTE', 1, 100, 100]]);
  sb.montarCarteirasRendaFixa_();
  assert.equal(calc.n, 2, 'nova linha em Transações Renda Fixa recalcula');
  sb.montarCarteirasRendaFixa_();
  assert.equal(calc.n, 2);

  // 2) valor da carteira editado no lugar (mesma contagem de linhas)
  const abaCart = ss.getSheetByName('Carteira Renda Fixa');
  const antes = abaCart.getRange(9, 12, 1, 1).getValues()[0][0];
  abaCart.getRange(9, 12, 1, 1).setValues([[Number(antes) + 1]]);
  sb.montarCarteirasRendaFixa_();
  assert.equal(calc.n, 3, 'edição na Carteira Renda Fixa recalcula');

  // 3) versão: sync/agenda de Renda Fixa e "Limpar cache"
  sb.montarCarteirasRendaFixa_();
  assert.equal(calc.n, 3);
  sb.invalidarCacheCarteirasRf_();
  sb.montarCarteirasRendaFixa_();
  assert.equal(calc.n, 4, 'invalidarCacheCarteirasRf_ recalcula');
  assert.ok(props.get('RF_CARTEIRA_CACHE_VERSAO'));
  sb.invalidarCacheAtivos_();
  sb.montarCarteirasRendaFixa_();
  assert.equal(calc.n, 5, 'invalidarCacheAtivos_ (Consolidação/Proventos) também recalcula');
  sb.limparCacheHistoricoInicio_ && (() => { try { sb.limparCacheHistoricoInicio_(); } catch (e) { /* o foco é só a versão */ } })();
  sb.montarCarteirasRendaFixa_();
  assert.equal(calc.n, 6, '"Limpar cache" recalcula');
});

test('Renda Fixa: a sincronização da carteira (gravando) troca a versão do cache; simular não', { skip }, () => {
  const sb = montarSandboxPrevia();
  const props = comPropriedades(sb);
  sb.sincronizarCarteiraRendaFixa_({ simular: true, precos: {} });
  assert.equal(props.get('RF_CARTEIRA_CACHE_VERSAO') || null, null);
  sb.sincronizarCarteiraRendaFixa_({ precos: {} });
  assert.ok(props.get('RF_CARTEIRA_CACHE_VERSAO'), 'depois do sync gravando, a versão mudou');
});

test('Renda Fixa: a ação do Router (carteirasRendaFixa) responde ok mesmo com a rede desligada e usa o cache', { skip }, () => {
  const sb = montarSandboxPrevia();
  comPropriedades(sb);
  sb.UrlFetchApp = { fetch() { throw new Error('Erro de DNS'); } };
  const calc = contarCalculos(sb);
  const r1 = JSON.parse(sb.doGet({ parameter: { action: 'carteirasRendaFixa' } }).getContent());
  const r2 = JSON.parse(sb.doGet({ parameter: { action: 'carteirasRendaFixa' } }).getContent());
  assert.equal(r1.ok, true);
  assert.deepEqual(r2, r1);
  assert.equal(calc.n, 1);
});

test('lerLinhasEmBlocosRf_: 1 leitura quando os dados acabam no 1o bloco, mesmo com getLastRow inflado; vários blocos se preciso', () => {
  const sb = { console };
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(new URL('../../apps-script/CarteirasRendaFixa.gs', import.meta.url), 'utf8')).runInContext(sb);
  function abaFalsa(linhasComDado, ultimaLinha) {
    const chamadas = [];
    return {
      chamadas,
      getLastRow: () => ultimaLinha,
      getRange: (r, c, n, k) => ({ getValues: () => { chamadas.push([r, n]); return Array.from({ length: n }, (_, i) => { const lin = r + i; return Array.from({ length: k }, (_, j) => (linhasComDado.has(lin) && (j === 0 || j === 3) ? `x${lin}` : '')); }); } }),
    };
  }
  const poucas = abaFalsa(new Set([9, 10, 11]), 5000);
  const r1 = sb.lerLinhasEmBlocosRf_(poucas, 9, 12, [0, 3], 60);
  assert.equal(poucas.chamadas.length, 1);
  assert.equal(r1.filter((l) => l[0]).length, 3);

  const muitas = new Set(); for (let i = 9; i < 9 + 130; i++) muitas.add(i);
  const abaGrande = abaFalsa(muitas, 5000);
  const r2 = sb.lerLinhasEmBlocosRf_(abaGrande, 9, 12, [0, 3], 60);
  assert.equal(r2.filter((l) => l[0]).length, 130, 'não perde linha de bloco seguinte');
  assert.equal(abaGrande.chamadas.length, 3);

  const vazia = abaFalsa(new Set(), 5000);
  assert.equal(sb.lerLinhasEmBlocosRf_(vazia, 9, 12, [0, 3], 60).length, 0);
  assert.equal(sb.lerLinhasEmBlocosRf_(abaFalsa(new Set(), 5), 9, 12, [0, 3], 60).length, 0);
});
