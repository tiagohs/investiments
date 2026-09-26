// tests/harness/intradia.test.js
//
// 26/09/2026: apps-script/Intradia.gs (gráfico do dia da Início). Sem rede e
// sem planilha: resposta do Yahoo inventada, UrlFetchApp/CacheService falsos.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');

function sandbox() {
  const guardado = new Map();
  const sb = {
    console: { ...console, log() {} },
    CacheService: {
      getScriptCache: () => ({
        getAll: (ks) => Object.fromEntries(ks.filter((k) => guardado.has(k)).map((k) => [k, guardado.get(k)])),
        putAll: (obj) => { Object.entries(obj).forEach(([k, v]) => guardado.set(k, v)); },
      }),
    },
    jsonOut: (o) => o,
  };
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', 'Intradia.gs'), 'utf8'), { filename: 'Intradia.gs' }).runInContext(sb);
  return { sb, guardado };
}

// Pregão inventado: 25/09/2026 10:00-17:00 em São Paulo (UTC-3) = 13:00-20:00 UTC.
const INICIO = Date.UTC(2026, 8, 25, 13, 0) / 1000;
const FIM = Date.UTC(2026, 8, 25, 20, 0) / 1000;
function yahooFake({ pontos = 5, anterior = 10, moeda = 'BRL', passoMin = 5, nulos = [] } = {}) {
  const timestamp = Array.from({ length: pontos }, (_, i) => INICIO + i * passoMin * 60);
  const close = timestamp.map((_, i) => (nulos.includes(i) ? null : 10 + i * 0.1));
  return {
    chart: { result: [{
      meta: { currency: moeda, regularMarketPrice: close.filter((c) => c != null).at(-1), chartPreviousClose: anterior, gmtoffset: -10800,
        currentTradingPeriod: { regular: { start: INICIO, end: FIM } } },
      timestamp,
      indicators: { quote: [{ close }] },
    }] },
  };
}
const resposta = (codigo, corpo) => ({ getResponseCode: () => codigo, getContentText: () => JSON.stringify(corpo) });

test('simboloYahooIntradia_(): índices, câmbio, ações/FIIs (.SA), EUA e o que não tem pregão', () => {
  const { sb } = sandbox();
  assert.equal(sb.simboloYahooIntradia_('IBOV'), '^BVSP');
  assert.equal(sb.simboloYahooIntradia_('ifix'), 'IFIX.SA');
  assert.equal(sb.simboloYahooIntradia_('SPX'), '^GSPC');
  assert.equal(sb.simboloYahooIntradia_('USD'), 'BRL=X');
  assert.equal(sb.simboloYahooIntradia_('EUR'), 'EURBRL=X');
  assert.equal(sb.simboloYahooIntradia_('acoes:aaaa3'), 'AAAA3.SA');
  assert.equal(sb.simboloYahooIntradia_('fiis:BBBB11'), 'BBBB11.SA');
  assert.equal(sb.simboloYahooIntradia_('usa:CCCC'), 'CCCC');
  assert.equal(sb.simboloYahooIntradia_('rf:BRSTNTESTE01'), null);
  assert.equal(sb.simboloYahooIntradia_('acoes:../x?y'), null);
  assert.equal(sb.simboloYahooIntradia_(''), null);
});

test('serieIntradiaDoYahoo_(): minutos desde a abertura, pula nulos, variação sobre o fechamento de ontem, dia no fuso da bolsa', () => {
  const { sb } = sandbox();
  const s = sb.serieIntradiaDoYahoo_(yahooFake({ pontos: 5, nulos: [2] }));
  assert.deepEqual(Array.from(s.t), [0, 5, 15, 20]);
  assert.deepEqual(Array.from(s.v), [10, 10.1, 10.3, 10.4]);
  assert.equal(s.preco, 10.4);
  assert.equal(s.fechamentoAnterior, 10);
  assert.ok(Math.abs(s.variacao - 0.04) < 1e-9);
  assert.equal(s.dia, '2026-09-25');
  assert.equal(s.inicio, INICIO);
  assert.equal(s.fim, FIM);
  assert.equal(s.moeda, 'BRL');
  assert.equal(sb.serieIntradiaDoYahoo_({ chart: { result: null } }), null);
  assert.equal(sb.serieIntradiaDoYahoo_(yahooFake({ pontos: 3, nulos: [0, 1, 2] })), null, 'sem nenhum preço');
});

