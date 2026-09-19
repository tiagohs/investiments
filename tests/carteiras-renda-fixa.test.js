// Unit tests for assets/js/pages/carteiras-renda-fixa.js — mesmo molde de
// tests/carteiras-acoes.test.js, mas com o formato de ativo bem
// diferente (indexador/vencimento/rentabilidade contratada/IR).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { montarPaginaCarteirasRendaFixa } from '../assets/js/pages/carteiras-renda-fixa.js';

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
    <div class="carteiras-loading" id="rendaFixaLoading"></div>
    <div class="carteiras-erro" id="rendaFixaErro" hidden></div>
    <div id="refreshControlRendaFixa" class="refresh-control"></div>
    <div id="rendaFixaConteudo" hidden></div>
  </body></html>`);
  return dom.window.document;
}

const CARTEIRA_RF_EXEMPLO = {
  resumo: {
    totalInvestido: 54900.56,
    totalAtualizado: 65700.72,
    lucroPrejuizo: 10800.16,
    percentualLucroPrejuizo: 0.1967,
    quantidadeAtivos: 2,
  },
  benchmarks: { cdi: 0.134, selic: 0.125, ipca: 0.045 },
  distribuicaoPorIndexador: [
    { grupo: 'CDI', totalAtualizado: 40000, percentual: 0.609 },
    { grupo: 'IPCA+', totalAtualizado: 25700.72, percentual: 0.391 },
  ],
  ativos: [
    {
      codigo: 'CDB001', nomePersonalizado: 'CDB Banco X', tipoInvestimento: 'CDB', indexador: 'CDI',
      instituicao: 'Banco X', tipoCarteira: 'longo-prazo', quantidade: 1, vencimento: '03/2028',
      totalInvestido: 30000, totalAtualizado: 40000,
      rentabilidadeContratada: { indice: 'CDI', numeroDeLotes: 1, texto: '112% do CDI' },
      irSeResgatasseHoje: { impostoSeResgatasseHoje: 800, valorLiquidoSeResgatasseHoje: 39200, precisao: 'exata', detalhes: null },
    },
    {
      codigo: 'TES002', nomePersonalizado: 'Tesouro IPCA+ 2035', tipoInvestimento: 'Tesouro IPCA+', indexador: 'IPCA+',
      instituicao: 'Tesouro Direto', tipoCarteira: 'emergencial', quantidade: 1, vencimento: '05/2035',
      totalInvestido: 24900.56, totalAtualizado: 25700.72,
      rentabilidadeContratada: { indice: 'IPCA', numeroDeLotes: 1, texto: 'IPCA + 6,1%' },
      irSeResgatasseHoje: null,
    },
  ],
};

test('montarPaginaCarteirasRendaFixa() renderiza resumo/benchmarks/donut/tabela com os campos próprios de Renda Fixa', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasRendaFixaImpl = async () => ({ ok: true, carteira: CARTEIRA_RF_EXEMPLO });

    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl });

    assert.equal(doc.getElementById('rendaFixaLoading').hidden, true);
    assert.equal(doc.getElementById('rendaFixaConteudo').hidden, false);
    const html = doc.getElementById('rendaFixaConteudo').innerHTML;
    assert.equal(doc.querySelectorAll('.cc-benchmark-chip').length, 3); // CDI/Selic/IPCA
    assert.equal(doc.querySelectorAll('.cc-tabela tbody tr').length, 2);
    assert.match(html, /Reserva de emergência/);
    assert.match(html, /Longo prazo/);
    assert.match(html, /112% do CDI/);
    assert.match(html, /IPCA \+ 6,1%/);
    assert.match(html, /39\.200,00/); // valor líquido de IR da posição CDB001
  });
});

test('montarPaginaCarteirasRendaFixa(): posição sem irSeResgatasseHoje calculado mostra travessão em vez de quebrar', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasRendaFixaImpl = async () => ({ ok: true, carteira: CARTEIRA_RF_EXEMPLO });
    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl });

    const linhas = doc.querySelectorAll('.cc-tabela tbody tr');
    // ordenado por totalAtualizado desc: CDB001 (40000) antes de TES002 (25700.72)
    assert.match(linhas[0].textContent, /CDB Banco X/);
    assert.match(linhas[1].textContent, /Tesouro IPCA\+ 2035/);
    assert.match(linhas[1].textContent, /—/); // TES002 não tem irSeResgatasseHoje
  });
});

test('montarPaginaCarteirasRendaFixa() mostra o estado de erro quando o back-end rejeita a chamada', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    const getCarteirasRendaFixaImpl = async () => ({ ok: false, etapa: 'carteirasRendaFixa', erro: 'aba não encontrada' });

    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl });

    assert.equal(doc.getElementById('rendaFixaConteudo').hidden, true);
    assert.equal(doc.getElementById('rendaFixaErro').hidden, false);
    assert.match(doc.getElementById('rendaFixaErro').textContent, /aba não encontrada/);
  });
});

test('montarPaginaCarteirasRendaFixa(): clicar em "Atualizar dados" busca de novo', async () => {
  await withFakeSessionStorage(async () => {
    const doc = makeDom();
    let chamadas = 0;
    const getCarteirasRendaFixaImpl = async () => { chamadas += 1; return { ok: true, carteira: CARTEIRA_RF_EXEMPLO }; };

    await montarPaginaCarteirasRendaFixa('token-fake', { doc, getCarteirasRendaFixaImpl });
    doc.getElementById('refreshControlRendaFixa').querySelector('.refresh-btn').dispatchEvent(new doc.defaultView.Event('click', { bubbles: true }));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();

    assert.equal(chamadas, 2);
  });
});
