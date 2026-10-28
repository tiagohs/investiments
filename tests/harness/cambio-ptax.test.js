// tests/harness/cambio-ptax.test.js - 28/10/2026: câmbio do histórico USA (Sync.gs).
// O GOOGLEFINANCE (CURRENCY:USDBRL) marca no dia D o fechamento de D-1: no pregão de 26/10/2026 o dólar subiu ~8% e o
// histórico só mostrava o salto em 27/10. Agora a fonte é a PTAX do BCB (datada pelo próprio dia); sem BCB, o GOOGLEFINANCE
// entra com a data corrigida. Valores sintéticos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { montarSandboxComFixtures_ } from './gas-vm-harness.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GAS_DIR = path.resolve(__dirname, '..', '..', 'apps-script');
const plain = (x) => JSON.parse(JSON.stringify(x));

function sandbox() {
  const sb = { console: { ...console, log() {} } };
  vm.createContext(sb);
  montarSandboxComFixtures_({}, sb);
  for (const f of fs.readdirSync(GAS_DIR).filter((x) => x.endsWith('.gs')).sort()) {
    new vm.Script(fs.readFileSync(path.join(GAS_DIR, f), 'utf8'), { filename: f }).runInContext(sb);
  }
  return sb;
}
const dia = (sb, d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ptaxResposta = (linhas) => ({ getResponseCode: () => 200, getContentText: () => JSON.stringify({ value: linhas }) });

test('PTAX por dia: datada pelo próprio dia, último boletim do dia, e o salto de 26/10 cai em 26/10', () => {
  const sb = sandbox();
  const urls = [];
  sb.UrlFetchApp = { fetch: (u) => { urls.push(u); return ptaxResposta([
    { cotacaoVenda: 4.96, dataHoraCotacao: '2026-10-23 13:05:00.000' },
    { cotacaoVenda: 5.30, dataHoraCotacao: '2026-10-26 10:00:00.000' },
    { cotacaoVenda: 5.36, dataHoraCotacao: '2026-10-26 13:09:00.000' },
    { cotacaoVenda: 5.35, dataHoraCotacao: '2026-10-27 13:02:00.000' },
  ]); } };
  const r = sb.cambioPtaxPorDia_(new sb.Date(2026, 9, 23), new sb.Date(2026, 9, 27));
  assert.deepEqual(plain(r.map((p) => [dia(sb, p.data), p.preco])), [['2026-10-23', 4.96], ['2026-10-26', 5.36], ['2026-10-27', 5.35]]);
  assert.match(urls[0], /CotacaoDolarPeriodo/);
  assert.match(urls[0], /@dataInicial='10-23-2026'&@dataFinalCotacao='10-27-2026'/);
  // o histórico usa o dia exato; feriado no Brasil com pregão nos EUA usa o dia útil anterior
  assert.equal(sb.cambioParaDia_(r, new sb.Date(2026, 9, 26, 16)), 5.36);
  assert.equal(sb.cambioParaDia_(r, new sb.Date(2026, 9, 24, 16)), 4.96);
  const b = plain(sb.buscarCambioUsdBrlPorDia_(new sb.Date(2026, 9, 23), new sb.Date(2026, 9, 27), 1000));
  assert.equal(b.fonte, 'PTAX');
  assert.equal(b.completo, true);
});

test('sem BCB: GOOGLEFINANCE com a data corrigida (D -> D-1; a barra de 2ª-feira é a sexta)', () => {
  const sb = sandbox();
  sb.UrlFetchApp = { fetch: () => ({ getResponseCode: () => 503, getContentText: () => '' }) };
  // como o GOOGLEFINANCE entrega: 26/10 (2ª) = fechamento de sexta; 27/10 = fechamento de 26/10
  sb.buscarPrecoHistorico_ = () => ({ precos: [
    { data: new sb.Date(2026, 9, 23, 23, 58), preco: 4.95 },
    { data: new sb.Date(2026, 9, 26, 23, 58), preco: 4.96 },
    { data: new sb.Date(2026, 9, 27, 23, 58), preco: 5.35 },
  ], completo: true, lacunas: [] });
  const b = sb.buscarCambioUsdBrlPorDia_(new sb.Date(2026, 9, 22), new sb.Date(2026, 9, 27), 1000);
  assert.equal(b.fonte, 'GOOGLEFINANCE');
  assert.deepEqual(plain(b.precos).length, 3);
  assert.deepEqual(plain(b.precos.map((p) => [dia(sb, p.data), p.preco])), [['2026-10-22', 4.95], ['2026-10-23', 4.96], ['2026-10-26', 5.35]]);
  assert.equal(sb.cambioParaDia_(b.precos, new sb.Date(2026, 9, 26, 16)), 5.35, 'o salto de 26/10 fica em 26/10');
});

test('corrigirCambioHistoricoUsaDireto: regrava Câmbio e Valor BRL só das linhas USA (e só desde a data pedida)', () => {
  const sb = sandbox();
  const ss = sb.SpreadsheetApp.getActiveSpreadsheet();
  const aba = ss.getSheetByName('aux_historico-patrimonio') || ss.insertSheet('aux_historico-patrimonio');
  aba.getRange(1, 1, 5, 8).setValues([
    ['Data', 'Ticker', 'Classe', 'Cotas', 'Preço', 'Valor', 'Câmbio', 'Valor BRL'],
    [new sb.Date(2026, 9, 23, 16), 'XXXX', 'USA', 10, 10, 100, 4.90, 490],
    [new sb.Date(2026, 9, 26, 16), 'XXXX', 'USA', 10, 10, 100, 4.96, 496],
    [new sb.Date(2026, 9, 26, 16, 56), 'AAAA3', 'BR', 10, 5, 50, '', 50],
    [new sb.Date(2026, 9, 27, 16), 'XXXX', 'USA', 10, 10, 100, 5.35, 535],
  ]);
  sb.UrlFetchApp = { fetch: () => ptaxResposta([
    { cotacaoVenda: 4.96, dataHoraCotacao: '2026-10-23 13:05:00.000' },
    { cotacaoVenda: 5.36, dataHoraCotacao: '2026-10-26 13:09:00.000' },
    { cotacaoVenda: 5.35, dataHoraCotacao: '2026-10-27 13:02:00.000' },
  ]) };
  const r = plain(sb.corrigirCambioHistoricoUsaDireto('2026-10-24'));
  assert.deepEqual(r, { ok: true, corrigidas: 1 });
  const v = aba.getRange(2, 1, 4, 8).getValues();
  assert.deepEqual(v.map((l) => [l[6], l[7]]), [[4.90, 490], [5.36, 536], ['', 50], [5.35, 535]], 'antes de 24/10 e a linha BR ficam como estavam');
});
