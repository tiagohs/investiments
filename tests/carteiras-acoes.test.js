// Unit tests for assets/js/pages/carteiras-acoes.js. Mesmo padrão de
// tests/distribuicoes-metas.test.js: DOM mínimo com os ids reais de
// carteiras/index.html, impls falsas em vez de fetch/token de verdade.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { montarPaginaCarteirasAcoes } from '../assets/js/pages/carteiras-acoes.js';

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
    <div class="carteiras-loading" id="acoesLoading"></div>
    <div class="carteiras-erro" id="acoesErro" hidden></div>
    <div id="refreshControlAcoes" class="refresh-control"></div>
    <div id="acoesConteudo" hidden></div>
  </body></html>`);
  return dom.window.document;
}

const CARTEIRA_ACOES_EXEMPLO = {
  classe: 'Ações',
  resumo: {
    totalInvestido: 25657.39,
    totalAtualizado: 29968.4,
    lucroPrejuizo: 4311.01,
    percentualLucroPrejuizo: 0.168,
    proventosTotais: 812.5,
    quantidadeAtivos: 2,
  },
  distribuicaoPorGrupo: [
    { grupo: 'Bancos', totalAtualizado: 18000, percentual: 0.6 },
    { grupo: 'Energia', totalAtualizado: 11968.4, percentual: 0.4 },
  ],
  ativos: [
    {
      ticker: 'BBAS3', nome: 'Banco do Brasil', moeda: 'R$', precoAtual: 28.5, variacaoDia: 0.012,
      quantidade: 300, precoMedio: 24.1, precoTeto: 30, vies: 'Comprar', pvp: 0.9, descontoPvp: null,
      pl: 5.2, descontoPl: null, grupo: 'Bancos', dyPercentual: 0.09, dyValor: 2.5,
      totalComprado: 7230, totalAtualizado: 8550, lucroPrejuizo: 1320, percentualLucroPrejuizo: 0.1826, proventosTotais: 400,
    },
    {
      ticker: 'EGIE3', nome: 'Engie Brasil', moeda: 'R$', precoAtual: 42.1, variacaoDia: -0.004,
      quantidade: 500, precoMedio: 36.85, precoTeto: 40, vies: 'Aguardar', pvp: 2.1, descontoPvp: null,
      pl: 14.3, descontoPl: null, grupo: 'Energia', dyPercentual: 0.06, dyValor: 2.5,
      totalComprado: 18425, totalAtualizado: 21050, lucroPrejuizo: 2625, percentualLucroPrejuizo: 0.1425, proventosTotais: 412.5,
    },
  ],
  benchmarks: { ibovespa: 128430, cdi: 0.134 },
};

test('montarPaginaCarteirasAcoes() renderiza resumo/benchmarks/donut/tabela e esconde o loading no sucesso', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasAcoesImpl = async () => ({ ok: true, carteira: CARTEIRA_ACOES_EXEMPLO });

    await montarPaginaCarteirasAcoes('token-fake', { doc, getCarteirasAcoesImpl });

    assert.equal(doc.getElementById('acoesLoading').hidden, true);
    assert.equal(doc.getElementById('acoesConteudo').hidden, false);
    assert.equal(doc.getElementById('acoesErro').hidden, true);
    assert.equal(doc.querySelectorAll('.cc-tile').length, 5); // 4 + proventos
    assert.equal(doc.querySelectorAll('.cc-benchmark-chip').length, 2);
    assert.equal(doc.querySelectorAll('.cc-tabela tbody tr').length, 2);
    // ordenado por totalAtualizado desc: EGIE3 (21050) antes de BBAS3 (8550)
    const linhas = doc.querySelectorAll('.cc-tabela tbody tr');
    assert.match(linhas[0].textContent, /EGIE3/);
    assert.match(linhas[1].textContent, /BBAS3/);
    // status "Comprar"/"Aguardar" aparecem na tabela
    assert.match(doc.getElementById('acoesConteudo').innerHTML, /Comprar/);
    assert.match(doc.getElementById('acoesConteudo').innerHTML, /Aguardar/);
  });
});

test('montarPaginaCarteirasAcoes() mostra o estado de erro quando o back-end rejeita a chamada', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasAcoesImpl = async () => ({ ok: false, etapa: 'carteirasAcoes', erro: 'aba não encontrada' });

    await montarPaginaCarteirasAcoes('token-fake', { doc, getCarteirasAcoesImpl });

    assert.equal(doc.getElementById('acoesLoading').hidden, true);
    assert.equal(doc.getElementById('acoesConteudo').hidden, true);
    assert.equal(doc.getElementById('acoesErro').hidden, false);
    assert.match(doc.getElementById('acoesErro').textContent, /aba não encontrada/);
  });
});

test('montarPaginaCarteirasAcoes() grava no cache no sucesso e reaproveita numa 2ª montagem (stale-while-revalidate)', async () => {
  await withFakeSessionStorage(async () => {
    const doc1 = makeDom();
    let chamadas = 0;
    const getCarteirasAcoesImpl = async () => {
      chamadas += 1;
      return { ok: true, carteira: CARTEIRA_ACOES_EXEMPLO };
    };
    await montarPaginaCarteirasAcoes('token-fake', { doc: doc1, getCarteirasAcoesImpl });
    assert.equal(chamadas, 1);

    // "2ª visita" (documento novo, mesmo sessionStorage) - o cache da 1ª
    // chamada já deveria estar disponível ANTES do fetch fresco responder.
    const doc2 = makeDom();
    let resolverFetch;
    const getCarteirasAcoesImplLento = () => new Promise((resolve) => { resolverFetch = resolve; });

    const montagem = montarPaginaCarteirasAcoes('token-fake', { doc: doc2, getCarteirasAcoesImpl: getCarteirasAcoesImplLento });
    await Promise.resolve();
    await Promise.resolve();

    // Cache já desenhado, mesmo com o fetch novo ainda pendente.
    assert.equal(doc2.getElementById('acoesConteudo').hidden, false);
    assert.equal(doc2.querySelectorAll('.cc-tabela tbody tr').length, 2);

    resolverFetch({ ok: true, carteira: CARTEIRA_ACOES_EXEMPLO });
    await montagem;
  });
});

test('montarPaginaCarteirasAcoes(): clicar em "Atualizar dados" busca de novo e redesenha', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    let chamadas = 0;
    const getCarteirasAcoesImpl = async () => {
      chamadas += 1;
      return {
        ok: true,
        carteira: {
          ...CARTEIRA_ACOES_EXEMPLO,
          resumo: { ...CARTEIRA_ACOES_EXEMPLO.resumo, quantidadeAtivos: chamadas === 1 ? 2 : 3 },
        },
      };
    };

    await montarPaginaCarteirasAcoes('token-fake', { doc, getCarteirasAcoesImpl });
    assert.equal(chamadas, 1);

    doc.getElementById('refreshControlAcoes').querySelector('.refresh-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    assert.equal(chamadas, 2);
    assert.match(doc.getElementById('acoesConteudo').innerHTML, /3/);
  });
});
