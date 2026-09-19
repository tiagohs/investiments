// Unit tests for assets/js/pages/carteiras-acoes-eua.js — mesmo molde de
// tests/carteiras-acoes.test.js, mas valores em US$ (a página inteira
// formata em dólar, sem conversão — ver comentário no próprio arquivo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { montarPaginaCarteirasAcoesEua } from '../assets/js/pages/carteiras-acoes-eua.js';

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
    <div class="carteiras-loading" id="acoesEuaLoading"></div>
    <div class="carteiras-erro" id="acoesEuaErro" hidden></div>
    <div id="refreshControlAcoesEua" class="refresh-control"></div>
    <div id="acoesEuaConteudo" hidden></div>
  </body></html>`);
  return dom.window.document;
}

const CARTEIRA_ACOES_EUA_EXEMPLO = {
  classe: 'Ações EUA',
  resumo: {
    totalInvestido: 3001.85,
    totalAtualizado: 3303.79,
    lucroPrejuizo: 301.94,
    percentualLucroPrejuizo: 0.1006,
    proventosTotais: 0,
    quantidadeAtivos: 1,
  },
  distribuicaoPorGrupo: [{ grupo: 'Tecnologia', totalAtualizado: 3303.79, percentual: 1 }],
  ativos: [{
    ticker: 'AAPL', nome: 'Apple Inc.', moeda: 'US$', precoAtual: 220.25, variacaoDia: 0.008,
    quantidade: 15, precoMedio: 200.12, precoTeto: null, vies: null, pvp: 45.2, descontoPvp: null,
    pl: null, descontoPl: null, grupo: 'Tecnologia', dyPercentual: 0.005, dyValor: 1.1,
    totalComprado: 3001.85, totalAtualizado: 3303.79, lucroPrejuizo: 301.94, percentualLucroPrejuizo: 0.1006, proventosTotais: 0,
  }],
  benchmarks: { dolar: 5.142, ibovespa: -0.39, spx: 0.54 }, // ibovespa/spx em variação do dia (%), não pontos
};

test('montarPaginaCarteirasAcoesEua() formata tudo em US$ e mostra o dólar/Ibovespa/SPX como benchmark', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasAcoesEuaImpl = async () => ({ ok: true, carteira: CARTEIRA_ACOES_EUA_EXEMPLO });

    await montarPaginaCarteirasAcoesEua('token-fake', { doc, getCarteirasAcoesEuaImpl });

    assert.equal(doc.getElementById('acoesEuaLoading').hidden, true);
    assert.equal(doc.getElementById('acoesEuaConteudo').hidden, false);
    const html = doc.getElementById('acoesEuaConteudo').innerHTML;
    assert.match(html, /\$3,303\.79/); // formatUSD do total atualizado
    assert.equal(doc.querySelectorAll('.cc-benchmark-chip').length, 3);
    assert.match(html, /R\$ 5,14/); // dólar hoje, formatado em BRL
    assert.equal(doc.querySelectorAll('.cc-tabela tbody tr').length, 1);
  });
});

test('montarPaginaCarteirasAcoesEua() mostra o estado de erro quando o back-end rejeita a chamada', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasAcoesEuaImpl = async () => ({ ok: false, etapa: 'carteirasAcoesEua', erro: 'câmbio indisponível' });

    await montarPaginaCarteirasAcoesEua('token-fake', { doc, getCarteirasAcoesEuaImpl });

    assert.equal(doc.getElementById('acoesEuaConteudo').hidden, true);
    assert.equal(doc.getElementById('acoesEuaErro').hidden, false);
    assert.match(doc.getElementById('acoesEuaErro').textContent, /câmbio indisponível/);
  });
});

test('montarPaginaCarteirasAcoesEua(): clicar em "Atualizar dados" busca de novo', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    let chamadas = 0;
    const getCarteirasAcoesEuaImpl = async () => { chamadas += 1; return { ok: true, carteira: CARTEIRA_ACOES_EUA_EXEMPLO }; };

    await montarPaginaCarteirasAcoesEua('token-fake', { doc, getCarteirasAcoesEuaImpl });
    doc.getElementById('refreshControlAcoesEua').querySelector('.refresh-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    assert.equal(chamadas, 2);
  });
});