test('serieIntradiaDoYahoo_(): no máximo ~100 pontos (sempre com o último) e câmbio 24h alarga o "pregão"', () => {
  const { sb } = sandbox();
  const s = sb.serieIntradiaDoYahoo_(yahooFake({ pontos: 250, passoMin: 1 }));
  assert.ok(s.t.length <= 101, `${s.t.length} pontos`);
  assert.equal(s.t.at(-1), 249, 'último ponto mantido');
  const fx = yahooFake({ pontos: 3 });
  fx.chart.result[0].timestamp = [INICIO - 3600, INICIO, FIM + 3600];
  const sfx = sb.serieIntradiaDoYahoo_(fx);
  assert.equal(sfx.inicio, INICIO - 3600);
  assert.equal(sfx.fim, FIM + 3600);
});

test('intradia_(): busca em lote, tenta o 2º host no que falhou, renda fixa vem null e guarda em cache (5 min)', () => {
  const { sb, guardado } = sandbox();
  const lotes = [];
  const fetchAll = (pedidos) => {
    lotes.push(Array.from(pedidos, (p) => p.url));
    return pedidos.map((p) => {
      if (p.url.includes('ZZZZ3') && p.url.includes('query1')) return resposta(500, {});
      if (p.url.includes('QQQQ3')) return resposta(404, {});
      return resposta(200, yahooFake());
    });
  };
  const r = sb.intradia_(['IBOV', 'acoes:ZZZZ3', 'acoes:QQQQ3', 'rf:X'], { fetchAll });
  assert.equal(lotes.length, 2);
  assert.equal(lotes[0].length, 3, 'renda fixa nem é pedida');
  assert.ok(lotes[0][0].startsWith('https://query1.finance.yahoo.com/v8/finance/chart/%5EBVSP?range=1d&interval=5m'));
  assert.deepEqual(lotes[1].map((u) => u.match(/chart\/([^?]+)/)[1]), ['ZZZZ3.SA', 'QQQQ3.SA']);
  assert.ok(lotes[1][0].startsWith('https://query2.'));
  assert.ok(r.IBOV && r['acoes:ZZZZ3']);
  assert.equal(r['acoes:QQQQ3'], null);
  assert.equal(r['rf:X'], null);
  assert.deepEqual([...guardado.keys()].sort(), ['intradia_v1_IBOV', 'intradia_v1_acoes:ZZZZ3'], 'falha não vai pro cache');

  // 2ª chamada: o que está em cache não busca de novo
  lotes.length = 0;
  const r2 = sb.intradia_(['IBOV', 'acoes:QQQQ3'], { fetchAll });
  assert.deepEqual(lotes.map((l) => l.length), [1, 1], 'só o que faltava (QQQQ3) nos 2 hosts');
  assert.equal(r2.IBOV.dia, '2026-09-25');
});

test('handleIntradia(): lê "simbolos", ignora vazios e responde { ok, resultado }', () => {
  const { sb } = sandbox();
  let pedidas = null;
  sb.intradia_ = (chaves) => { pedidas = chaves; return {}; };
  const out = sb.handleIntradia({ parameter: { simbolos: ' IBOV, ,usa:CCCC,' } });
  assert.deepEqual(Array.from(pedidas), ['IBOV', 'usa:CCCC']);
  assert.equal(out.ok, true);
  sb.intradia_ = () => { throw new Error('quebrou'); };
  const erro = sb.handleIntradia({ parameter: { simbolos: 'IBOV' } });
  assert.equal(erro.ok, false);
  assert.equal(erro.etapa, 'intradia');
});
