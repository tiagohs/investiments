// tests/harness/cambio-ao-vivo.test.js
//
// 05/10/2026 (A-21 e A-22, auditoria): Home.gs
//  - o dólar de montarHome_ só entra como número > 0 (antes: getValue() cru - texto/vazio virava NaN/0 nas
//    contas de câmbio); célula ruim cai no último dólar de aux_historico-patrimonio e marca `usdDefasado`;
//  - montarSerieHistoricoInicioAoVivo_: o último ponto da série (hoje) recebe os valores ao vivo dos cards
//    (antes só handleHome fazia isso; a ação historicoInicio devolvia o fechamento do último sync).
// Planilha falsa, valores inventados.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const plain = (x) => JSON.parse(JSON.stringify(x));

function blocos({ dolar }) {
  const dash = Array.from({ length: 16 }, () => [0, 0, 0, 0, 0]);
  dash[0][0] = 1000; dash[12][4] = 300; dash[13][4] = 200; dash[14][4] = 300; dash[15][4] = 200; // total, ações, FIIs, RF, EUA
  const aux = Array.from({ length: 10 }, () => [0]);
  aux[0][0] = 130000; aux[1][0] = 0.5; aux[4][0] = 6; aux[8][0] = 5000; aux[9][0] = 0.1;
  const aba = (valores, un) => ({ getRange: (a1) => ({ getValues: () => valores, getValue: () => un }) });
  return {
    '📊Dash Geral': aba(dash), 'Carteira Renda Fixa': aba(null, 100), 'Auxiliar_app': aba(aux), 'Distribuição e Metas': aba(null, dolar),
  };
}

function sandbox({ dolar, historicoCambio = {} }) {
  const abas = blocos({ dolar });
  const ss = { getSheetByName: (n) => abas[n] || null };
  const sb = {
    console: { log() {} }, Logger: { log() {} },
    SpreadsheetApp: { getActiveSpreadsheet: () => ss },
    localDistribuicaoMetas_: () => ({ dolar: 'K56' }),
    somarCarteiraRendaFixaPorDestino_: () => ({ ok: false, emergencial: 0, objetivo: 0 }), // 07/10/2026 (Planilha.gs): sem a leitura da aba, Home cai no N6 da planilha
    cotacaoDolarHoje_: () => (typeof dolar === 'number' && dolar > 0 ? dolar : null), // mesma regra de Planilha.gs
    mapaCambioHistoricoAporte_: () => ({ mapa: historicoCambio, chaves: Object.keys(historicoCambio).sort() }),
    chaveDiaISOInicio_: () => '2026-10-05',
    arredondar2Inicio_: (v) => Math.round(v * 100) / 100,
    arredondarIndiceInicio_: (v) => Math.round(v * 10000) / 10000,
    jsonOut: (x) => x,
  };
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', 'Home.gs'), 'utf8'), { filename: 'Home.gs' }).runInContext(sb);
  return sb;
}

test('A-22: dólar da planilha entra como número; texto, vazio ou erro viram o último dólar guardado (usdDefasado) ou null', () => {
  assert.deepEqual(plain(sandbox({ dolar: 5.2 }).montarHome_().cambio), { usd: 5.2, usdDefasado: false, eur: 6 });
  for (const ruim of ['', '#N/A', 'R$ 5,20', 0, null]) {
    const c = plain(sandbox({ dolar: ruim, historicoCambio: { '2026-10-01': 5.1, '2026-10-02': 5.3 } }).montarHome_().cambio);
    assert.deepEqual([c.usd, c.usdDefasado], [5.3, true], `célula ${JSON.stringify(ruim)}`);
  }
  const semNada = plain(sandbox({ dolar: '' }).montarHome_().cambio);
  assert.deepEqual([semNada.usd, semNada.usdDefasado], [null, false]);
});

test('A-21: montarSerieHistoricoInicioAoVivo_ empalma o último ponto (hoje) com os valores ao vivo dos cards, e nunca derruba', () => {
  const sb = sandbox({ dolar: 5 });
  const ponto = (data, valor) => ({ data, patrimonio: valor, longoPrazo: valor, nacional: valor, rendaEmergencial: 0, acoes: 0, fiis: 0, acoesEua: 0, rendaFixaTotal: 0 });
  sb.montarSerieHistoricoInicio_ = () => [ponto('2026-10-02', 900), ponto('2026-10-05', 950)]; // fechamento do último sync
  const serie = plain(sb.montarSerieHistoricoInicioAoVivo_());
  assert.equal(serie[0].patrimonio, 900, 'dias passados não mudam');
  assert.equal(serie[1].patrimonio, 1000, 'hoje = o mesmo total ao vivo do card da Início');
  assert.equal(serie[1].acoesEua, 200);
  assert.equal(serie[1].cambioUsd, 5);
  // sem dado ao vivo (montarHome_ quebra): devolve a série como veio
  sb.montarHome_ = () => { throw new Error('aba não encontrada'); };
  sb.montarSerieHistoricoInicio_ = () => [ponto('2026-10-05', 950)];
  assert.equal(plain(sb.montarSerieHistoricoInicioAoVivo_())[0].patrimonio, 950);
  // dadosHome já lido por quem chama não lê de novo
  sb.montarHome_ = () => { throw new Error('não devia ler de novo'); };
  const home = { patrimonio: { total: 1234, longoPrazo: 1234, nacional: 1234, rendaEmergencial: 0, porClasse: {} }, indices: {}, cambio: { usd: 5 } };
  assert.equal(plain(sb.montarSerieHistoricoInicioAoVivo_(null, home))[0].patrimonio, 1234);
});
