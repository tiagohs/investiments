// Unit tests for assets/js/pages/carteiras-fiis.js — mesmo molde de
// tests/carteiras-acoes.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { montarPaginaCarteirasFiis } from '../assets/js/pages/carteiras-fiis.js';

function withFakeSessionStorage(run) {
  const store = new Map();
  globalThis.sessionStorage = {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
  return run(store).finally(() => { delete globalThis.sessionStorage; });
}

function makeDom() {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="carteiras-loading" id="fiisLoading"></div>
    <div class="carteiras-erro" id="fiisErro" hidden></div>
    <div id="refreshControlFiis" class="refresh-control"></div>
    <div id="fiisConteudo" hidden></div>
  </body></html>`);
  return dom.window.document;
}

const CARTEIRA_FIIS_EXEMPLO = {
  classe: 'FIIs',
  resumo: {
    totalInvestido: 39071.39,
    totalAtualizado: 35577.49,
    lucroPrejuizo: -3493.9,
    percentualLucroPrejuizo: -0.0894,
    proventosTotais: 1580.2,
    quantidadeAtivos: 1,
  },
  distribuicaoPorGrupo: [{ grupo: 'Logística', totalAtualizado: 35577.49, percentual: 1 }],
  ativos: [{
    ticker: 'HGLG11', nome: 'CSHG Logística', moeda: 'R$', precoAtual: 162.5, variacaoDia: -0.003,
    quantidade: 218, precoMedio: 179.2, precoTeto: 170, vies: 'Aguardar', pvp: 0.95, descontoPvp: null,
    pl: null, descontoPl: null, grupo: 'Logística', dyPercentual: 0.08, dyValor: 13,
    totalComprado: 39071.39, totalAtualizado: 35577.49, lucroPrejuizo: -3493.9, percentualLucroPrejuizo: -0.0894,
    proventosTotais: 1580.2, liquidezDiaria: 850000, percentualEmCaixa: 0.02, patrimonio: 1200000000,
  }],
  benchmarks: { ifix: 3350 },
};

test('montarPaginaCarteirasFiis() renderiza resumo/benchmarks/donut/tabela, inclusive com prejuízo (classe "bad")', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasFiisImpl = async () => ({ ok: true, carteira: CARTEIRA_FIIS_EXEMPLO });

    await montarPaginaCarteirasFiis('token-fake', { doc, getCarteirasFiisImpl });

    assert.equal(doc.getElementById('fiisLoading').hidden, true);
    assert.equal(doc.getElementById('fiisConteudo').hidden, false);
    assert.equal(doc.querySelectorAll('.cc-tile.bad').length, 1);
    assert.equal(doc.querySelectorAll('.cc-benchmark-chip').length, 1);
    assert.match(doc.getElementById('fiisConteudo').innerHTML, /IFIX/);
    assert.equal(doc.querySelectorAll('.cc-tabela tbody tr').length, 1);
    // coluna extra de FIIs (% em caixa) aparece
    assert.match(doc.getElementById('fiisConteudo').innerHTML, /% em caixa/);
  });
});

test('montarPaginaCarteirasFiis() mostra o estado de erro quando o back-end rejeita a chamada', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasFiisImpl = async () => ({ ok: false, etapa: 'carteirasFiis', erro: 'falha ao ler Carteira FIIs' });

    await montarPaginaCarteirasFiis('token-fake', { doc, getCarteirasFiisImpl });

    assert.equal(doc.getElementById('fiisConteudo').hidden, true);
    assert.equal(doc.getElementById('fiisErro').hidden, false);
    assert.match(doc.getElementById('fiisErro').textContent, /falha ao ler Carteira FIIs/);
  });
});

test('montarPaginaCarteirasFiis(): clicar em "Atualizar dados" busca de novo', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    let chamadas = 0;
    const getCarteirasFiisImpl = async () => { chamadas += 1; return { ok: true, carteira: CARTEIRA_FIIS_EXEMPLO }; };

    await montarPaginaCarteirasFiis('token-fake', { doc, getCarteirasFiisImpl });
    doc.getElementById('refreshControlFiis').querySelector('.refresh-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    assert.equal(chamadas, 2);
  });
});
