// tests/harness/ivvb11-historico.test.js
//
// 03/10/2026 (Tiago: "Nas análises dos gráficos e métricas dos ativos,
// considere essas fontes [vídeos de rentabilidade]..."): o S&P 500 do site
// (INDEXSP:.INX) é só PREÇO e em dólar - contra a carteira de Ações EUA
// (que recebe dividendos) a comparação favorece a carteira em ~1,2-1,5 p.p.
// ao ano. O IVVB11 (ETF que reinveste os dividendos, já em reais) entra em
// aux_historico-indices como mais um índice do GOOGLEFINANCE
// (BackfillIndices.gs, rodarBackfillIvvb11Direto 1x) e vira o campo
// `ivvb11` da série da Início (HistoricoInicio.gs) - o card de Análise
// (analise-grafico.js) passa a usá-lo como benchmark das Ações EUA.
//
// Prova, com a planilha real + linhas de IVVB11 INVENTADAS (nenhum número
// real), que: sem IVVB11 na aba o campo não aparece (série igual à de
// antes); com IVVB11, cada dia tem o último valor gravado até ele.
// Sem fixtures.json, tudo aqui é pulado - ver README.md.
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

function serieCom(linhasExtras) {
  const raw = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf8'));
  const aba = raw['aux_historico-indices'];
  // A aba real já pode ter linhas de IVVB11 (backfill rodado): os testes partem de uma aba SEM elas
  // pra controlar a série (A-73).
  aba.linhas = aba.linhas.filter((l, i) => i === 0 || String(l[1] || '').trim().toUpperCase() !== 'IVVB11');
  aba.linhas.push(...linhasExtras);
  aba.lastRow = aba.linhas.length;
  const sb = { console: { ...console, log() {} } };
  vm.createContext(sb);
  montarSandboxComFixtures_(raw, sb);
  for (const f of fs.readdirSync(GAS_DIR).filter((x) => x.endsWith('.gs')).sort()) {
    new vm.Script(fs.readFileSync(path.join(GAS_DIR, f), 'utf8'), { filename: f }).runInContext(sb);
  }
  return { serie: sb.montarSerieHistoricoInicio_(), sb };
}

test('IVVB11: GOOGLEFINANCE BVMF:IVVB11 no gatilho diário + função de backfill pra rodar 1x', (t) => {
  if (!TEM) return pular(t);
  const { sb } = serieCom([]);
  const tickers = vm.runInContext('TICKERS_INDICES_GOOGLEFINANCE', sb);
  assert.equal(tickers.IVVB11, 'BVMF:IVVB11');
  assert.equal(tickers['S&P 500'], 'INDEXSP:.INX', 'o S&P 500 de preço continua (é o que o gráfico desenha)');
  assert.equal(typeof sb.rodarBackfillIvvb11Direto, 'function');
});

test('IVVB11: sem linhas na aba, a série não ganha o campo (nada muda até o backfill)', (t) => {
  if (!TEM) return pular(t);
  const { serie } = serieCom([]);
  assert.ok(serie.length > 100);
  assert.equal(serie.filter((p) => 'ivvb11' in p).length, 0);
});

test('IVVB11: com linhas na aba, cada dia leva o último valor gravado até ele (forward-fill, igual IFIX/S&P 500)', (t) => {
  if (!TEM) return pular(t);
  const base = serieCom([]).serie;
  // 3 pregões inventados no meio da série, com um fim de semana entre eles
  const meio = base[Math.floor(base.length / 2)].data;
  const d = (iso, n) => { const x = new Date(`${iso}T12:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
  const dias = [meio, d(meio, 1), d(meio, 4)];
  const valores = [100, 101.5, 99.25];
  const linhas = dias.map((dia, i) => [{ __date__: `${dia}T16:00:00` }, 'IVVB11', valores[i]]);
  const { serie } = serieCom(linhas);
  const por = Object.fromEntries(serie.map((p) => [p.data, p]));
  assert.equal(por[dias[0]].ivvb11, 100);
  assert.equal(por[dias[1]].ivvb11, 101.5);
  assert.equal(por[d(meio, 2)].ivvb11, 101.5, 'dia sem pregão carrega o último');
  assert.equal(por[d(meio, 3)].ivvb11, 101.5);
  assert.equal(por[dias[2]].ivvb11, 99.25);
  assert.equal(serie[serie.length - 1].ivvb11, 99.25, 'até o fim da série');
  assert.ok(!('ivvb11' in por[d(meio, -1)]), 'antes do 1º valor, sem o campo');
  // nada mais na série muda por causa do IVVB11
  const semCampo = (p) => { const { ivvb11, ...resto } = p; return resto; };
  assert.deepEqual(JSON.parse(JSON.stringify(serie.map(semCampo))), JSON.parse(JSON.stringify(base))); // objetos de outro realm (vm): compara o conteúdo
});
