// tests/harness/limpar-cache.test.js
//
// 25/09/2026 (Tiago: "ao clicar em limpar cache, ainda to recebendo cache
// de quando entro em uma tela de ativo"): o botão "Limpar cache" também
// apaga as notícias de cada ativo guardadas no CacheService (Ativo.gs).
// Sem planilha real - CacheService/planilha falsos, tickers inventados.
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
    Logger: { log() {} },
    CacheService: {
      getScriptCache: () => ({
        get: (k) => (guardado.has(k) ? guardado.get(k) : null),
        put: (k, v) => { guardado.set(k, v); },
        removeAll: (ks) => { ks.forEach((k) => guardado.delete(k)); },
      }),
    },
    UrlFetchApp: {
      fetch: () => ({ getResponseCode: () => 200, getContentText: () => '<rss><channel><item><title>Notícia X</title><link>https://exemplo.com/x</link><pubDate>Thu, 24 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>' }),
    },
  };
  vm.createContext(sb);
  new vm.Script(fs.readFileSync(path.join(ROOT, 'apps-script', 'Ativo.gs'), 'utf8'), { filename: 'Ativo.gs' }).runInContext(sb);
  return { sb, guardado };
}

function planilhaCom(tickers) {
  const linhas = [['Classe', 'Ticker'], ...tickers.map((t) => ['x', t])];
  const aba = {
    getLastRow: () => linhas.length,
    getRange: (r1, c1, n) => ({ getValues: () => linhas.slice(r1 - 1, r1 - 1 + n).map((l) => [l[c1 - 1]]) }),
  };
  return { getSheetByName: (nome) => (nome === 'Auxiliar_ativos' ? aba : null) };
}

test('Limpar cache: apaga as notícias guardadas de cada ativo da carteira (mesma chave que buscarNoticiasAtivo_ grava)', () => {
  const { sb, guardado } = sandbox();
  sb.buscarNoticiasAtivo_('abcd3', 'Empresa Exemplo', 'acoes');
  sb.buscarNoticiasAtivo_('WXYZ11', 'Fundo Exemplo', 'fiis');
  assert.equal(guardado.size, 2, 'as duas buscas ficaram em cache');

  const removidas = sb.limparCacheNoticiasAtivos_(planilhaCom(['ABCD3', ' wxyz11 ', '', 'QQQQ']));
  assert.equal(removidas, 3, 'um por ticker preenchido (vazio fica de fora)');
  assert.equal(guardado.size, 0, 'nada de notícia velha sobra');
});

test('Limpar cache: sem a aba Auxiliar_ativos (ou vazia) não quebra', () => {
  const { sb } = sandbox();
  assert.equal(sb.limparCacheNoticiasAtivos_({ getSheetByName: () => null }), 0);
  assert.equal(sb.limparCacheNoticiasAtivos_(planilhaCom([])), 0);
});
