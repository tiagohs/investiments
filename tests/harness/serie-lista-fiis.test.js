// tests/harness/serie-lista-fiis.test.js
//
// 07/10/2026 (Tiago: "a tela dos FIIs continua estranha nos gráficos" - na série da Início do servidor `fiis` era 0 nos dias
// passados e os FIIs estavam somados em `acoes`): a lista de FIIs (Auxiliar_ativos, com cache de 10 min) veio vazia numa
// execução e a série montada assim ficou no cache por até 6 h. Agora: lista de FIIs vazia -> relê a Auxiliar_ativos sem
// cache; se continuar vazia, a série NÃO é cacheada. Usa a planilha real (fixtures.json) só por comparação (nenhum número no arquivo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { montarSandboxComFixtures_ } from './gas-vm-harness.mjs';
import { FIXTURES_PATH } from './relatorio-telas.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAS_DIR = path.resolve(__dirname, '..', '..', 'apps-script');
const TEM = fs.existsSync(FIXTURES_PATH);
const pular = (t) => t.skip('tests/harness/fixtures.json ausente - ver tests/harness/README.md');

function sandbox(mexer = () => {}) {
  const raw = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
  mexer(raw);
  const sb = { console: { ...console, log() {} } };
  vm.createContext(sb);
  montarSandboxComFixtures_(raw, sb);
  for (const f of fs.readdirSync(GAS_DIR).filter((x) => x.endsWith('.gs')).sort()) {
    new vm.Script(fs.readFileSync(path.join(GAS_DIR, f), 'utf8'), { filename: f }).runInContext(sb);
  }
  return sb;
}
const ultimoComFiis = (serie) => [...serie].reverse().find((d) => d.fiis > 0 && d.data < serie[serie.length - 1].data);

test('série da Início: lista de FIIs ruim no cache (só ações) é relida da Auxiliar_ativos - FIIs não vão pra Ações', (t) => {
  if (!TEM) return pular(t);
  const limpo = sandbox();
  const serieLimpa = JSON.parse(JSON.stringify(limpo.montarSerieHistoricoInicio_()));
  const ref = ultimoComFiis(serieLimpa);
  assert.ok(ref, 'a planilha real tem FIIs na série');

  const sb = sandbox();
  const lista = JSON.parse(JSON.stringify(vm.runInContext('lerTickersAuxiliarAtivos_(SpreadsheetApp.getActiveSpreadsheet())', sb)));
  assert.ok(lista.fiis.length > 0);
  sb.CacheService.getScriptCache().put(vm.runInContext('CACHE_TICKERS_PLANILHA_', sb), JSON.stringify({ acoes: lista.acoes, fiis: [], usa: lista.usa }));
  const serie = JSON.parse(JSON.stringify(sb.montarSerieHistoricoInicio_()));
  const dia = serie.find((d) => d.data === ref.data);
  assert.equal(dia.fiis, ref.fiis, 'FIIs do dia iguais aos da série com a lista certa');
  assert.equal(dia.acoes, serieLimpa.find((d) => d.data === ref.data).acoes, 'Ações sem os FIIs somados');
});

test('série da Início: sem nenhum FII na Auxiliar_ativos a série é devolvida mas NÃO fica no cache', (t) => {
  if (!TEM) return pular(t);
  const sb = sandbox((raw) => {
    raw.Auxiliar_ativos.linhas = raw.Auxiliar_ativos.linhas.map((l, i) => (i > 0 && l && l[0] === 'FIIs' ? ['Outro', ...l.slice(1)] : l));
  });
  const cache = sb.CacheService.getScriptCache();
  let gravou = false;
  const putAllOrig = cache.putAll;
  cache.putAll = (obj) => { if (Object.keys(obj).some((k) => k.startsWith('historico_serie_v14_'))) gravou = true; return putAllOrig(obj); };
  assert.ok(sb.montarSerieHistoricoInicio_().length > 100);
  assert.equal(gravou, false, 'série com FIIs fora da lista não é cacheada');
});

test('Limpar cache também tira a lista de tickers do cache; lista em cache sem nenhum ativo é ignorada', (t) => {
  if (!TEM) return pular(t);
  const sb = sandbox();
  const cache = sb.CacheService.getScriptCache();
  const chave = vm.runInContext('CACHE_TICKERS_PLANILHA_', sb);
  cache.put(chave, JSON.stringify({ acoes: [], fiis: [], usa: [] }));
  const lida = JSON.parse(JSON.stringify(sb.carregarTickersDaPlanilha_(sb.SpreadsheetApp.getActiveSpreadsheet())));
  assert.ok(lida.fiis.length > 0, 'lista vazia do cache não vale');
  cache.put(chave, 'qualquer');
  sb.limparCacheHistoricoInicio_();
  assert.equal(cache.get(chave), null);
});
